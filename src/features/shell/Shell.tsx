import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet } from "@tanstack/react-router";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  Box,
  Code2,
  Download,
  FolderTree,
  HardDrive,
  History as HistoryIcon,
  LoaderCircle,
  Package,
  PanelTop,
  Settings2,
  ShieldCheck,
  X,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { version as appVersion } from "../../../package.json";
import { api, native } from "../../bridge";
import { Mark } from "../../components/ui/BrandMark";
import { desktopApi } from "../../desktop-api";
import { bytes } from "../../format";
import { useDisk, useWorkspace } from "../../workspace";

export function Shell() {
  const w = useWorkspace();
  const disk = useDisk();
  const client = useQueryClient();
  const checked = useRef(false);

  const updates = useQuery({
    queryKey: ["updates"],
    queryFn: desktopApi.updates,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (
      native &&
      updates.data?.configured &&
      updates.data.checkOnLaunch &&
      updates.data.phase === "idle" &&
      !w.busy &&
      !checked.current
    ) {
      checked.current = true;
      void desktopApi
        .checkUpdates()
        .catch(() => client.invalidateQueries({ queryKey: ["updates"] }));
    }
  }, [updates.data, w.busy, client]);

  return (
    <div className="app-shell flex min-h-screen bg-paper text-ink font-sans">
      <aside className="sidebar w-[205px] shrink-0 border-r border-line flex flex-col pt-[30px] px-[22px] pb-[20px] bg-[#f0f2e8] fixed top-0 bottom-0 overflow-y-auto z-10">
        <div className="brand flex items-center gap-[10px] text-[34px] font-semibold tracking-[-1.1px] text-forest">
          <Mark />
          <span>Space</span>
        </div>
        <div className="sidebar-caption font-mono text-[8px] tracking-[1.1px] mt-[10px] mb-[24px] text-[#728069] whitespace-nowrap">
          ESPAÇO PARA RESPIRAR
        </div>
        <nav aria-label="Navegação principal" className="grid gap-1 -mx-[9px]">
          <Link
            to="/"
            activeOptions={{ exact: true }}
            className="flex items-center gap-3 text-[13px] font-medium py-[9px] px-3 rounded-[9px] text-[#718076] min-h-[38px] hover:bg-[#e7ecdf] transition-colors [&.active]:text-forest [&.active]:bg-[#e0e8d8]"
          >
            <HardDrive size={19} />
            Visão geral
          </Link>
          <Link
            to="/explore"
            className="flex items-center gap-3 text-[13px] font-medium py-[9px] px-3 rounded-[9px] text-[#718076] min-h-[38px] hover:bg-[#e7ecdf] transition-colors [&.active]:text-forest [&.active]:bg-[#e0e8d8]"
          >
            <FolderTree size={19} />
            Explorador
          </Link>
          <Link
            to="/projects"
            className="flex items-center gap-3 text-[13px] font-medium py-[9px] px-3 rounded-[9px] text-[#718076] min-h-[38px] hover:bg-[#e7ecdf] transition-colors [&.active]:text-forest [&.active]:bg-[#e0e8d8]"
          >
            <Code2 size={19} />
            Projetos
          </Link>
          <Link
            to="/apps"
            className="flex items-center gap-3 text-[13px] font-medium py-[9px] px-3 rounded-[9px] text-[#718076] min-h-[38px] hover:bg-[#e7ecdf] transition-colors [&.active]:text-forest [&.active]:bg-[#e0e8d8]"
          >
            <Package size={19} />
            Apps e resíduos
          </Link>
          <Link
            to="/docker"
            className="flex items-center gap-3 text-[13px] font-medium py-[9px] px-3 rounded-[9px] text-[#718076] min-h-[38px] hover:bg-[#e7ecdf] transition-colors [&.active]:text-forest [&.active]:bg-[#e0e8d8]"
          >
            <Box size={19} />
            Docker
          </Link>
          <Link
            to="/system"
            className="flex items-center gap-3 text-[13px] font-medium py-[9px] px-3 rounded-[9px] text-[#718076] min-h-[38px] hover:bg-[#e7ecdf] transition-colors [&.active]:text-forest [&.active]:bg-[#e0e8d8]"
          >
            <Activity size={19} />
            Diagnóstico
          </Link>
          <Link
            to="/history"
            className="flex items-center gap-3 text-[13px] font-medium py-[9px] px-3 rounded-[9px] text-[#718076] min-h-[38px] hover:bg-[#e7ecdf] transition-colors [&.active]:text-forest [&.active]:bg-[#e0e8d8]"
          >
            <HistoryIcon size={19} />
            Histórico
          </Link>
          <Link
            to="/settings"
            className="flex items-center gap-3 text-[13px] font-medium py-[9px] px-3 rounded-[9px] text-[#718076] min-h-[38px] hover:bg-[#e7ecdf] transition-colors [&.active]:text-forest [&.active]:bg-[#e0e8d8]"
          >
            <Settings2 size={19} />
            Preferências
          </Link>
        </nav>
        <div className="sidebar-bottom mt-auto pt-4">
          <div className="local-note flex gap-2.5 text-xs leading-[1.6] text-[#53654f]">
            <ShieldCheck size={20} className="shrink-0" />
            <span>
              Seu disco.
              <br />
              <strong className="font-medium text-[#344a39]">Na sua máquina.</strong>
            </span>
          </div>
          <p className="text-[11px] text-[#839078] leading-[1.6] pt-2.5 border-t border-[#dce2d3] mt-3">
            Uma limpeza por vez.
            <br />
            Sempre sob seu controle.
          </p>
          <span className="version font-mono text-[#839078] text-[9px] tracking-[1px] block mt-1">
            SPACE / {appVersion}
          </span>
        </div>
      </aside>
      <div className="main-pane ml-[205px] w-[calc(100%-205px)] flex flex-col min-h-screen">
        <header
          className="topbar h-[73px] flex items-center justify-between px-9 border-b border-line shrink-0"
          data-tauri-drag-region
        >
          <span className="device-label text-[11px] text-muted flex gap-2 items-center">
            <span className="status-dot inline-block w-1.5 h-1.5 rounded-full bg-[#719865] shrink-0" />
            {native ? "Seu Mac · leitura local" : "Prévia · dados ilustrativos"}
          </span>
          <button
            className="button subtle compact inline-flex items-center justify-center gap-2 text-[11px] font-medium py-2 px-3 rounded-lg border border-[#e1e5db] bg-transparent text-[#596c5d] hover:bg-[#eaf0e2] transition min-h-[34px] cursor-pointer whitespace-nowrap active:translate-y-[1px]"
            onClick={() => void w.feedback(api.toggleFloating)}
          >
            <PanelTop size={16} />
            Monitor flutuante
            <ArrowUpRight size={15} />
          </button>
        </header>
        {!native && (
          <div className="preview-banner bg-[#f7ebd0] text-[#795d2c] border-b border-[#ebd7b1] text-xs py-2.5 px-9">
            Prévia da interface. Os números são ilustrativos; a limpeza só funciona no app
            instalado.
          </div>
        )}
        {(w.notice || disk.error) && (
          <div
            className="notice flex items-center gap-3 py-3 px-9 bg-[#fde8e8] text-[#8c2e2e] border-b border-[#f3cccc] text-[13px] [&>span]:flex-1 [&>button]:flex [&>button]:text-inherit [&>button]:cursor-pointer"
            role="alert"
          >
            <AlertCircle size={18} className="shrink-0" />
            <span>{w.notice || String(disk.error)}</span>
            <button aria-label="Fechar aviso" onClick={() => w.setNotice("")}>
              <X size={16} />
            </button>
          </div>
        )}
        {w.operation?.running && (
          <div
            className="shared-operation flex items-center gap-3 my-4 mx-9 p-3 bg-[#e6ecdf] border border-line rounded-[10px]"
            role="status"
          >
            <LoaderCircle className="spin animate-spin text-forest shrink-0" size={17} />
            <div className="flex-1 min-w-0">
              <strong className="text-[13px] block font-semibold">{w.operation.label}</strong>
              <code className="block text-[11px] truncate font-mono text-ink mt-0.5">
                {w.operation.progress.path || w.operation.progress.stage}
              </code>
              <small className="block text-[11px] text-muted truncate mt-0.5">
                {w.operation.progress.visited.toLocaleString("pt-BR")} entradas ·{" "}
                {bytes(w.operation.progress.bytes ?? 0)} ·{" "}
                {Math.floor((w.operation.progress.elapsedMs ?? 0) / 1000)} s
              </small>
            </div>
            <button
              className="button subtle compact inline-flex items-center justify-center gap-2 text-[11px] font-medium py-2 px-3 rounded-lg border border-[#dbe1d3] bg-[#f9faf4] text-[#596c5d] hover:bg-[#eaf0e2] transition min-h-[34px] cursor-pointer disabled:opacity-45"
              disabled={w.operation.progress.stage?.startsWith("Instalando")}
              onClick={() => void w.feedback(api.cancel)}
            >
              Interromper
            </button>
          </div>
        )}
        {updates.data?.phase === "available" && (
          <div className="update-notice flex items-center gap-2.5 my-4 mx-9 p-3 bg-[#dfeadd] rounded-[10px] border border-[#c9d8c4] text-[13px] text-forest">
            <Download size={17} className="shrink-0" />
            <span>Space {updates.data.version} está disponível.</span>
            <Link
              to="/settings"
              className="inline-flex items-center gap-1.5 ml-auto font-medium text-forest hover:underline"
            >
              Ver atualização <ArrowRight size={15} />
            </Link>
          </div>
        )}
        <Outlet />
        <footer className="statusbar mt-auto py-[18px] px-9 border-t border-line flex justify-between items-center text-[11px] text-muted">
          <span className="flex items-center gap-2">
            <span className="status-dot inline-block w-1.5 h-1.5 rounded-full bg-[#719865] shrink-0" />
            {w.busy ? "Operação em andamento" : "Tudo pronto"}
          </span>
          <span>
            {disk.data ? bytes(disk.data.free) + " livres" : "Lendo disco…"}
            <span className="footer-separator mx-2 text-[#c8cec4]">/</span>Atualizado a cada 10 s
          </span>
        </footer>
      </div>
    </div>
  );
}
