import { invoke, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { DiskInfo, ScanReport, CleanupRecord, FolderInfo } from "./types";
export const native = isTauri();
const GB = 1_000_000_000;
const demoDisk: DiskInfo = {
  total: 494 * GB,
  free: 101 * GB,
  used: 393 * GB,
  volume: "Macintosh HD",
  home: "/Users/voce",
};
const demos = [
  ["rust", "~/Projetos/tesselapp/target/debug", 14.4],
  ["xcode", "~/Library/Developer/Xcode/DerivedData", 4.6],
  ["next", "~/Projetos/portal/.next/dev/cache", 3.8],
  ["npm", "~/.npm/_cacache", 0.52],
  ["python", "~/.cache/uv", 0.44],
  [
    "docker",
    "~/Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw",
    12.1,
  ],
];
export const api = {
  disk: () =>
    native ? invoke<DiskInfo>("get_disk_info") : Promise.resolve(demoDisk),
  roots: () =>
    native
      ? invoke<string[]>("get_default_roots")
      : Promise.resolve(["~/Projetos", "~/.codex/worktrees", "/private/tmp"]),
  lastScan: () =>
    native ? invoke<ScanReport | null>("get_last_scan") : Promise.resolve(null),
  history: () =>
    native ? invoke<CleanupRecord[]>("get_history") : Promise.resolve([]),
  scan: async (roots: string[]): Promise<ScanReport> => {
    if (native) return invoke<ScanReport>("scan_disk", { roots });
    await new Promise((r) => setTimeout(r, 900));
    return {
      id: "preview",
      candidates: demos.map(([category, path, size], i) => ({
        id: String(i),
        path: String(path),
        label:
          category === "rust"
            ? "Build Rust de desenvolvimento"
            : category === "docker"
              ? "Disco Docker · todos os dados"
              : "Cache de desenvolvimento",
        category: String(category),
        bytes: Number(size) * GB,
        files: 1400 - i * 172,
        risk: category === "docker" ? "data" : "cache",
        blocked: null,
      })),
      warnings: [],
      scannedDirs: 342,
      elapsedMs: 900,
      roots,
      createdAt: Date.now() / 1000,
    };
  },
  clean: (scanId: string, ids: string[], dockerConfirmation: string) => {
    if (!native)
      return Promise.reject(
        new Error("A prévia não executa limpeza. Abra o app Space."),
      );
    return invoke<CleanupRecord>("clean_selected", {
      scanId,
      ids,
      dockerConfirmation,
    });
  },
  cancel: () => (native ? invoke<void>("cancel_operation") : Promise.resolve()),
  toggleFloating: () =>
    native
      ? invoke<void>("toggle_floating")
      : Promise.reject(
          new Error("O monitor flutuante está disponível no app instalado."),
        ),
  showMain: (scan = false) =>
    native ? invoke<void>("show_main", { scan }) : Promise.resolve(),
  reveal: (path: string) =>
    native
      ? invoke<void>("reveal_path", { path })
      : Promise.reject(
          new Error("Abrir no Finder está disponível no app instalado."),
        ),
  pickFolder: async () => {
    if (!native)
      throw new Error("O seletor de pastas está disponível no app instalado.");
    const path = await open({
      directory: true,
      multiple: false,
      title: "Escolha a pasta para analisar",
    });
    return typeof path === "string" ? path : null;
  },
  map: (path: string) =>
    native
      ? invoke<FolderInfo[]>("analyze_folder", { path })
      : Promise.resolve([
          {
            path: "~/Projetos",
            name: "Projetos",
            bytes: 74 * GB,
            incomplete: false,
          },
          {
            path: "~/Library",
            name: "Library",
            bytes: 52 * GB,
            incomplete: false,
          },
          {
            path: "~/Downloads",
            name: "Downloads",
            bytes: 12 * GB,
            incomplete: false,
          },
        ]),
};
