import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
  useIsMutating,
} from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { api, native } from "./bridge";
import { desktopApi, newerOperation } from "./desktop-api";
import { newerCatalog } from "./catalog-state";
import type {
  UpdateView,
  OperationState,
  CleanupRecord,
  Progress,
  CatalogReport,
  IndexStatus,
} from "./types";
export function useDisk() {
  return useQuery({
    queryKey: ["disk"],
    queryFn: api.disk,
    refetchInterval: 10_000,
    staleTime: 5000,
    retry: 1,
  });
}
export function useHistory() {
  return useQuery({
    queryKey: ["history"],
    queryFn: api.history,
    staleTime: 30_000,
  });
}
function useWorkspaceValue() {
  const client = useQueryClient();
  const operation = useQuery({
    queryKey: ["operation"],
    queryFn: async () => {
      const incoming = await desktopApi.operation();
      return newerOperation(
        client.getQueryData<OperationState>(["operation"]),
        incoming,
      );
    },
    staleTime: Infinity,
    refetchInterval: 2000,
  });
  const defaults = useQuery({
    queryKey: ["default-roots"],
    queryFn: api.roots,
  });
  const report = useQuery({
    queryKey: ["scan"],
    queryFn: api.lastScan,
    staleTime: Infinity,
  });
  const [overrides, setOverrides] = useState<string[] | null>(() => {
    try {
      const data = JSON.parse(localStorage.getItem("folga.roots") ?? "null");
      return Array.isArray(data) && data.every((v) => typeof v === "string")
        ? data
        : null;
    } catch {
      return null;
    }
  });
  const roots = overrides ?? defaults.data ?? [];
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!report.data) return;
    const valid = new Set(report.data.candidates.filter((c) => !c.blocked).map((c) => c.id));
    setSelected((old) => {
      const next = new Set([...old].filter((id) => valid.has(id)));
      return next.size === old.size ? old : next;
    });
  }, [report.data]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [notice, setNotice] = useState("");
  const [lastResult, setLastResult] = useState<CleanupRecord | null>(null);
  const [filter, setFilter] = useState("all");
  const scan = useMutation({
    mutationFn: () => api.scan(roots),
    onMutate: () => {
      setProgress(null);
      setNotice("");
      setLastResult(null);
    },
    onSuccess: (data) => {
      client.setQueryData(["scan"], data);
      setSelected(new Set());
      setFilter("all");
    },
    onError: (e) => setNotice(String(e)),
  });
  const clean = useMutation({
    mutationFn: ({ dockerConfirmation }: { dockerConfirmation: string }) =>
      api.clean(report.data!.id, [...selected], dockerConfirmation),
    onMutate: () => setNotice(""),
    onSuccess: async (data) => {
      setLastResult(data);
      await client.cancelQueries({ queryKey: ["scan"] });
      const removed = new Set(data.removed);
      const next = report.data ? { ...report.data, candidates: report.data.candidates.filter((c) => !removed.has(c.path)) } : null;
      client.setQueryData(["scan"], next);
      void client.invalidateQueries({ queryKey: ["scan"] });
      void client.invalidateQueries({ queryKey: ["disk"] });
      void client.invalidateQueries({ queryKey: ["history"] });
    },
    onError: (e) => setNotice(String(e)),
  });
  const map = useMutation({
    mutationFn: api.map,
    onMutate: () => {
      setProgress(null);
      setNotice("");
    },
    onError: (e) => setNotice(String(e)),
  });
  const mutating = useIsMutating();
  const busy = mutating > 0 || !!operation.data?.running;
  const setRoots = (values: string[]) => {
    setOverrides(values);
    localStorage.setItem("folga.roots", JSON.stringify(values));
    client.setQueryData(["scan"], null);
    setSelected(new Set());
  };
  const feedback = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (e) {
      setNotice(String(e));
    }
  };
  useEffect(() => {
    if (!native) return;
    const subscriptions = [
      listen<CatalogReport>("catalog-changed", (e) => {
        client.setQueryData<CatalogReport | null>(["catalog"], (old) => newerCatalog(old, e.payload));
        void client.invalidateQueries({ queryKey: ["catalog-children"] });
        void client.invalidateQueries({ queryKey: ["duplicates"] });
      }),
      listen<IndexStatus>("index-status", (e) => client.setQueryData(["index-status"], e.payload)),
      listen<UpdateView>("updates-changed", (e) =>
        client.setQueryData(["updates"], e.payload),
      ),
      listen<OperationState>("operation-changed", (e) =>
        client.setQueryData<OperationState>(["operation"], (old) =>
          newerOperation(old, e.payload),
        ),
      ),
      listen("data-changed", () => {
        for (const key of [
          "catalog",
          "catalog-children",
          "duplicates",
          "scan",
          "apps",
          "docker",
          "monitor",
          "history",
          "disk",
          "protection",
          "updates",
        ])
          void client.invalidateQueries({ queryKey: [key] });
      }),
      listen<Progress>("scan-progress", (e) => setProgress(e.payload)),
      listen<Progress>("cleanup-progress", (e) => setProgress(e.payload)),
      listen<string>("history-error", (e) => setNotice(e.payload)),
      listen("disk-changed", () => {
        void client.invalidateQueries({ queryKey: ["disk"] });
        void client.invalidateQueries({ queryKey: ["history"] });
      }),
    ];
    return () => {
      for (const promise of subscriptions) void promise.then((stop) => stop());
    };
  }, [client]);
  const scanRequest = useRef(() => {});
  scanRequest.current = () => {
    window.location.hash = "/";
    if (!busy) scan.mutate();
  };
  useEffect(() => {
    if (!native) return;
    const sub = listen("request-scan", () => scanRequest.current());
    return () => {
      void sub.then((stop) => stop());
    };
  }, []);
  return {
    roots,
    setRoots,
    report,
    selected,
    setSelected,
    progress: operation.data?.running ? operation.data.progress : progress,
    operation: operation.data,
    setProgress,
    notice,
    setNotice,
    lastResult,
    scan,
    clean,
    map,
    busy,
    filter,
    setFilter,
    feedback,
  };
}
type Workspace = ReturnType<typeof useWorkspaceValue>;
const Context = createContext<Workspace | null>(null);
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const value = useWorkspaceValue();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useWorkspace() {
  const context = useContext(Context);
  if (!context) throw new Error("Workspace indisponível");
  return context;
}
