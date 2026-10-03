import { ArrowRight } from "lucide-react";
import { bytes } from "../../format";

export function SelectionBar({
  count,
  size,
  onClear,
  onReview,
  label = "Enviar à Lixeira",
  disabled = false,
}: {
  count: number;
  size: number;
  onClear: () => void;
  onReview: () => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <div className="selection-bar tool-selection flex items-center gap-4 py-4 px-5 bg-[#edf0e6] border border-[#d9e0d2] rounded-xl mt-[18px]">
      <span className="text-xs text-ink">
        {count} {count === 1 ? "item selecionado" : "itens selecionados"}
      </span>
      <button
        className="text-button muted text-xs font-medium text-muted hover:underline hover:text-ink cursor-pointer disabled:opacity-45"
        disabled={disabled}
        onClick={onClear}
      >
        Limpar seleção
      </button>
      <strong className="ml-auto font-mono text-[15px] font-semibold text-forest">
        {bytes(size)}
      </strong>
      <button
        className="button primary inline-flex items-center justify-center gap-2 text-[13px] font-medium py-3 px-4 rounded-lg bg-forest text-[#f4f8ef] shadow-sm hover:bg-[#245445] transition cursor-pointer disabled:opacity-45"
        disabled={!count || disabled}
        onClick={onReview}
      >
        {label}
        <ArrowRight size={16} />
      </button>
    </div>
  );
}
