import { invoke } from "@tauri-apps/api/core";
import { native } from "./bridge";
import { version as appVersion } from "../package.json";
import type {
  AppReport,
  CatalogReport,
  DockerReport,
  OperationState,
  Protection,
  UpdateView,
  IndexStatus,
} from "./types";
const emptyOperation: OperationState = {
  id: "",
  running: false,
  label: "",
  startedAt: 0,
  revision: 0,
  progress: { visited: 0, path: "" },
};
let demoProtection: Protection = { paths: [] };
const demoUpdate: UpdateView = {
  currentVersion: appVersion,
  configured: false,
  checkOnLaunch: true,
  phase: "idle",
  version: null,
  notes: null,
  downloaded: 0,
  total: null,
  error: null,
};
export function newerOperation(
  current: OperationState | undefined,
  next: OperationState,
): OperationState {
  return current && current.revision > next.revision ? current : next;
}
export const desktopApi = {
  indexStatus: () => native
    ? invoke<IndexStatus>("get_index_status")
    : Promise.resolve({ watching: true, refreshing: false, phase: "", checkedAt: Date.now() / 1000, error: null }),
  operation: () =>
    native
      ? invoke<OperationState>("get_operation")
      : Promise.resolve(emptyOperation),
  protection: () =>
    native
      ? invoke<Protection>("get_protection")
      : Promise.resolve(demoProtection),
  protect: (paths: string[]) => {
    if (native) return invoke<Protection>("update_protection", { paths });
    demoProtection = { paths };
    return Promise.resolve(demoProtection);
  },
  apps: () =>
    native
      ? invoke<AppReport | null>("get_applications")
      : Promise.resolve(null),
  docker: () =>
    native ? invoke<DockerReport | null>("get_docker") : Promise.resolve(null),
  privacy: () =>
    native
      ? invoke<void>("open_privacy_settings")
      : Promise.reject(
          new Error("Abra os ajustes de privacidade no app instalado."),
        ),
  retry: (path: string) =>
    native
      ? invoke<CatalogReport>("retry_unreadable", { path })
      : Promise.reject(new Error("Leitura real disponível no app instalado.")),
  updates: () =>
    native ? invoke<UpdateView>("get_updates") : Promise.resolve(demoUpdate),
  updatePreferences: (checkOnLaunch: boolean) =>
    native
      ? invoke<UpdateView>("set_update_preferences", { checkOnLaunch })
      : Promise.resolve({ ...demoUpdate, checkOnLaunch }),
  checkUpdates: () =>
    native ? invoke<UpdateView>("check_updates") : Promise.resolve(demoUpdate),
  installUpdate: (version: string) =>
    native
      ? invoke<UpdateView>("install_update", { version })
      : Promise.reject(new Error("Instalação disponível no app instalado.")),
  restart: () => (native ? invoke<void>("restart_updated") : Promise.resolve()),
};
