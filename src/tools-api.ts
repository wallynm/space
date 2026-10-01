import { invoke } from "@tauri-apps/api/core";
import {
  isPermissionGranted,
  requestPermission,
} from "@tauri-apps/plugin-notification";
import { native } from "./bridge";
import type {
  CatalogReport,
  MapNode,
  DuplicateGroup,
  AppReport,
  DockerReport,
  SystemReport,
  MonitorView,
  MonitorSettings,
  CleanupRecord,
  FileEntry,
} from "./types";
const GB = 1e9,
  now = () => Date.now() / 1000;
const refuse = () =>
  Promise.reject(
    new Error("A prévia não executa alterações. Abra o app Space instalado."),
  );
const files = (root: string): FileEntry[] =>
  [
    ["f1", "Downloads/instalador-antigo.dmg", 2.4, "dmg", 340],
    ["f2", "Vídeos/captura-do-projeto.mov", 5.2, "mov", 98],
    ["f3", "Downloads/assets-final.zip", 1.8, "zip", 210],
    ["f4", "Documentos/backup-assets.zip", 1.8, "zip", 80],
    ["f5", "Imagens/referencia-original.png", 0.13, "png", 60],
  ].map(([id, name, size, kind, age]) => ({
    id: String(id),
    path: root + "/" + name,
    name: String(name).split("/").at(-1)!,
    bytes: Number(size) * GB,
    logicalBytes: Number(size) * GB,
    kind: String(kind),
    modified: now() - Number(age) * 86400,
    accessed: now() - Number(age) * 86400,
    blocked: null,
  }));
let demoRoot = "/Users/voce";
let demoDuplicates: DuplicateGroup[] | null = null;
let demoCatalog: CatalogReport | null = (() => {
  if (native) return null;
  try {
    const saved = JSON.parse(
      sessionStorage.getItem("folga.preview.catalog") ?? "null",
    ) as CatalogReport | null;
    if (saved) {
      demoRoot = saved.root;
      return { ...saved, cached: true };
    }
  } catch {
    /* invalid preview state is discarded */
  }
  return null;
})();
let demoMonitor: MonitorView = {
  settings: { enabled: true, notifications: false, threshold: 15 },
  samples: Array.from({ length: 18 }, (_, i) => ({
    at: now() - (18 - i) * 300,
    free: (107 - i * 0.35) * GB,
    total: 494 * GB,
  })),
  growth: [
    {
      path: "/Users/voce/Projetos",
      bytes: 74 * GB,
      delta: 12.4 * GB,
      previousAt: now() - 86400,
      at: now(),
      complete: true,
    },
    {
      path: "/Users/voce/Downloads",
      bytes: 12 * GB,
      delta: 2.4 * GB,
      previousAt: now() - 86400,
      at: now(),
      complete: true,
    },
  ],
};
export const toolsApi = {
  lastDuplicates: () => native ? invoke<DuplicateGroup[] | null>("get_duplicates") : Promise.resolve(demoDuplicates),
  catalog: () =>
    native
      ? invoke<CatalogReport | null>("get_catalog")
      : Promise.resolve(demoCatalog),
  scan: async (path: string) => {
    if (native) return invoke<CatalogReport>("scan_catalog", { path });
    demoRoot = path;
    await new Promise((r) => setTimeout(r, 600));
    demoCatalog = {
      id: "demo-catalog",
      root: path,
      createdAt: now(),
      revision: 1,
      updatedAt: now(),
      verifiedAt: now(),
      bytes: 148 * GB,
      visited: 94652,
      incomplete: true,
      cached: false,
      scannedDirectories: 326,
      reusedDirectories: 1180,
      elapsedMs: 600,
      unreadable: [
        {
          path: path + "/Library/Containers",
          reason:
            "Leitura opcional de dados protegidos pelo macOS · exemplo ilustrativo",
          permission: true,
        },
      ],
      warnings: [
        "Dados protegidos preservados: " + path + "/Library/Containers",
      ],
      files: files(path),
      projects: [
        {
          path: path + "/Projetos/tesselapp",
          name: "tesselapp",
          ecosystem: "Rust",
          bytes: 22 * GB,
          buildBytes: 14.4 * GB,
          dependencyBytes: 0.9 * GB,
        },
        {
          path: path + "/Projetos/portal",
          name: "portal",
          ecosystem: "JavaScript",
          bytes: 8.2 * GB,
          buildBytes: 3.8 * GB,
          dependencyBytes: 2.1 * GB,
        },
        {
          path: path + "/Projetos/estudo-godot",
          name: "estudo-godot",
          ecosystem: "Godot",
          bytes: 3.6 * GB,
          buildBytes: 0.6 * GB,
          dependencyBytes: 0,
        },
      ],
    };
    sessionStorage.setItem(
      "folga.preview.catalog",
      JSON.stringify(demoCatalog),
    );
    return demoCatalog;
  },
  children: (scanId: string, path: string) => {
    if (native) return invoke<MapNode[]>("catalog_children", { scanId, path });
    const top = path === demoRoot;
    return Promise.resolve(
      (top
        ? [
            ["Projetos", 74],
            ["Library", 52],
            ["Downloads", 12],
            ["Vídeos", 8],
            ["Documentos", 2],
          ]
        : [
            ["Builds", 14.4],
            ["Assets", 6.2],
            ["src", 1.4],
            ["referencias.zip", 0.8],
          ]
      ).map(([name, size]) => ({
        path: path + "/" + name,
        name: String(name),
        bytes: Number(size) * GB,
        directory: !String(name).includes("."),
        incomplete: false,
      })),
    );
  },
  duplicates: (scanId: string) => {
    if (native) return invoke<DuplicateGroup[]>("find_duplicates", { scanId });
    demoDuplicates = [
          {
            hash: "BLAKE3 · prévia",
            logicalBytes: 1.8 * GB,
            recoverableBytes: 1.8 * GB,
            files: files(demoRoot).slice(2, 4),
          },
        ];
    return Promise.resolve(demoDuplicates);
  },
  trash: (scanId: string, ids: string[], duplicateMode: boolean) =>
    native
      ? invoke<CleanupRecord>("trash_files", { scanId, ids, duplicateMode })
      : refuse(),
  apps: (includeContainers: boolean) =>
    native
      ? invoke<AppReport>("scan_applications", { includeContainers })
      : Promise.resolve({
          id: "demo-apps",
          createdAt: now(),
          warnings: [],
          apps: [
            {
              id: "a1",
              name: "Editor de vídeo",
              bundleId: "com.example.video",
              path: "/Applications/Editor.app",
              leftover: false,
              parts: [
                {
                  id: "p1",
                  path: "/Applications/Editor.app",
                  bytes: 3.8 * GB,
                  kind: "app",
                  blocked: null,
                },
                {
                  id: "p2",
                  path: "/Users/voce/Library/Caches/com.example.video",
                  bytes: 1.1 * GB,
                  kind: "cache",
                  blocked: null,
                },
                {
                  id: "p3",
                  path: "/Users/voce/Library/Application Support/com.example.video",
                  bytes: 0.7 * GB,
                  kind: "data",
                  blocked: null,
                },
              ],
            },
            {
              id: "a2",
              name: "com.example.oldapp",
              bundleId: "com.example.oldapp",
              path: "",
              leftover: true,
              parts: [
                {
                  id: "p4",
                  path: "/Users/voce/Library/Caches/com.example.oldapp",
                  bytes: 0.43 * GB,
                  kind: "cache",
                  blocked: null,
                },
              ],
            },
          ],
        }),
  trashApps: (scanId: string, ids: string[]) =>
    native
      ? invoke<CleanupRecord>("trash_applications", { scanId, ids })
      : refuse(),
  docker: (): Promise<DockerReport> =>
    native
      ? invoke<DockerReport>("scan_docker")
      : Promise.resolve({
          id: "demo-docker",
          createdAt: now(),
          context: "desktop-linux",
          endpoint: "unix:///Users/voce/.docker/run/docker.sock",
          builder: "desktop-linux",
          warnings: [],
          items: [
            {
              id: "d1",
              resourceId: "cache1",
              name: "RUN cargo build --release",
              kind: "cache",
              bytes: 4.6 * GB,
              blocked: null,
              shared: false,
              detail: "Cache de build; próximos builds podem demorar mais",
            },
            {
              id: "d2",
              resourceId: "img1",
              name: "app-preview:latest",
              kind: "image",
              bytes: 1.2 * GB,
              blocked: null,
              shared: true,
              detail: "Camadas compartilhadas; espaço não somável",
            },
            {
              id: "d3",
              resourceId: "container1",
              name: "preview-antigo",
              kind: "container",
              bytes: 0.36 * GB,
              blocked: null,
              shared: false,
              detail: "Parado · volumes preservados",
            },
            {
              id: "d4",
              resourceId: "volume1",
              name: "postgres-data",
              kind: "volume",
              bytes: null,
              blocked: null,
              shared: false,
              detail: "Pode conter bancos de dados. Tamanho não informado.",
            },
            {
              id: "d5",
              resourceId: "running",
              name: "app-em-desenvolvimento",
              kind: "container",
              bytes: 0.18 * GB,
              blocked: "Container em execução",
              shared: false,
              detail: "Em execução",
            },
          ],
        }),
  cleanDocker: (scanId: string, ids: string[], volumeConfirmation: string) =>
    native
      ? invoke<CleanupRecord>("clean_docker", {
          scanId,
          ids,
          volumeConfirmation,
        })
      : refuse(),
  system: () =>
    native
      ? invoke<SystemReport>("diagnose_system")
      : Promise.resolve({
          volume: "Macintosh HD - Data",
          filesystem: "apfs",
          containerBytes: 494 * GB,
          containerFree: 101 * GB,
          dataBytes: 371 * GB,
          purgeableBytes: null,
          snapshots: [
            {
              name: "com.apple.os.update · snapshot de sistema",
              scope: "Sistema",
              purgeable: false,
            },
          ],
          warnings: [],
        }),
  monitor: () =>
    native ? invoke<MonitorView>("get_monitor") : Promise.resolve(demoMonitor),
  updateMonitor: (settings: MonitorSettings) => {
    if (native) return invoke<MonitorView>("update_monitor", { settings });
    demoMonitor = { ...demoMonitor, settings };
    return Promise.resolve(demoMonitor);
  },
  permission: async () => {
    if (!native) return false;
    return (
      (await isPermissionGranted()) || (await requestPermission()) === "granted"
    );
  },
  preview: (path: string) =>
    native ? invoke<void>("quick_look", { path }) : refuse(),
  restore: (recordId: string, itemId: string) =>
    native
      ? invoke<CleanupRecord[]>("restore_trash", { recordId, itemId })
      : refuse(),
  openTrash: () => (native ? invoke<void>("open_trash") : refuse()),
};
