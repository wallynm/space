type Item = { id: string; blocked: string | null };

export function selectVisible(selected: Set<string>, items: Item[], checked = true) {
  const next = new Set(selected);
  for (const item of items) {
    if (!item.blocked) {
      if (checked) next.add(item.id);
      else next.delete(item.id);
    }
  }
  return next;
}

export function toggleRange(selected: Set<string>, items: Item[], id: string, anchor: string | null) {
  const end = items.findIndex((item) => item.id === id);
  if (end < 0 || items[end].blocked) return selected;
  const start = items.findIndex((item) => item.id === anchor);
  const range = start < 0 ? [items[end]] : items.slice(Math.min(start, end), Math.max(start, end) + 1);
  return selectVisible(selected, range, !selected.has(id));
}
