import { AlertCircle } from "lucide-react";

export function Warnings({ items }: { items: string[] }) {
  return items.length > 0 ? (
    <details className="warnings my-[18px] border border-[#ebd3b6] rounded-[9px] bg-[#fdfaf2] text-[11px]">
      <summary className="cursor-pointer py-2.5 px-3.5 flex items-center gap-2 text-[#795d2c] font-medium select-none">
        <AlertCircle size={15} />
        {items.length} avisos de análise
      </summary>
      {items.map((s, i) => (
        <code
          key={`${s}-${i}`}
          className="block py-1.5 px-3.5 border-t border-[#f2e1ce] text-[10px] text-[#8c6a32] break-all font-mono"
        >
          {s}
        </code>
      ))}
    </details>
  ) : null;
}
