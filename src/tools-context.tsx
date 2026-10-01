import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { toolsApi } from "./tools-api";
import { native } from "./bridge";
import { useWorkspace } from "./workspace";
import { desktopApi } from "./desktop-api";
import { newerCatalog, retainSelection, retainDuplicateSelection } from "./catalog-state";
import type { CatalogReport } from "./types";
export function useMonitor() {
  return useQuery({
    queryKey: ["monitor"],
    queryFn: toolsApi.monitor,
    staleTime: 30_000,
  });
}
function useToolsValue() {
  const client = useQueryClient(),
    w = useWorkspace();
  const catalog = useQuery({
    queryKey: ["catalog"],
    queryFn: async () => {
      const incoming = await toolsApi.catalog();
      return newerCatalog(client.getQueryData<CatalogReport | null>(["catalog"]), incoming);
    },
    staleTime: Infinity,
    refetchInterval: native ? 15_000 : false,
  });
  const indexStatus = useQuery({ queryKey: ["index-status"], queryFn: desktopApi.indexStatus, staleTime: Infinity, refetchInterval: native ? 5000 : false });
  const [fileSelection, setFileSelection] = useState<Set<string>>(new Set()),
    [duplicateSelection, setDuplicateSelection] = useState<Set<string>>(
      new Set(),
    );
  const appReport = useQuery({
    queryKey: ["apps"],
    queryFn: desktopApi.apps,
    staleTime: Infinity,
  });
  const dockerReport = useQuery({
    queryKey: ["docker"],
    queryFn: desktopApi.docker,
    staleTime: Infinity,
  });
  const duplicateReport = useQuery({ queryKey: ["duplicates"], queryFn: toolsApi.lastDuplicates, staleTime: Infinity });
  const duplicates = duplicateReport.data ?? null;
  const apps = appReport.data ?? null,
    docker = dockerReport.data ?? null;
  useEffect(() => {
    setFileSelection((old) => retainSelection(old, catalog.data?.files ?? []));
  }, [catalog.data]);
  useEffect(() => {
    setDuplicateSelection((old) => retainDuplicateSelection(old, duplicates));
  }, [duplicates]);
  const fail = (e: Error) => w.setNotice(String(e));
  const scan = useMutation({
    mutationFn: toolsApi.scan,
    onMutate: () => {
      w.setNotice("");
      w.setProgress(null);
    },
    onError: fail,
    onSuccess: (r) => {
      client.setQueryData(["catalog"], r);
      void client.invalidateQueries({ queryKey: ["duplicates"] });
      void client.invalidateQueries({ queryKey: ["monitor"] });
    },
  });
  const find = useMutation({
    mutationFn: () => toolsApi.duplicates(catalog.data!.id),
    onMutate: () => {
      w.setNotice("");
      w.setProgress(null);
    },
    onError: fail,
    onSuccess: (g) => {
      client.setQueryData(["duplicates"], g);
      void client.invalidateQueries({ queryKey: ["catalog"] });
    },
  });
  const done = () => {
    void client.invalidateQueries({ queryKey: ["disk"] });
    void client.invalidateQueries({ queryKey: ["history"] });
  };
  const trash = useMutation({
    mutationFn: (duplicateMode: boolean) =>
      toolsApi.trash(
        catalog.data!.id,
        [...(duplicateMode ? duplicateSelection : fileSelection)],
        duplicateMode,
      ),
    onMutate: () => {
      w.setNotice("");
      w.setProgress(null);
    },
    onError: fail,
    onSuccess: async (r) => {
      await client.cancelQueries({ queryKey: ["catalog"] });
      const incoming = await toolsApi.catalog();
      client.setQueryData<CatalogReport | null>(["catalog"], (old) => newerCatalog(old, incoming));
      void client.invalidateQueries({ queryKey: ["duplicates"] });
      void client.invalidateQueries({ queryKey: ["catalog-children"] });
      w.setNotice(
        `${r.removed.length} itens enviados à Lixeira. ${r.skipped.length} preservados. Abra o Histórico para conferir e recuperar.`,
      );
      done();
    },
  });
  const scanApps = useMutation({
    mutationFn: toolsApi.apps,
    onMutate: () => {
      w.setNotice("");
      w.setProgress(null);
    },
    onError: fail,
    onSuccess: (r) => client.setQueryData(["apps"], r),
  });
  const trashApps = useMutation({
    mutationFn: (ids: string[]) => toolsApi.trashApps(apps!.id, ids),
    onMutate: () => {
      w.setNotice("");
      w.setProgress(null);
    },
    onError: fail,
    onSuccess: (r) => {
      client.setQueryData(["apps"], null);
      w.setNotice(
        `${r.removed.length} itens enviados à Lixeira; ${r.skipped.length} preservados. Confira o Histórico.`,
      );
      done();
    },
  });
  const scanDocker = useMutation({
    mutationFn: toolsApi.docker,
    onMutate: () => {
      w.setNotice("");
      w.setProgress(null);
    },
    onError: fail,
    onSuccess: (r) => client.setQueryData(["docker"], r),
  });
  const cleanDocker = useMutation({
    mutationFn: ({ ids, phrase }: { ids: string[]; phrase: string }) =>
      toolsApi.cleanDocker(docker!.id, ids, phrase),
    onMutate: () => {
      w.setNotice("");
      w.setProgress(null);
    },
    onError: fail,
    onSuccess: (r) => {
      client.setQueryData(["docker"], null);
      w.setNotice(
        `${r.removed.length} recursos Docker removidos; ${r.skipped.length} preservados. Confira o Histórico.`,
      );
      done();
    },
  });
  useEffect(() => {
    if (!native) return;
    const sub = listen("monitor-changed", () => {
      void client.invalidateQueries({ queryKey: ["monitor"] });
    });
    return () => {
      void sub.then((stop) => stop());
    };
  }, [client]);
  return {
    catalog,
    indexStatus,
    scan,
    find,
    duplicates,
    trash,
    fileSelection,
    setFileSelection,
    duplicateSelection,
    setDuplicateSelection,
    apps,
    scanApps,
    trashApps,
    docker,
    scanDocker,
    cleanDocker,
  };
}
const Context = createContext<ReturnType<typeof useToolsValue> | null>(null);
export function ToolsProvider({ children }: { children: ReactNode }) {
  const value = useToolsValue();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useTools() {
  const t = useContext(Context);
  if (!t) throw new Error("Ferramentas indisponíveis");
  return t;
}
