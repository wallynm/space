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
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <Mark />
          <span>Space</span>
        </div>
        <div className="sidebar-caption">ESPAÇO PARA RESPIRAR</div>
        <nav aria-label="Navegação principal">
          <Link to="/" activeOptions={{ exact: true }}>
            <HardDrive size={19} />
            Visão geral
          </Link>
          <Link to="/explore">
            <FolderTree size={19} />
            Explorador
          </Link>
          <Link to="/projects">
            <Code2 size={19} />
            Projetos
          </Link>
          <Link to="/apps">
            <Package size={19} />
            Apps e resíduos
          </Link>
          <Link to="/docker">
            <Box size={19} />
            Docker
          </Link>
          <Link to="/system">
            <Activity size={19} />
            Diagnóstico
          </Link>
          <Link to="/history">
            <HistoryIcon size={19} />
            Histórico
          </Link>
          <Link to="/settings">
            <Settings2 size={19} />
            Preferências
          </Link>
        </nav>
        <div className="sidebar-bottom">
          <div className="local-note">
            <ShieldCheck size={20} />
            <span>
              Seu disco.
              <br />
              <strong>Na sua máquina.</strong>
            </span>
          </div>
          <p>
            Uma limpeza por vez.
            <br />
            Sempre sob seu controle.
          </p>
          <span className="version">SPACE / {appVersion}</span>
        </div>
      </aside>
      <div className="main-pane">
        <header className="topbar" data-tauri-drag-region>
          <span className="device-label">
            <span className="status-dot" />
            {native ? "Seu Mac · leitura local" : "Prévia · dados ilustrativos"}
          </span>
          <button
            className="button subtle compact"
            onClick={() => void w.feedback(api.toggleFloating)}
          >
            <PanelTop size={16} />
            Monitor flutuante
            <ArrowUpRight size={15} />
          </button>
        </header>
        {!native && (
          <div className="preview-banner">
            Prévia da interface. Os números são ilustrativos; a limpeza só funciona no app
            instalado.
          </div>
        )}
        {(w.notice || disk.error) && (
          <div className="notice" role="alert">
            <AlertCircle size={18} />
            <span>{w.notice || String(disk.error)}</span>
            <button aria-label="Fechar aviso" onClick={() => w.setNotice("")}>
              <X size={16} />
            </button>
          </div>
        )}
        {w.operation?.running && (
          <div className="shared-operation" role="status">
            <LoaderCircle className="spin" size={17} />
            <div>
              <strong>{w.operation.label}</strong>
              <code>{w.operation.progress.path || w.operation.progress.stage}</code>
              <small>
                {w.operation.progress.visited.toLocaleString("pt-BR")} entradas ·{" "}
                {bytes(w.operation.progress.bytes ?? 0)} ·{" "}
                {Math.floor((w.operation.progress.elapsedMs ?? 0) / 1000)} s
              </small>
            </div>
            <button
              className="button subtle compact"
              disabled={w.operation.progress.stage?.startsWith("Instalando")}
              onClick={() => void w.feedback(api.cancel)}
            >
              Interromper
            </button>
          </div>
        )}
        {updates.data?.phase === "available" && (
          <div className="update-notice">
            <Download size={17} />
            <span>Space {updates.data.version} está disponível.</span>
            <Link to="/settings">
              Ver atualização <ArrowRight size={15} />
            </Link>
          </div>
        )}
        <Outlet />
        <footer className="statusbar">
          <span>
            <span className="status-dot" />
            {w.busy ? "Operação em andamento" : "Tudo pronto"}
          </span>
          <span>
            {disk.data ? bytes(disk.data.free) + " livres" : "Lendo disco…"}
            <span className="footer-separator">/</span>Atualizado a cada 10 s
          </span>
        </footer>
      </div>
    </div>
  );
}
