export type DiskInfo = {
  total: number;
  free: number;
  used: number;
  volume: string;
  home: string;
};
export type Candidate = {
  id: string;
  path: string;
  label: string;
  category: string;
  bytes: number;
  files: number;
  risk: "cache" | "data";
  blocked: string | null;
};
export type ScanReport = {
  id: string;
  candidates: Candidate[];
  warnings: string[];
  scannedDirs: number;
  elapsedMs: number;
  roots: string[];
  createdAt: number;
};
export type Progress = {
  visited: number;
  path: string;
  bytes?: number;
  elapsedMs?: number;
  stage?: string;
  scannedDirectories?: number;
  reusedDirectories?: number;
};
export type OperationState = {
  id: string;
  running: boolean;
  label: string;
  startedAt: number;
  revision: number;
  progress: Progress;
};
export type Protection = { paths: string[] };
export type UpdateView = {
  currentVersion: string;
  configured: boolean;
  checkOnLaunch: boolean;
  phase: string;
  version: string | null;
  notes: string | null;
  downloaded: number;
  total: number | null;
  error: string | null;
};
export type CleanupRecord = {
  id: string;
  createdAt: number;
  removedBytes: number;
  movedBytes?: number;
  mode?: string;
  recovery?: {
    id: string;
    original: string;
    trashed: string;
    restored: boolean;
    fingerprint: unknown | null;
  }[];
  freedBytes: number;
  removed: string[];
  skipped: string[];
};
export type FolderInfo = {
  path: string;
  name: string;
  bytes: number;
  incomplete: boolean;
};
export type FileEntry = {
  id: string;
  path: string;
  name: string;
  bytes: number;
  logicalBytes: number;
  modified: number;
  accessed: number | null;
  kind: string;
  blocked: string | null;
};
export type MapNode = {
  path: string;
  name: string;
  bytes: number;
  directory: boolean;
  incomplete: boolean;
};
export type FolderReview = {
  scanId: string;
  revision: number;
  path: string;
  bytes: number;
  files: number;
};
export type Project = {
  path: string;
  name: string;
  ecosystem: string;
  bytes: number;
  buildBytes: number;
  dependencyBytes: number;
};
export type CatalogReport = {
  revision?: number;
  updatedAt?: number;
  verifiedAt?: number;
  cached?: boolean;
  elapsedMs?: number;
  scannedDirectories?: number;
  reusedDirectories?: number;
  unreadable?: { path: string; reason: string; permission: boolean }[];
  id: string;
  root: string;
  createdAt: number;
  bytes: number;
  files: FileEntry[];
  projects: Project[];
  warnings: string[];
  visited: number;
  incomplete: boolean;
};
export type IndexStatus = {
  watching: boolean;
  refreshing: boolean;
  phase: string;
  checkedAt: number;
  error: string | null;
};
export type DuplicateGroup = {
  hash: string;
  logicalBytes: number;
  recoverableBytes: number;
  files: FileEntry[];
};
export type AppPart = {
  id: string;
  path: string;
  bytes: number | null;
  kind: string;
  blocked: string | null;
};
export type InstalledApp = {
  id: string;
  name: string;
  bundleId: string;
  path: string;
  leftover: boolean;
  parts: AppPart[];
};
export type AppReport = {
  id: string;
  createdAt: number;
  apps: InstalledApp[];
  warnings: string[];
};
export type DockerItem = {
  id: string;
  resourceId: string;
  name: string;
  kind: "cache" | "image" | "container" | "volume";
  bytes: number | null;
  blocked: string | null;
  shared: boolean;
  detail: string;
};
export type DockerReport = {
  id: string;
  createdAt: number;
  context: string;
  endpoint: string;
  builder: string | null;
  items: DockerItem[];
  warnings: string[];
};
export type SystemReport = {
  volume: string;
  filesystem: string;
  containerBytes: number | null;
  containerFree: number | null;
  dataBytes: number | null;
  purgeableBytes: number | null;
  snapshots: { name: string; scope: string; purgeable: boolean | null }[];
  warnings: string[];
};
export type MonitorSettings = {
  enabled: boolean;
  notifications: boolean;
  threshold: number;
};
export type MonitorView = {
  settings: MonitorSettings;
  samples: { at: number; free: number; total: number }[];
  growth: {
    path: string;
    bytes: number;
    delta: number | null;
    previousAt: number | null;
    at: number;
    complete: boolean;
  }[];
};
