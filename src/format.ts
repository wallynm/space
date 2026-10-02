export function bytes(value: number, precision = 1) {
  if (!Number.isFinite(value) || value < 0) return "—";
  if (value === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1000)), 4);
  return (
    new Intl.NumberFormat("pt-BR", {
      maximumFractionDigits: index > 1 ? precision : 0,
      minimumFractionDigits: index > 1 ? precision : 0,
    }).format(value / 1000 ** index) +
    " " +
    units[index]
  );
}
export function shortPath(path: string, home?: string) {
  return home && path.startsWith(home + "/")
    ? "~" + path.slice(home.length)
    : path;
}
export function categoryName(category: string) {
  return (
    (
      {
        rust: "Builds Rust",
        next: "Caches Next.js",
        npm: "Pacotes npm",
        node_modules: "node_modules",
        python: "Python",
        packages: "Homebrew",
        xcode: "Xcode",
        docker: "Docker",
      } as Record<string, string>
    )[category] ?? category
  );
}
export function selectedBytes(
  items: { id: string; bytes: number; blocked: string | null }[],
  selected: Set<string>,
) {
  return items
    .filter((i) => selected.has(i.id) && !i.blocked)
    .reduce((total, i) => total + i.bytes, 0);
}
export function date(seconds: number) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(seconds * 1000);
}
