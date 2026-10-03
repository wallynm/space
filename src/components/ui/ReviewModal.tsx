import { ArrowRight, LoaderCircle, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { native } from "../../bridge";
import { bytes } from "../../format";
import { useWorkspace } from "../../workspace";

export function ReviewModal({
  title,
  description,
  items,
  onClose,
  onConfirm,
  pending,
  error,
  phrase,
  acknowledge,
}: {
  title: string;
  description: string;
  items: { path: string; bytes?: number | null }[];
  onClose: () => void;
  onConfirm: (phrase: string) => void;
  pending: boolean;
  error: unknown;
  phrase?: string;
  acknowledge?: string;
}) {
  const w = useWorkspace();
  const ref = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState("");
  const [ack, setAck] = useState(false);

  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className="review-dialog"
      onCancel={(e) => {
        if (pending) e.preventDefault();
        else onClose();
      }}
    >
      <div className="dialog-top">
        <div className="dialog-symbol">
          <Trash2 size={23} />
        </div>
        <button
          className="icon-button"
          aria-label="Fechar revisão"
          disabled={pending}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <div className="eyebrow">REVISÃO FINAL</div>
      <h2>{title}</h2>
      <p>{description}</p>
      <div className="review-paths">
        {items.map((i) => (
          <div key={i.path}>
            <span>{i.path}</span>
            <strong>{i.bytes == null ? "Tamanho desconhecido" : bytes(i.bytes)}</strong>
          </div>
        ))}
      </div>
      {acknowledge && (
        <label className="review-ack">
          <input
            type="checkbox"
            checked={ack}
            disabled={pending}
            onChange={(e) => setAck(e.target.checked)}
          />
          {acknowledge}
        </label>
      )}
      {phrase && (
        <label className="phrase-label">
          Digite {phrase}
          <input
            value={value}
            disabled={pending}
            onChange={(e) => setValue(e.target.value)}
            autoComplete="off"
            placeholder={phrase}
          />
        </label>
      )}
      {!native && <p className="native-only">Alterações disponíveis somente no app instalado.</p>}
      {error != null && (
        <p role="alert" className="inline-error">
          {String(error)}
        </p>
      )}
      <div className="dialog-actions">
        <button className="button subtle" disabled={pending} onClick={onClose}>
          Voltar
        </button>
        <button
          className="button primary"
          disabled={
            !native ||
            w.busy ||
            pending ||
            (!!phrase && value !== phrase) ||
            (!!acknowledge && !ack)
          }
          onClick={() => onConfirm(value)}
        >
          {pending ? (
            <>
              <LoaderCircle className="spin" size={17} />
              Executando…
            </>
          ) : (
            <>
              Confirmar seleção
              <ArrowRight size={17} />
            </>
          )}
        </button>
      </div>
    </dialog>
  );
}
