import { LoaderCircle } from "lucide-react";
import { api } from "../../bridge";
import { bytes } from "../../format";
import { useWorkspace } from "../../workspace";

export function Operation({ label }: { label: string }) {
  const w = useWorkspace();
  return (
    <div className="operation flex items-center gap-3.5 p-[18px_24px] rounded-xl bg-[#edf0e6] border border-[#d9e0d2] mb-6">
      <LoaderCircle className="spin animate-spin text-forest shrink-0" size={20} />
      <div className="flex-1 min-w-0">
        <strong className="block text-sm text-forest font-semibold">{label}</strong>
        <code className="block text-xs truncate font-mono text-ink mt-0.5">
          {w.progress?.path || "Preparando leitura nativa…"}
        </code>
        <small className="operation-detail block text-muted text-[11px] mt-1.5 truncate">
          {w.progress?.stage ?? label} · {(w.progress?.visited ?? 0).toLocaleString("pt-BR")}{" "}
          entradas · {bytes(w.progress?.bytes ?? 0)} encontrados ·{" "}
          {Math.floor((w.progress?.elapsedMs ?? 0) / 1000)} s
          {w.progress?.reusedDirectories
            ? ` · ${w.progress.reusedDirectories} pastas reutilizadas`
            : ""}
        </small>
      </div>
      <button
        className="button subtle compact inline-flex items-center justify-center gap-2 text-[11px] font-medium py-2 px-3 rounded-lg border border-[#dbe1d3] bg-[#f9faf4] text-[#596c5d] hover:bg-[#eaf0e2] transition min-h-[34px] cursor-pointer whitespace-nowrap"
        onClick={() => void w.feedback(api.cancel)}
      >
        Interromper
      </button>
    </div>
  );
}
