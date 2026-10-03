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
      className="review-dialog w-[560px] max-w-[calc(100vw-40px)] max-h-[85vh] overflow-auto border border-[#d7dfcd] rounded-[17px] p-[27px] bg-[#fafbf5] text-ink shadow-[0_25px_70px_#16352430] backdrop:bg-[#19372b66] backdrop:backdrop-blur-xs"
      onCancel={(e) => {
        if (pending) e.preventDefault();
        else onClose();
      }}
    >
      <div className="dialog-top flex justify-between items-start mb-[23px]">
        <div className="dialog-symbol w-12 h-12 rounded-[13px] bg-[#e5ecdc] flex items-center justify-center text-[#648653]">
          <Trash2 size={23} />
        </div>
        <button
          className="icon-button w-[34px] h-[34px] rounded-lg border border-[#e2e8da] flex items-center justify-center text-[#687b64] hover:bg-[#eaf0e0] transition cursor-pointer"
          aria-label="Fechar revisão"
          disabled={pending}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <div className="eyebrow font-mono text-[9px] tracking-[1.6px] font-normal text-[#768773]">
        REVISÃO FINAL
      </div>
      <h2 className="text-[28px] font-medium tracking-[-1px] my-2.5 text-forest">{title}</h2>
      <p className="text-xs text-[#7e8e72] leading-[1.7]">{description}</p>
      <div className="review-paths border border-[#e2e8d9] rounded-[7px] overflow-auto max-h-[230px] my-[21px]">
        {items.map((i) => (
          <div
            key={i.path}
            className="flex items-center gap-2.5 p-3 border-b border-[#e6ecdd] last:border-b-0"
          >
            <span className="font-mono text-[9px] break-all flex-1 text-[#78886d]">{i.path}</span>
            <strong className="font-mono text-[10px] whitespace-nowrap font-normal text-ink">
              {i.bytes == null ? "Tamanho desconhecido" : bytes(i.bytes)}
            </strong>
          </div>
        ))}
      </div>
      {acknowledge && (
        <label className="review-ack flex items-center gap-2.5 text-xs text-[#637763] my-3.5 cursor-pointer">
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
        <label className="phrase-label flex flex-col gap-1.5 text-xs text-[#637763] my-3.5">
          Digite {phrase}
          <input
            className="p-2.5 border border-[#d7dfcd] rounded-[7px] bg-white font-mono text-sm text-ink outline-none focus:border-forest"
            value={value}
            disabled={pending}
            onChange={(e) => setValue(e.target.value)}
            autoComplete="off"
            placeholder={phrase}
          />
        </label>
      )}
      {!native && (
        <p className="native-only text-[#a67842] text-[11px] my-2">
          Alterações disponíveis somente no app instalado.
        </p>
      )}
      {error != null && (
        <p role="alert" className="inline-error text-[#a67842] text-[11px] my-2">
          {String(error)}
        </p>
      )}
      <div className="dialog-actions flex justify-end gap-2.5 mt-6 pt-5 border-t border-line">
        <button
          className="button subtle inline-flex items-center justify-center gap-2 text-[13px] font-medium py-3 px-4 rounded-lg border border-[#dbe1d3] bg-[#f9faf4] text-[#596c5d] hover:bg-[#eaf0e2] transition cursor-pointer min-h-[43px] whitespace-nowrap"
          disabled={pending}
          onClick={onClose}
        >
          Voltar
        </button>
        <button
          className="button primary inline-flex items-center justify-center gap-2 text-[13px] font-medium py-3 px-4 rounded-lg bg-forest text-[#f4f8ef] shadow-sm hover:bg-[#245445] transition cursor-pointer min-h-[43px] whitespace-nowrap disabled:opacity-45"
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
              <LoaderCircle className="spin animate-spin" size={17} />
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
