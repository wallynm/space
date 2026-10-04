import { toggleRange, selectVisible } from "./selection";
import { ProtectedFolders, Updates } from "./settings-tools";
import { desktopApi } from "./desktop-api";
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet } from "@tanstack/react-router";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  ArrowUpRight,
  ArrowRight,
  HardDrive,
  Layers,
  History as HistoryIcon,
  Settings2,
  PanelTop,
  ScanLine,
  Check,
  ShieldCheck,
  FolderOpen,
  Plus,
  X,
  Box,
  Code2,
  Package,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Search,
  Leaf,
  ExternalLink,
  LoaderCircle,
  FolderTree,
  Pin,
  Trash2,
  Activity,
  Undo2,
  Download,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api, native } from "./bridge";
import { bytes, categoryName, shortPath, selectedBytes, date } from "./format";
import { useDisk, useHistory, useWorkspace } from "./workspace";
import type { Candidate } from "./types";
import { MonitorPreferences } from "./tool-screens";
import { toolsApi } from "./tools-api";
import spaceIcon from "./assets/space-icon.png";
import { version as appVersion } from "../package.json";
const icons: Record<string, LucideIcon> = {
  rust: Code2,
  next: Layers,
  npm: Package,
  node_modules: Package,
  python: Box,
  packages: Package,
  xcode: Code2,
  docker: Box,
};
function Mark({ size = 30 }: { size?: number }) {
  return (
    <img
      className="brand-mark select-none"
      src={spaceIcon}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
    />
  );
}
export function Shell() {
  const w = useWorkspace();
  const disk = useDisk();
  const client = useQueryClient(),
    checked = useRef(false);
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
            Prévia da interface. Os números são ilustrativos; a limpeza só
            funciona no app instalado.
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
              <code>
                {w.operation.progress.path || w.operation.progress.stage}
              </code>
              <small>
                {w.operation.progress.visited.toLocaleString("pt-BR")} entradas
                · {bytes(w.operation.progress.bytes ?? 0)} ·{" "}
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
function DiskCard() {
  const { data: disk, isPending, error } = useDisk();
  const percentage = disk ? Math.round((disk.used / disk.total) * 100) : 0;
  return (
    <section className="disk-card" aria-label="Uso do disco">
      <div className="disk-heading">
        <HardDrive size={18} />
        <span>DISCO PRINCIPAL</span>
        <span className="disk-chip">
          {disk && disk.free / disk.total < 0.15 ? "Pouco espaço" : "Com folga"}
        </span>
      </div>
      <div className="disk-card-body">
        <div>
          <div className="eyebrow">DISPONÍVEL AGORA</div>
          <div className="free-number">
            {disk ? bytes(disk.free).split(" ")[0] : "—"}
            <span>{disk ? bytes(disk.free).split(" ")[1] : ""}</span>
          </div>
          <p>
            {error
              ? "Não foi possível ler o disco"
              : isPending
                ? "Consultando o sistema…"
                : "de " + bytes(disk!.total) + " de capacidade"}
          </p>
        </div>
        <div
          className="disk-ring"
          style={{
            background:
              "conic-gradient(var(--mint) 0deg " +
              percentage * 3.6 +
              "deg, #ffffff22 " +
              percentage * 3.6 +
              "deg 360deg)",
          }}
        >
          <div>
            <span>
              {percentage}
              <small>%</small>
            </span>
            <em>utilizado</em>
          </div>
        </div>
      </div>
      <div className="disk-legend">
        <span>
          <i />
          {disk ? bytes(disk.used) : "—"} utilizados
        </span>
        <span>
          <i className="free-dot" />
          {disk ? bytes(disk.free) : "—"} livres
        </span>
      </div>
    </section>
  );
}
function RecoveryCard() {
  const w = useWorkspace();
  const items = w.report.data?.candidates ?? [];
  const potential = items
    .filter((c) => !c.blocked && c.risk === "cache")
    .reduce((t, c) => t + c.bytes, 0);
  return (
    <section className="recovery-card">
      <div className="disk-heading">
        <Leaf size={18} />
        <span>ESPAÇO RECUPERÁVEL</span>
      </div>
      <div className="recovery-value">
        {w.report.data ? bytes(potential) : "Vamos descobrir."}
      </div>
      <p>
        {w.report.data
          ? items.filter((c) => !c.blocked && c.risk === "cache").length +
            " caches e builds identificados. Confira os caminhos antes de limpar."
          : "Encontre builds e caches que acumularam com o tempo. Seus projetos continuam no lugar."}
      </p>
      <div className="recovery-bottom">
        <span>
          <ShieldCheck size={16} />
          Análise sem exclusão
        </span>
        <span className="tiny-arrow">
          <ArrowUpRight size={19} style={{ transform: "rotate(90deg)" }} />
        </span>
      </div>
    </section>
  );
}
export function Dashboard() {
  const w = useWorkspace();
  const disk = useDisk();
  const [search, setSearch] = useState("");
  const [review, setReview] = useState(false);
  const report = w.report.data;
  const all = report?.candidates ?? [];
  const categories = [...new Set([...all.map((c) => c.category), "node_modules"])];
  const anchor = useRef<string | null>(null);
  const selectAllBox = useRef<HTMLInputElement>(null);
  const visible = all.filter(
    (c) =>
      (w.filter === "all" || c.category === w.filter) &&
      (c.path.toLowerCase().includes(search.toLowerCase()) ||
        c.label.toLowerCase().includes(search.toLowerCase())),
  );
  const selected = all.filter((c) => w.selected.has(c.id) && !c.blocked);
  const total = selectedBytes(all, w.selected);
  const selectable = visible.filter((c) => !c.blocked);
  const allVisibleSelected = selectable.length > 0 && selectable.every((c) => w.selected.has(c.id));
  useEffect(() => {
    anchor.current = null;
  }, [w.filter, search, report?.id]);
  useEffect(() => {
    if (selectAllBox.current) {
      selectAllBox.current.indeterminate = !allVisibleSelected && selectable.some((c) => w.selected.has(c.id));
    }
  }, [allVisibleSelected, selectable, w.selected]);
  const toggle = (c: Candidate, shift = false) => {
    if (w.busy || c.blocked) return;
    const from = anchor.current;
    w.setSelected((old) => toggleRange(old, visible, c.id, shift ? from : null));
    if (!shift || !visible.some((item) => item.id === from)) anchor.current = c.id;
  };
  const selectAll = () => {
    if (!w.busy) w.setSelected((old) => selectVisible(old, visible));
  };

  return (
    <main className="content dashboard">
      <div className="page-heading">
        <div>
          <div className="eyebrow">MENOS EXCESSO. MAIS ESPAÇO.</div>
          <h1>
            Deixe seu disco respirar<span>.</span>
          </h1>
          <p>Veja o que ocupa espaço. Escolha o que pode sair.</p>
        </div>
        <button
          className="button primary"
          disabled={w.busy || !w.roots.length}
          onClick={() => w.scan.mutate()}
        >
          {w.scan.isPending ? (
            <LoaderCircle className="spin" size={18} />
          ) : (
            <ScanLine size={18} />
          )}{" "}
          {report ? "Analisar novamente" : "Analisar disco"}
        </button>
      </div>
      <div className="overview-grid">
        <DiskCard />
        <RecoveryCard />
      </div>
      {w.busy && (
        <div className="operation" role="status">
          <LoaderCircle className="spin" size={20} />
          <div>
            <strong>
              {w.clean.isPending
                ? "Removendo os itens selecionados"
                : w.map.isPending
                  ? "Medindo a pasta escolhida"
                  : "Analisando builds e caches"}
            </strong>
            <span title={w.progress?.path}>
              {w.progress
                ? w.progress.visited.toLocaleString("pt-BR") +
                  " diretórios · " +
                  shortPath(w.progress.path, disk.data?.home)
                : "Preparando a análise…"}
            </span>
          </div>
          <button
            className="button subtle compact"
            onClick={() => void w.feedback(api.cancel)}
          >
            Interromper
          </button>
        </div>
      )}
      {w.lastResult && (
        <div className="result-banner" role="status">
          <CheckCircle2 size={26} />
          <div>
            <strong>
              {w.lastResult.removed.length
                ? bytes(w.lastResult.freedBytes) + " efetivamente liberados"
                : "Os itens foram preservados"}
            </strong>
            <p>
              {w.lastResult.removed.length} itens removidos
              {w.lastResult.skipped.length
                ? " · " + w.lastResult.skipped.length + " itens preservados"
                : ""}
              . Confira os detalhes no histórico.
            </p>
          </div>
          <Link to="/history">
            Ver histórico <ArrowRight size={16} />
          </Link>
        </div>
      )}
      <section className="files-section" onKeyDown={(e) => {
        const target = e.target as HTMLElement;
        if (review || target.closest('textarea, [contenteditable="true"], input:not([type="checkbox"])')) return;
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
          e.preventDefault();
          selectAll();
        }
      }}>
        <div className="section-heading">
          <div>
            <h2>
              O que pode sair <span>{all.length || "—"}</span>
            </h2>
            <p>
              {report
                ? "Última análise: " +
                  date(report.createdAt) +
                  " · " +
                  report.scannedDirs.toLocaleString("pt-BR") +
                  " diretórios"
                : "Uma análise local identifica os arquivos que podem ser regenerados."}
            </p>
          </div>
          <Link className="button subtle compact" to="/explore">
            <FolderTree size={16} />
            Mapa de pastas
          </Link>
        </div>
        {report ? (
          <>
            <div className="list-toolbar">
              <div className="filters">
                <button
                  className={w.filter === "all" ? "active" : ""}
                  onClick={() => w.setFilter("all")}
                >
                  Todos
                </button>
                {categories.map((category) => (
                  <button
                    key={category}
                    className={w.filter === category ? "active" : ""}
                    onClick={() => w.setFilter(category)}
                  >
                    {categoryName(category)}
                  </button>
                ))}
              </div>
              <label className="search-field">
                <Search size={15} />
                <input
                  aria-label="Buscar pastas"
                  placeholder="Buscar pasta…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
            </div>
            <div className="list-header">
              <label className="select-all-label">
                <input ref={selectAllBox} type="checkbox" aria-label="Selecionar todos os itens visíveis"
                  checked={allVisibleSelected} disabled={w.busy || !selectable.length}
                  onChange={() => w.setSelected((old) => selectVisible(old, visible, !allVisibleSelected))} />
                PASTA / ORIGEM
              </label>
              <span>TIPO</span>
              <span>TAMANHO</span>
            </div>
            <div className="candidate-list">
              {visible.length ? (
                visible.map((c) => {
                  const Icon = icons[c.category] ?? FolderOpen;
                  return (
                    <div
                      key={c.id}
                      tabIndex={c.blocked || w.busy ? -1 : 0}
                      aria-label={c.label}
                      onClick={(e) => {
                        if (!(e.target as HTMLElement).closest("button, input")) toggle(c, e.shiftKey);
                      }}
                      onKeyDown={(e) => {
                        if (e.target === e.currentTarget && (e.key === " " || e.key === "Enter")) {
                          e.preventDefault();
                          toggle(c, e.shiftKey);
                        }
                      }}
                      className={
                        "candidate-row " +
                        (c.blocked ? "blocked " : "") +
                        (w.selected.has(c.id) ? "selected" : "")
                      }
                    >
                      <input
                        aria-label={"Selecionar " + c.path}
                        type="checkbox"
                        checked={w.selected.has(c.id)}
                        disabled={!!c.blocked || w.busy}
                        onChange={() => {}}
                        onClick={(e) => { e.stopPropagation(); toggle(c, e.shiftKey); }}
                      />
                      <div className={"category-icon category-" + c.category}>
                        <Icon size={20} />
                      </div>
                      <div className="candidate-name">
                        <strong>{c.label}</strong>
                        <button
                          title={c.path}
                          onClick={() =>
                            void w.feedback(() => api.reveal(c.path))
                          }
                        >
                          {shortPath(c.path, disk.data?.home)}
                          <ExternalLink size={12} />
                        </button>
                        {c.blocked && (
                          <small>
                            <ShieldCheck size={12} />
                            {c.blocked}
                          </small>
                        )}
                      </div>
                      <span
                        className={
                          "type-pill " + (c.risk === "data" ? "data-risk" : "")
                        }
                      >
                        {c.risk === "data" ? "Dados · atenção" : "Regenerável"}
                      </span>
                      <span className="file-size">{bytes(c.bytes)}</span>
                      <button
                        className="icon-button"
                        title="Mostrar no Finder"
                        aria-label={"Mostrar " + c.path + " no Finder"}
                        onClick={() =>
                          void w.feedback(() => api.reveal(c.path))
                        }
                      >
                        <ChevronRight size={17} />
                      </button>
                    </div>
                  );
                })
              ) : (
                <div className="empty-filter">
                  Nenhuma pasta com este filtro.
                </div>
              )}
            </div>
            {w.filter === "node_modules" && <p className="selection-hint">Dependências dos projetos. Após remover, será preciso instalá-las novamente.</p>}
            <p className="selection-hint">Shift + clique seleciona um intervalo · ⌘A / Ctrl+A seleciona os itens visíveis</p>
            <div className="selection-bar">
              <button className="text-button" disabled={w.busy || !selectable.length} onClick={selectAll}>
                <Check size={15} /> Selecionar todos
              </button>
              <button
                className="text-button"
                disabled={w.busy}
                onClick={() => w.setSelected((old) => selectVisible(old, visible.filter((c) => c.risk === "cache" && c.category !== "node_modules")))}
              >
                <Check size={15} />
                Selecionar caches
              </button>
              <button
                className="text-button muted"
                disabled={w.busy}
                onClick={() => w.setSelected(new Set())}
              >
                Limpar seleção
              </button>
              <div className="selection-total">
                <span>{selected.length} selecionados</span>
                <strong>{bytes(total)}</strong>
              </div>
              <button
                className="button primary"
                disabled={!selected.length || w.busy}
                onClick={() => setReview(true)}
              >
                Revisar limpeza <ArrowRight size={16} />
              </button>
            </div>
            {report.warnings.length > 0 && (
              <details className="warnings">
                <summary>
                  <AlertCircle size={15} />
                  {report.warnings.length} pastas não puderam ser lidas
                </summary>
                <p>
                  Pastas protegidas ou inacessíveis foram preservadas. A análise
                  cobre apenas os locais acessíveis.
                </p>
                {report.warnings.map((warning, i) => (
                  <code key={i}>{warning}</code>
                ))}
              </details>
            )}
          </>
        ) : (
          <div className="empty-state">
            <div className="empty-illustration">
              <div className="folder-back" />
              <div className="folder-front">
                <Leaf size={34} />
              </div>
              <span className="spark spark-one">+</span>
              <span className="spark spark-two">+</span>
            </div>
            <h3>Há espaço escondido nos excessos.</h3>
            <p>
              Analise seus projetos e caches para encontrar
              <br />o que pode ser removido com revisão.
            </p>
            <button
              className="text-button"
              disabled={w.busy}
              onClick={() => w.scan.mutate()}
            >
              Começar análise <ArrowRight size={16} />
            </button>
          </div>
        )}
      </section>
      <div className="scope-note">
        <ShieldCheck size={16} />
        <span>
          A limpeza rápida procura builds e caches. Código, dependências e
          arquivos pessoais ficam fora da seleção automática.
        </span>
      </div>
      {review && <ReviewDialog onClose={() => setReview(false)} />}
    </main>
  );
}
function ReviewDialog({ onClose }: { onClose: () => void }) {
  const w = useWorkspace();
  const ref = useRef<HTMLDialogElement>(null);
  const [phrase, setPhrase] = useState("");
  const [ack, setAck] = useState(false);
  const items = (w.report.data?.candidates ?? []).filter(
    (c) => w.selected.has(c.id) && !c.blocked,
  );
  const docker = items.some((c) => c.category === "docker");
  const total = items.reduce((t, c) => t + c.bytes, 0);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="review-dialog"
      onCancel={(e) => {
        if (w.clean.isPending) e.preventDefault();
        else onClose();
      }}
    >
      <div className="dialog-top">
        <div className="dialog-symbol">
          <Trash2 size={24} />
        </div>
        <button
          className="icon-button"
          aria-label="Fechar revisão"
          disabled={w.clean.isPending}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <div className="eyebrow">REVISÃO FINAL</div>
      <h2>Recuperar {bytes(total)}?</h2>
      <p>
        {items.length} itens selecionados. A remoção é permanente e não passa
        pela Lixeira. Builds e caches poderão ser recriados pelos seus apps.
      </p>
      <div className="review-paths">
        {items.map((c) => (
          <div key={c.id}>
            <span>{c.path}</span>
            <strong>{bytes(c.bytes)}</strong>
          </div>
        ))}
      </div>
      {items.some((c) => c.category === "node_modules") && <p>As pastas node_modules selecionadas serão removidas. Reinstale as dependências antes de executar esses projetos novamente.</p>}
      {docker && (
        <div className="docker-warning">
          <strong>
            <AlertCircle size={18} />
            Você selecionou o disco inteiro do Docker.
          </strong>
          <p>
            Isso apaga imagens, containers, volumes e possíveis bancos de dados.
            O Docker precisa estar fechado.
          </p>
          <label>
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
            />
            Entendo que todos os dados do Docker serão removidos.
          </label>
          <label className="phrase-label">
            Digite APAGAR DOCKER
            <input
              placeholder="APAGAR DOCKER"
              autoComplete="off"
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
            />
          </label>
        </div>
      )}
      <div className="review-note">
        <ShieldCheck size={18} />
        <span>
          O app confere arquivos alterados, links simbólicos e processos ativos
          antes de remover. O espaço efetivo pode diferir da estimativa.
        </span>
      </div>
      {!native && (
        <p className="native-only">
          Esta prévia não pode apagar arquivos. Use o app instalado.
        </p>
      )}
      {w.clean.isError && (
        <p role="alert" className="inline-error">
          {String(w.clean.error)}
        </p>
      )}
      <div className="dialog-actions">
        <button
          className="button subtle"
          onClick={onClose}
          disabled={w.clean.isPending}
        >
          Voltar
        </button>
        <button
          className="button primary"
          disabled={
            !native ||
            w.clean.isPending ||
            !items.length ||
            (docker && (!ack || phrase !== "APAGAR DOCKER"))
          }
          onClick={() =>
            w.clean.mutate(
              { dockerConfirmation: phrase },
              { onSuccess: () => onClose() },
            )
          }
        >
          {w.clean.isPending ? (
            <>
              <LoaderCircle className="spin" size={17} />
              Removendo…
            </>
          ) : (
            <>
              Remover {bytes(total)}
              <ArrowRight size={17} />
            </>
          )}
        </button>
      </div>
    </dialog>
  );
}
export function History() {
  const w = useWorkspace();
  const history = useHistory();
  const client = useQueryClient();
  const restore = useMutation({
    mutationFn: ({ recordId, itemId }: { recordId: string; itemId: string }) =>
      toolsApi.restore(recordId, itemId),
    onSuccess: (data) => {
      client.setQueryData(["history"], data);
      void client.invalidateQueries({ queryKey: ["disk"] });
    },
    onError: (e) => w.setNotice(String(e)),
  });
  const records = history.data ?? [];
  return (
    <main className="content">
      <div className="page-heading">
        <div>
          <div className="eyebrow">CADA LIMPEZA, UM REGISTRO.</div>
          <h1>
            Espaço recuperado<span>.</span>
          </h1>
          <p>Confira o que saiu e o que foi preservado.</p>
        </div>
      </div>
      <div className="history-summary">
        <HistoryIcon size={23} />
        <div>
          <span>Total registrado</span>
          <strong>
            {bytes(records.reduce((t, r) => t + r.freedBytes, 0))}
          </strong>
        </div>
        <span>
          {records.length} {records.length === 1 ? "limpeza" : "limpezas"}
        </span>
      </div>
      {history.isPending ? (
        <div className="empty-state">
          <LoaderCircle className="spin" />
        </div>
      ) : history.isError ? (
        <div role="alert" className="notice">
          {String(history.error)}
        </div>
      ) : !records.length ? (
        <div className="empty-state history-empty">
          <HistoryIcon size={36} />
          <h3>Seu histórico começa aqui.</h3>
          <p>
            Depois da primeira limpeza, os caminhos removidos
            <br />e o espaço efetivo recuperado aparecem nesta tela.
          </p>
          <Link to="/" className="text-button">
            Voltar para análise <ArrowRight size={16} />
          </Link>
        </div>
      ) : (
        records.map((record) => (
          <details className="history-record" key={record.id}>
            <summary>
              <div className="history-check">
                <Check size={20} />
              </div>
              <div>
                <strong>{date(record.createdAt)}</strong>
                <p>
                  {record.removed.length}{" "}
                  {record.mode?.startsWith("trash")
                    ? "itens na Lixeira"
                    : "itens removidos"}{" "}
                  · {record.skipped.length} preservados
                </p>
              </div>
              <strong className="history-size">
                + {bytes(record.freedBytes)}
              </strong>
              <ChevronDown size={18} />
            </summary>
            <div className="history-details">
              <h3>
                {record.mode?.startsWith("trash")
                  ? "Enviados à Lixeira"
                  : "Removidos"}
              </h3>
              {record.removed.map((path) => {
                const item = record.recovery?.find((i) => i.original === path);
                return (
                  <div className="history-recovery" key={path}>
                    <code>{path}</code>
                    {item && (
                      <button
                        className="text-button"
                        title={
                          item.fingerprint == null
                            ? "Recupere manualmente pelo Finder"
                            : undefined
                        }
                        disabled={
                          !native ||
                          w.busy ||
                          item.restored ||
                          item.fingerprint == null
                        }
                        onClick={() =>
                          restore.mutate({
                            recordId: record.id,
                            itemId: item.id,
                          })
                        }
                      >
                        <Undo2 size={14} />
                        {item.restored ? "Recuperado" : "Recuperar"}
                      </button>
                    )}
                  </div>
                );
              })}
              {record.skipped.length > 0 && (
                <>
                  <h3>Preservados / erros</h3>
                  {record.skipped.map((path) => (
                    <code key={path}>{path}</code>
                  ))}
                </>
              )}
              {record.mode?.startsWith("trash") ? (
                <>
                  <p>
                    {bytes(record.movedBytes ?? record.removedBytes)} enviados à
                    Lixeira. Estes itens ainda ocupam disco. Use Recuperar para
                    voltar ao caminho original. Se a recuperação automática
                    estiver indisponível, arraste o item da Lixeira no Finder.
                    Um arquivo existente no destino será preservado.
                  </p>
                  <button
                    className="button subtle compact"
                    onClick={() => void w.feedback(toolsApi.openTrash)}
                  >
                    <Trash2 size={16} />
                    Abrir Lixeira
                  </button>
                </>
              ) : (
                <p>
                  Tamanho estimado dos recursos removidos:{" "}
                  {bytes(record.removedBytes)}. Espaço efetivo é a diferença
                  medida no disco.
                </p>
              )}
            </div>
          </details>
        ))
      )}
      <div className="scope-note">
        <ShieldCheck size={17} />
        <span>
          Histórico armazenado localmente. Até 100 registros de limpeza.
        </span>
      </div>
    </main>
  );
}
export function Settings() {
  const w = useWorkspace();
  const add = async () => {
    try {
      const path = await api.pickFolder();
      if (path && !w.roots.includes(path)) w.setRoots([...w.roots, path]);
    } catch (e) {
      w.setNotice(String(e));
    }
  };
  return (
    <main className="content">
      <div className="page-heading">
        <div>
          <div className="eyebrow">DO SEU JEITO.</div>
          <h1>
            Um pouco de controle<span>.</span>
          </h1>
          <p>Escolha onde procurar e como acompanhar o disco.</p>
        </div>
      </div>
      <section className="settings-card">
        <div className="section-heading">
          <div>
            <h2>Pastas de projetos</h2>
            <p>A análise procura builds e caches nestes locais.</p>
          </div>
          <button
            className="button subtle compact"
            disabled={w.busy}
            onClick={() => void add()}
          >
            <Plus size={16} />
            Adicionar pasta
          </button>
        </div>
        <div className="roots-list">
          {w.roots.map((path) => (
            <div key={path}>
              <FolderOpen size={19} />
              <code>{path}</code>
              <button
                className="icon-button"
                disabled={w.busy}
                aria-label={"Remover " + path + " da análise"}
                onClick={() => w.setRoots(w.roots.filter((p) => p !== path))}
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
        <p className="setting-caption">
          Caches conhecidos de npm, Python, Homebrew e Xcode também são
          conferidos. Excluir um local desta lista não apaga seus arquivos.
        </p>
      </section>
      <section className="settings-card">
        <div className="section-heading">
          <div>
            <h2>Monitor flutuante</h2>
            <p>Uma janela pequena, arrastável e sempre visível.</p>
          </div>
          <button
            className="button subtle compact"
            onClick={() => void w.feedback(api.toggleFloating)}
          >
            <PanelTop size={16} />
            Mostrar / ocultar
          </button>
        </div>
      </section>
      <ProtectedFolders />
      <MonitorPreferences />
      <Updates />
      <section className="settings-card principles">
        <ShieldCheck size={23} />
        <div>
          <h2>Você decide o que sai.</h2>
          <p>
            A análise de pastas é manual. O monitor pode registrar o espaço
            livre em segundo plano. Nenhuma limpeza acontece automaticamente.
            Cada exclusão exige uma seleção e revisão; dados do Docker exigem
            confirmação adicional.
          </p>
        </div>
      </section>
      <div className="about-line">
        <Mark size={24} />
        <span>Space {appVersion}</span>
        <span>Feito para rodar na sua máquina.</span>
      </div>
    </main>
  );
}
export function Floating() {
  const disk = useDisk();
  const w = useWorkspace();
  const percentage = disk.data
    ? Math.round((disk.data.used / disk.data.total) * 100)
    : 0;
  const [threshold, setThreshold] = useState(() =>
    Number(localStorage.getItem("folga.threshold") ?? 15),
  );
  useEffect(() => {
    const changed = (e: StorageEvent) => {
      if (e.key === "folga.threshold") setThreshold(Number(e.newValue ?? 15));
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
          if (
            native &&
            e.button === 0 &&
            !(e.target as HTMLElement).closest("button")
          )
            void getCurrentWindow().startDragging();
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
        <div className="floating-number">
          {disk.data ? bytes(disk.data.free) : "—"}
        </div>
        <div className="floating-meter">
          <span style={{ width: percentage + "%" }} />
        </div>
        <div className="floating-detail">
          <span>{percentage}% utilizado</span>
          <span>{disk.data ? bytes(disk.data.total) : "Lendo…"} no total</span>
        </div>
        <div
          className={"floating-status " + (low ? "low" : "")}
          title={w.operation?.progress.path}
        >
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
            void w.feedback(
              w.operation?.running ? api.cancel : () => api.showMain(true),
            )
          }
        >
          {w.operation?.running ? "Interromper operação" : "Analisar e limpar"}
          <ArrowUpRight size={17} />
        </button>
      </div>
      <div className="floating-footer">
        <span>
          {native ? "LOCAL · EM TEMPO REAL" : "PRÉVIA · DADOS ILUSTRATIVOS"}
        </span>
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
