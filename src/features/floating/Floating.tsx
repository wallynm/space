import { getCurrentWindow } from "@tauri-apps/api/window";
import { ArrowUpRight, ExternalLink, Pin, X } from "lucide-react";
import { useEffect, useState } from "react";
import { api, native } from "../../bridge";
import { Mark } from "../../components/ui/BrandMark";
import { bytes } from "../../format";
import { useDisk, useWorkspace } from "../../workspace";

export function Floating() {
  const disk = useDisk();
  const w = useWorkspace();
  const percentage = disk.data ? Math.round((disk.data.used / disk.data.total) * 100) : 0;
  const [threshold, setThreshold] = useState(() =>
    Number(localStorage.getItem("folga.threshold") ?? 15),
  );

  useEffect(() => {
    const changed = (e: StorageEvent) => {
      if (e.key === "folga.threshold") {
        setThreshold(Number(e.newValue ?? 15));
      }
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);

  const low = disk.data && (disk.data.free / disk.data.total) * 100 < threshold;
  return (
    <div className="floating-panel w-screen h-screen bg-forest text-[#e6f0de] overflow-hidden border border-white/10 flex flex-col font-sans select-none">
      <div
        className="floating-top pt-[17px] px-5 pb-[7px] flex items-center justify-between cursor-grab"
        data-tauri-drag-region
        onMouseDown={(e) => {
          if (native && e.button === 0 && !(e.target as HTMLElement).closest("button")) {
            void getCurrentWindow().startDragging();
          }
        }}
      >
        <div className="floating-brand flex items-center gap-1.5 text-[15px] font-semibold tracking-[-0.4px] text-[#f2f7ec]">
          <Mark size={22} />
          Space
        </div>
        <div className="floating-controls flex items-center gap-2 text-[#a4cca1] [&>button]:flex [&>button]:text-inherit [&>button]:cursor-pointer">
          <span title="Sempre sobre outras janelas">
            <Pin size={13} />
          </span>
          <button
            aria-label="Ocultar monitor"
            onClick={() => {
              if (native) void getCurrentWindow().hide();
            }}
          >
            <X size={17} />
          </button>
        </div>
      </div>
      <div className="floating-main pt-[7px] px-5 pb-[17px] flex-1 flex flex-col justify-center">
        <span className="eyebrow font-mono text-[9px] tracking-[1.6px] font-normal text-[#92b88e]">
          ESPAÇO LIVRE
        </span>
        <div className="floating-number text-[32px] font-medium tracking-[-1.2px] text-white my-1.5">
          {disk.data ? bytes(disk.data.free) : "—"}
        </div>
        <div className="floating-meter h-1.5 bg-white/15 rounded-full overflow-hidden mb-2">
          <span
            className="block h-full bg-mint rounded-full transition-all duration-300"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <div className="floating-detail flex justify-between text-[9px] text-[#98bf94] mb-3.5">
          <span>{percentage}% utilizado</span>
          <span>{disk.data ? bytes(disk.data.total) : "Lendo…"} no total</span>
        </div>
        <div
          className={`floating-status flex items-center gap-1.5 text-[10px] mb-3.5 p-[8px_10px] rounded-[7px] truncate ${
            low ? "low bg-[#ff55552b] text-[#ffd0d0]" : "bg-white/10 text-[#c9e6c4]"
          }`}
          title={w.operation?.progress.path}
        >
          <span
            className={`status-dot inline-block w-1.5 h-1.5 rounded-full ${
              low ? "bg-[#ff6b6b]" : "bg-mint"
            } shrink-0`}
          />
          {w.operation?.running
            ? `${w.operation.label} · ${Math.floor((w.operation.progress.elapsedMs ?? 0) / 1000)} s`
            : disk.error
              ? "Falha na leitura"
              : low
                ? "Seu disco precisa de uma folga"
                : "Seu disco está com folga"}
        </div>
        <button
          className="floating-action w-full p-2.5 flex items-center justify-center gap-[7px] bg-mint text-forest rounded-lg text-xs font-medium cursor-pointer hover:bg-[#a6d790] transition disabled:opacity-45"
          disabled={w.operation?.progress.stage?.startsWith("Instalando")}
          onClick={() =>
            void w.feedback(w.operation?.running ? api.cancel : () => api.showMain(true))
          }
        >
          {w.operation?.running ? "Interromper operação" : "Analisar e limpar"}
          <ArrowUpRight size={17} />
        </button>
      </div>
      <div className="floating-footer mt-auto border-t border-white/10 py-2.5 px-5 flex justify-between items-center font-mono text-[8px] tracking-[1px] text-[#8db58a] [&>button]:cursor-pointer">
        <span>{native ? "LOCAL · EM TEMPO REAL" : "PRÉVIA · DADOS ILUSTRATIVOS"}</span>
        <button
          aria-label="Abrir painel principal"
          onClick={() => void w.feedback(() => api.showMain(false))}
        >
          <ExternalLink size={13} />
        </button>
      </div>
    </div>
  );
}
