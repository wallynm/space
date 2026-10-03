import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  Box,
  Check,
  CheckCircle2,
  ChevronRight,
  Code2,
  ExternalLink,
  FolderOpen,
  FolderTree,
  HardDrive,
  Layers,
  Leaf,
  LoaderCircle,
  Package,
  ScanLine,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, native } from "../../bridge";
import { bytes, categoryName, date, selectedBytes, shortPath } from "../../format";
import { selectVisible, toggleRange } from "../../selection";
import type { Candidate } from "../../types";
import { useDisk, useWorkspace } from "../../workspace";

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
      <div className="recovery-value">{w.report.data ? bytes(potential) : "Vamos descobrir."}</div>
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

function ReviewDialog({ onClose }: { onClose: () => void }) {
  const w = useWorkspace();
  const ref = useRef<HTMLDialogElement>(null);
  const [phrase, setPhrase] = useState("");
  const [ack, setAck] = useState(false);
  const items = (w.report.data?.candidates ?? []).filter((c) => w.selected.has(c.id) && !c.blocked);
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
        {items.length} itens selecionados. A remoção é permanente e não passa pela Lixeira. Builds e
        caches poderão ser recriados pelos seus apps.
      </p>
      <div className="review-paths">
        {items.map((c) => (
          <div key={c.id}>
            <span>{c.path}</span>
            <strong>{bytes(c.bytes)}</strong>
          </div>
        ))}
      </div>
      {items.some((c) => c.category === "node_modules") && (
        <p>
          As pastas node_modules selecionadas serão removidas. Reinstale as dependências antes de
          executar esses projetos novamente.
        </p>
      )}
      {docker && (
        <div className="docker-warning">
          <strong>
            <AlertCircle size={18} />
            Você selecionou o disco inteiro do Docker.
          </strong>
          <p>
            Isso apaga imagens, containers, volumes e possíveis bancos de dados. O Docker precisa
            estar fechado.
          </p>
          <label>
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
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
          O app confere arquivos alterados, links simbólicos e processos ativos antes de remover. O
          espaço efetivo pode diferir da estimativa.
        </span>
      </div>
      {!native && (
        <p className="native-only">Esta prévia não pode apagar arquivos. Use o app instalado.</p>
      )}
      {w.clean.isError && (
        <p role="alert" className="inline-error">
          {String(w.clean.error)}
        </p>
      )}
      <div className="dialog-actions">
        <button className="button subtle" onClick={onClose} disabled={w.clean.isPending}>
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
            w.clean.mutate({ dockerConfirmation: phrase }, { onSuccess: () => onClose() })
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
      selectAllBox.current.indeterminate =
        !allVisibleSelected && selectable.some((c) => w.selected.has(c.id));
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
          {w.scan.isPending ? <LoaderCircle className="spin" size={18} /> : <ScanLine size={18} />}{" "}
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
          <button className="button subtle compact" onClick={() => void w.feedback(api.cancel)}>
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
      <section
        className="files-section"
        onKeyDown={(e) => {
          const target = e.target as HTMLElement;
          if (
            review ||
            target.closest('textarea, [contenteditable="true"], input:not([type="checkbox"])')
          )
            return;
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
            e.preventDefault();
            selectAll();
          }
        }}
      >
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
                <input
                  ref={selectAllBox}
                  type="checkbox"
                  aria-label="Selecionar todos os itens visíveis"
                  checked={allVisibleSelected}
                  disabled={w.busy || !selectable.length}
                  onChange={() =>
                    w.setSelected((old) => selectVisible(old, visible, !allVisibleSelected))
                  }
                />
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
                      role="row"
                      tabIndex={c.blocked || w.busy ? -1 : 0}
                      aria-label={c.label}
                      onClick={(e) => {
                        if (!(e.target as HTMLElement).closest("button, input")) {
                          toggle(c, e.shiftKey);
                        }
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
                        onClick={(e) => {
                          e.stopPropagation();
                          toggle(c, e.shiftKey);
                        }}
                      />
                      <div className={"category-icon category-" + c.category}>
                        <Icon size={20} />
                      </div>
                      <div className="candidate-name">
                        <strong>{c.label}</strong>
                        <button
                          title={c.path}
                          onClick={() => void w.feedback(() => api.reveal(c.path))}
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
                      <span className={"type-pill " + (c.risk === "data" ? "data-risk" : "")}>
                        {c.risk === "data" ? "Dados · atenção" : "Regenerável"}
                      </span>
                      <span className="file-size">{bytes(c.bytes)}</span>
                      <button
                        className="icon-button"
                        title="Mostrar no Finder"
                        aria-label={"Mostrar " + c.path + " no Finder"}
                        onClick={() => void w.feedback(() => api.reveal(c.path))}
                      >
                        <ChevronRight size={17} />
                      </button>
                    </div>
                  );
                })
              ) : (
                <div className="empty-filter">Nenhuma pasta com este filtro.</div>
              )}
            </div>
            {w.filter === "node_modules" && (
              <p className="selection-hint">
                Dependências dos projetos. Após remover, será preciso instalá-las novamente.
              </p>
            )}
            <p className="selection-hint">
              Shift + clique seleciona um intervalo · ⌘A / Ctrl+A seleciona os itens visíveis
            </p>
            <div className="selection-bar">
              <button
                className="text-button"
                disabled={w.busy || !selectable.length}
                onClick={selectAll}
              >
                <Check size={15} /> Selecionar todos
              </button>
              <button
                className="text-button"
                disabled={w.busy}
                onClick={() =>
                  w.setSelected((old) =>
                    selectVisible(
                      old,
                      visible.filter((c) => c.risk === "cache" && c.category !== "node_modules"),
                    ),
                  )
                }
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
                  Pastas protegidas ou inacessíveis foram preservadas. A análise cobre apenas os
                  locais acessíveis.
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
            <button className="text-button" disabled={w.busy} onClick={() => w.scan.mutate()}>
              Começar análise <ArrowRight size={16} />
            </button>
          </div>
        )}
      </section>
      <div className="scope-note">
        <ShieldCheck size={16} />
        <span>
          A limpeza rápida procura builds e caches. Código, dependências e arquivos pessoais ficam
          fora da seleção automática.
        </span>
      </div>
      {review && <ReviewDialog onClose={() => setReview(false)} />}
    </main>
  );
}
