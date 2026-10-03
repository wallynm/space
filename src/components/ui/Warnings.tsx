import { AlertCircle } from "lucide-react";

export function Warnings({ items }: { items: string[] }) {
  return items.length > 0 ? (
    <details className="warnings">
      <summary>
        <AlertCircle size={15} />
        {items.length} avisos de análise
      </summary>
      {items.map((s, i) => (
        <code key={i}>{s}</code>
      ))}
    </details>
  ) : null;
}
