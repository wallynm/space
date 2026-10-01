import type { CatalogReport, FileEntry, DuplicateGroup } from "./types";

export function newerCatalog(current: CatalogReport | null | undefined, incoming: CatalogReport | null) {
  if (!current) return incoming;
  if (!incoming) return current;
  if (current.id === incoming.id) {
    return (current.revision ?? 0) > (incoming.revision ?? 0) ? current : incoming;
  }
  if (/^\d+$/.test(current.id) && /^\d+$/.test(incoming.id)) {
    return BigInt(current.id) > BigInt(incoming.id) ? current : incoming;
  }
  return current.createdAt > incoming.createdAt ? current : incoming;
}
export function retainSelection(selected: Set<string>, files: FileEntry[]) {
  const valid = new Set(files.filter((f) => !f.blocked).map((f) => f.id));
  const next = new Set([...selected].filter((id) => valid.has(id)));
  return next.size === selected.size ? selected : next;
}
export function retainDuplicateSelection(selected: Set<string>, groups: DuplicateGroup[] | null) {
  const remaining = retainSelection(selected, (groups ?? []).flatMap((g) => g.files));
  const next = new Set(remaining);
  for (const group of groups ?? []) {
    if (group.files.every((f) => next.has(f.id))) next.delete(group.files[0].id);
  }
  return next.size === selected.size ? selected : next;
}
