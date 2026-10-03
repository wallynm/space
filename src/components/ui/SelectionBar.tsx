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
    <div className="selection-bar tool-selection">
      <span>
        {count} {count === 1 ? "item selecionado" : "itens selecionados"}
      </span>
      <button className="text-button muted" disabled={disabled} onClick={onClear}>
        Limpar seleção
      </button>
      <strong>{bytes(size)}</strong>
      <button className="button primary" disabled={!count || disabled} onClick={onReview}>
        {label}
        <ArrowRight size={16} />
      </button>
    </div>
  );
}
