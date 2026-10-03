import { LoaderCircle } from "lucide-react";
import { api } from "../../bridge";
import { bytes } from "../../format";
import { useWorkspace } from "../../workspace";

export function Operation({ label }: { label: string }) {
  const w = useWorkspace();
  return (
    <div className="operation">
      <LoaderCircle className="spin" size={20} />
      <div>
        <strong>{label}</strong>
        <code>{w.progress?.path || "Preparando leitura nativa…"}</code>
        <small className="operation-detail">
          {w.progress?.stage ?? label} · {(w.progress?.visited ?? 0).toLocaleString("pt-BR")}{" "}
          entradas · {bytes(w.progress?.bytes ?? 0)} encontrados ·{" "}
          {Math.floor((w.progress?.elapsedMs ?? 0) / 1000)} s
          {w.progress?.reusedDirectories
            ? ` · ${w.progress.reusedDirectories} pastas reutilizadas`
            : ""}
        </small>
      </div>
      <button className="button subtle compact" onClick={() => void w.feedback(api.cancel)}>
        Interromper
      </button>
    </div>
  );
}
