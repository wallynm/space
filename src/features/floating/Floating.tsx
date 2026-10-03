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
    <div className="floating-panel">
      <div
        className="floating-top"
        data-tauri-drag-region
        onMouseDown={(e) => {
          if (native && e.button === 0 && !(e.target as HTMLElement).closest("button")) {
            void getCurrentWindow().startDragging();
          }
        }}
      >
        <div className="floating-brand">
          <Mark size={22} />
          Space
        </div>
        <div className="floating-controls">
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
      <div className="floating-main">
        <span className="eyebrow">ESPAÇO LIVRE</span>
        <div className="floating-number">{disk.data ? bytes(disk.data.free) : "—"}</div>
        <div className="floating-meter">
          <span style={{ width: percentage + "%" }} />
        </div>
        <div className="floating-detail">
          <span>{percentage}% utilizado</span>
          <span>{disk.data ? bytes(disk.data.total) : "Lendo…"} no total</span>
        </div>
        <div className={"floating-status " + (low ? "low" : "")} title={w.operation?.progress.path}>
          <span className="status-dot" />
          {w.operation?.running
            ? `${w.operation.label} · ${Math.floor((w.operation.progress.elapsedMs ?? 0) / 1000)} s`
            : disk.error
              ? "Falha na leitura"
              : low
                ? "Seu disco precisa de uma folga"
                : "Seu disco está com folga"}
        </div>
        <button
          className="floating-action"
          disabled={w.operation?.progress.stage?.startsWith("Instalando")}
          onClick={() =>
            void w.feedback(w.operation?.running ? api.cancel : () => api.showMain(true))
          }
        >
          {w.operation?.running ? "Interromper operação" : "Analisar e limpar"}
          <ArrowUpRight size={17} />
        </button>
      </div>
      <div className="floating-footer">
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
