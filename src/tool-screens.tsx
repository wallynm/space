import { PermissionHelp } from "./settings-tools";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  FolderOpen,
  FolderTree,
  File,
  Copy,
  Trash2,
  Search,
  LoaderCircle,
  ShieldCheck,
  X,
  Eye,
  Box,
  Package,
  Layers,
  Activity,
  AlertCircle,
  Monitor,
  Code2,
  ArrowLeft,
  RefreshCw,
  Bell,
} from "lucide-react";
import { api, native } from "./bridge";
import { toolsApi } from "./tools-api";
import { useTools, useMonitor } from "./tools-context";
import { useDisk, useWorkspace } from "./workspace";
import { bytes, date, shortPath } from "./format";
import { treemap } from "./treemap";
import type { FileEntry, MapNode, DockerItem, FolderReview } from "./types";
function Heading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>
          {title}
          <span>.</span>
        </h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
function Empty({
  icon,
  heading,
  description,
  children,
}: {
  icon: ReactNode;
  heading: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="tool-empty">
      {icon}
      <h3>{heading}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}
function Operation({ label }: { label: string }) {
  const w = useWorkspace();
  return (
    <div className="operation">
      <LoaderCircle className="spin" size={20} />
      <div>
        <strong>{label}</strong>
        <code>{w.progress?.path || "Preparando leitura nativa…"}</code>
        <small className="operation-detail">
          {w.progress?.stage ?? label} ·{" "}
          {(w.progress?.visited ?? 0).toLocaleString("pt-BR")} entradas ·{" "}
          {bytes(w.progress?.bytes ?? 0)} encontrados ·{" "}
          {Math.floor((w.progress?.elapsedMs ?? 0) / 1000)} s
          {w.progress?.reusedDirectories
            ? ` · ${w.progress.reusedDirectories} pastas reutilizadas`
            : ""}
        </small>
      </div>
      <button
        className="button subtle compact"
        onClick={() => void w.feedback(api.cancel)}
      >
        Interromper
      </button>
    </div>
  );
}
function Warnings({ items }: { items: string[] }) {
  return items.length > 0 ? (
    <details className="warnings">
      <summary>
        <AlertCircle size={15} />
        {items.length} avisos de análise
      </summary>
      {items.map((s, i) => (
        <code key={i}>{s}</code>
      ))}
    </details>
  ) : null;
}
function Selection({
  count,
  size,
  onClear,
  onReview,
  label = "Enviar à Lixeira",
  disabled = false,
}: {
  count: number;
  size: number;
  onClear: () => void;
  onReview: () => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <div className="selection-bar tool-selection">
      <span>
        {count} {count === 1 ? "item selecionado" : "itens selecionados"}
      </span>
      <button
        className="text-button muted"
        disabled={disabled}
        onClick={onClear}
      >
        Limpar seleção
      </button>
      <strong>{bytes(size)}</strong>
      <button
        className="button primary"
        disabled={!count || disabled}
        onClick={onReview}
      >
        {label}
        <ArrowRight size={16} />
      </button>
    </div>
  );
}
function Review({
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
  const ref = useRef<HTMLDialogElement>(null),
    [value, setValue] = useState(""),
    [ack, setAck] = useState(false);
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
            <strong>
              {i.bytes == null ? "Tamanho desconhecido" : bytes(i.bytes)}
            </strong>
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
      {!native && (
        <p className="native-only">
          Alterações disponíveis somente no app instalado.
        </p>
      )}
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
export function Explorer() {
  const t = useTools(),
    w = useWorkspace(),
    disk = useDisk();
  const [tab, setTab] = useState<"map" | "large" | "duplicates">("map"),
    [trail, setTrail] = useState<string[]>([]),
    [review, setReview] = useState(false);
  const [folderReview, setFolderReview] = useState<FolderReview | null>(null);
  const r = t.catalog.data;
  const path = trail[0] === r?.root ? trail.at(-1)! : (r?.root ?? "");
  useEffect(() => { setFolderReview(null); }, [r?.root, tab, path]);
  const reviewFolder = (folder: string) => {
    t.trashFolder.reset();
    t.reviewFolder.mutate(folder, { onSuccess: setFolderReview });
  };
  const children = useQuery({
    queryKey: ["catalog-children", r?.id, r?.revision, path],
    queryFn: () => toolsApi.children(r!.id, path),
    enabled: !!r && tab === "map",
    staleTime: Infinity,
  });
  const choose = async () => {
    try {
      const folder = await api.pickFolder();
      if (folder) t.scan.mutate(folder);
    } catch (e) {
      w.setNotice(String(e));
    }
  };
  const scanHome = () => {
    if (disk.data) t.scan.mutate(disk.data.home);
  };
  const drill = (n: MapNode) => {
    if (n.directory)
      setTrail(trail[0] === r?.root ? [...trail, n.path] : [r!.root, n.path]);
    else void w.feedback(() => toolsApi.preview(n.path));
  };
  const nodes = children.data ?? [],
    shown = nodes.filter((n) => n.bytes > 0).slice(0, 40);
  const remaining = nodes
    .filter((n) => n.bytes > 0)
    .slice(40)
    .reduce((s, n) => s + n.bytes, 0);
  const tiles = remaining
    ? [
        ...shown,
        {
          path: "__other",
          name: "Outros itens",
          bytes: remaining,
          directory: false,
          incomplete: false,
        },
      ]
    : shown;
  const rectangles = treemap(tiles.map((n) => n.bytes));
  const selection =
    tab === "duplicates" ? t.duplicateSelection : t.fileSelection;
  const selectedFiles =
    tab === "duplicates"
      ? (t.duplicates ?? [])
          .flatMap((g) => g.files)
          .filter((f) => selection.has(f.id))
      : (r?.files ?? []).filter((f) => selection.has(f.id));
  const reviewIdentity = selectedFiles.map((f) => f.id + ":" + f.bytes).sort().join("|");
  useEffect(() => { setReview(false); }, [r?.root, reviewIdentity]);
  return (
    <main className="content tool-content">
      <Heading
        eyebrow="UM OLHAR MAIS DE PERTO"
        title="Encontre o espaço"
        description="Explore as pastas. Escolha o que faz sentido guardar."
        action={
          <button
            className="button subtle compact"
            disabled={w.busy}
            onClick={() => void choose()}
          >
            <FolderOpen size={16} />
            Escolher pasta
          </button>
        }
      />
      <div
        className="tool-tabs"
        role="tablist"
        aria-label="Ferramentas de arquivos"
      >
        {(
          [
            ["map", FolderTree, "Mapa visual"],
            ["large", File, "Grandes e antigos"],
            ["duplicates", Copy, "Duplicados"],
          ] as const
        ).map(([id, Icon, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
          >
            <Icon size={17} />
            {label}
          </button>
        ))}
      </div>
      {t.scan.isPending || t.find.isPending || t.trash.isPending ? (
        <Operation
          label={
            t.find.isPending
              ? "Comparando o conteúdo completo…"
              : t.trash.isPending
                ? "Enviando arquivos à Lixeira…"
                : "Medindo arquivos e projetos…"
          }
        />
      ) : !r ? (
        <Empty
          icon={<FolderTree size={38} />}
          heading="O tamanho conta uma história."
          description="Analise sua pasta pessoal ou escolha um local. A leitura pode levar alguns minutos."
        >
          <button
            className="button primary"
            disabled={w.busy || !disk.data}
            onClick={scanHome}
          >
            Analisar pasta pessoal
            <ArrowRight size={16} />
          </button>
        </Empty>
      ) : (
        <>
          <div className="scope-strip">
            <FolderOpen size={17} />
            <code title={r.root}>{shortPath(r.root, disk.data?.home)}</code>
            <span>
              {bytes(r.bytes)} alocados
              {r.incomplete ? " · leitura parcial" : ""}
            </span>
            <button
              className="icon-button"
              disabled={w.busy}
              title="Atualizar análise"
              aria-label="Atualizar análise"
              onClick={() => t.scan.mutate(r.root)}
            >
              <RefreshCw size={16} />
            </button>
          </div>
          <div className="catalog-freshness">
            <span>
              {t.indexStatus.data?.refreshing
                ? t.indexStatus.data.phase
                : t.indexStatus.data?.watching ? "Índice acompanhado automaticamente" : "Índice salvo · conferência periódica"}
            </span>
            <span>
              {r.reusedDirectories ?? 0} pastas reutilizadas ·{" "}
              {r.scannedDirectories ?? 0} relidas ·{" "}
              {((r.elapsedMs ?? 0) / 1000).toFixed(1)} s
            </span>
          </div>
          <p className="saved-catalog-note">
            {r.cached ? "O índice salvo está disponível enquanto a conferência automática acontece. " : "Mudanças e limpezas atualizam os registros afetados. "}
            Cada arquivo escolhido é conferido antes de ir à Lixeira.
            {t.indexStatus.data?.error && <span role="status"> {t.indexStatus.data.error}</span>}
          </p>
          {tab === "map" && (
            <>
              <div className="map-breadcrumbs">
                <button
                  disabled={path === r.root}
                  onClick={() => setTrail(trail.slice(0, -1))}
                  aria-label="Voltar à pasta anterior"
                >
                  <ArrowLeft size={16} />
                </button>
                {(trail[0] === r.root ? trail : [r.root]).map((p, i) => (
                  <span key={p}>
                    <button
                      onClick={() =>
                        setTrail(
                          (trail[0] === r.root ? trail : [r.root]).slice(
                            0,
                            i + 1,
                          ),
                        )
                      }
                    >
                      {i === 0
                        ? shortPath(p, disk.data?.home)
                        : p.split("/").at(-1)}
                    </button>
                    <ChevronRight size={13} />
                  </span>
                ))}
              </div>
              <div className="map-folder-actions">
                <code title={path}>{shortPath(path, disk.data?.home)}</code>
                <button className="button subtle compact" disabled={w.busy || path === r.root || children.isPending || children.isError}
                  onClick={() => reviewFolder(path)}>
                  <Trash2 size={16} /> Enviar esta pasta à Lixeira
                </button>
              </div>
              {children.isPending ? (
                <Empty
                  icon={<LoaderCircle className="spin" />}
                  heading="Abrindo a pasta…"
                  description=""
                />
              ) : children.isError ? (
                <p className="inline-error">{String(children.error)}</p>
              ) : (
                <>
                  <div className="treemap" aria-label={"Mapa de " + path}>
                    {rectangles.map((rect) => {
                      const n = tiles[rect.index];
                      return (
                        <button
                          key={n.path}
                          className={"treemap-tile tone-" + (rect.index % 6)}
                          style={{
                            left: rect.x + "%",
                            top: rect.y + "%",
                            width: rect.width + "%",
                            height: rect.height + "%",
                          }}
                          title={`${n.name} · ${bytes(n.bytes)}${n.directory ? " · abrir pasta" : " · Quick Look"}`}
                          disabled={n.path === "__other" || w.busy}
                          onClick={() => drill(n)}
                        >
                          <strong>{n.name}</strong>
                          <span>{bytes(n.bytes)}</span>
                          {rect.width > 12 &&
                            rect.height > 12 &&
                            (n.directory ? (
                              <FolderOpen size={20} />
                            ) : (
                              <File size={20} />
                            ))}
                        </button>
                      );
                    })}
                    {!rectangles.length && (
                      <span className="map-zero">
                        Nenhum espaço alocado nesta pasta.
                      </span>
                    )}
                  </div>
                  <p className="setting-caption">
                    Clique em uma pasta para navegar; em um arquivo para abrir
                    Quick Look. O mapa usa espaço alocado e agrupa após os 40
                    maiores itens.
                  </p>
                  <div className="tool-list">
                    {nodes.slice(0, 300).map((n) => (
                      <div className="tool-row" key={n.path}>
                        <button
                          className="row-link"
                          disabled={w.busy}
                          onClick={() => drill(n)}
                        >
                          {n.directory ? (
                            <FolderOpen size={18} />
                          ) : (
                            <File size={18} />
                          )}
                          <span>
                            {n.name}
                            <small>
                              {n.directory ? "Pasta" : "Arquivo"}
                              {n.incomplete ? " · leitura parcial" : ""}
                            </small>
                          </span>
                        </button>
                        <strong>{bytes(n.bytes)}</strong>
                        {n.directory && (
                          <button className="icon-button" disabled={w.busy || n.incomplete}
                            title="Enviar pasta à Lixeira"
                            aria-label={"Enviar " + n.name + " à Lixeira"}
                            onClick={() => reviewFolder(n.path)}>
                            <Trash2 size={16} />
                          </button>
                        )}
                        <button
                          className="icon-button"
                          aria-label={"Mostrar " + n.name + " no Finder"}
                          onClick={() =>
                            void w.feedback(() => api.reveal(n.path))
                          }
                        >
                          <ArrowUpRight size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                  {nodes.length > 300 && (
                    <p className="setting-caption">
                      Exibindo os 300 maiores itens. Escolha uma subpasta para
                      detalhar.
                    </p>
                  )}
                </>
              )}
            </>
          )}
          {tab === "large" && (
            <LargeFiles
              files={r.files}
              selected={t.fileSelection}
              setSelected={t.setFileSelection}
            />
          )}
          {tab === "duplicates" && (
            <>
              <div className="section-heading duplicate-heading">
                <div>
                  <h2>Cópias confirmadas por conteúdo</h2>
                  <p>
                    Compara arquivos a partir de 1 MiB. Links para o mesmo
                    arquivo não são duplicados.
                  </p>
                </div>
                <button
                  className="button subtle compact"
                  disabled={w.busy}
                  onClick={() => t.find.mutate()}
                >
                  <Copy size={16} />
                  {t.duplicates ? "Comparar novamente" : "Comparar conteúdo"}
                </button>
              </div>
              {t.duplicates === null ? (
                <Empty
                  icon={<Copy size={32} />}
                  heading="Nomes iguais não bastam."
                  description="A comparação lê o arquivo inteiro e confirma o hash BLAKE3. Pode levar mais tempo em pastas grandes."
                />
              ) : t.duplicates.length === 0 ? (
                <Empty
                  icon={<ShieldCheck size={32} />}
                  heading="Nenhuma cópia idêntica encontrada."
                  description="O resultado cobre os arquivos acessíveis desta análise."
                />
              ) : (
                t.duplicates.map((g) => (
                  <section className="duplicate-group" key={g.hash}>
                    <div className="duplicate-group-title">
                      <Copy size={18} />
                      <strong>{g.files.length} cópias idênticas</strong>
                      <span>
                        Até {bytes(g.recoverableBytes)} · preserve uma cópia
                      </span>
                    </div>
                    {g.files.map((f) => {
                      const count = g.files.filter((f) =>
                        t.duplicateSelection.has(f.id),
                      ).length;
                      return (
                        <FileRow
                          key={f.id}
                          f={f}
                          checked={t.duplicateSelection.has(f.id)}
                          disabled={
                            w.busy ||
                            (!t.duplicateSelection.has(f.id) &&
                              count >= g.files.length - 1)
                          }
                          onToggle={() => {
                            const next = new Set(t.duplicateSelection);
                            next.has(f.id) ? next.delete(f.id) : next.add(f.id);
                            t.setDuplicateSelection(next);
                          }}
                        />
                      );
                    })}
                    <code className="hash-label">BLAKE3 {g.hash}</code>
                  </section>
                ))
              )}
            </>
          )}
          {tab !== "map" && (
            <Selection
              count={selectedFiles.length}
              size={selectedFiles.reduce((s, f) => s + f.bytes, 0)}
              onClear={() =>
                tab === "duplicates"
                  ? t.setDuplicateSelection(new Set())
                  : t.setFileSelection(new Set())
              }
              onReview={() => setReview(true)}
              disabled={w.busy}
            />
          )}
          <Warnings items={r.warnings} />
          <PermissionHelp report={r} />
        </>
      )}
      <div className="scope-note">
        <ShieldCheck size={16} />
        <span>
          Arquivos pessoais não são selecionados automaticamente. O envio à
          Lixeira só libera espaço após esvaziá-la no Finder.
        </span>
      </div>
      {review && (
        <Review
          title="Enviar à Lixeira?"
          description="Você pode recuperar os itens pelo Histórico ou pelo Finder. Nenhuma exclusão permanente será feita aqui. O espaço livre pode permanecer igual até esvaziar a Lixeira."
          items={selectedFiles.map((f) => ({ path: f.path, bytes: f.bytes }))}
          acknowledge="Revisei os arquivos selecionados e quero movê-los à Lixeira."
          pending={t.trash.isPending}
          error={t.trash.isError ? t.trash.error : null}
          onClose={() => setReview(false)}
          onConfirm={() =>
            t.trash.mutate(tab === "duplicates", {
              onSuccess: () => setReview(false),
            })
          }
        />
      )}
      {folderReview && (
        <Review
          title="Enviar esta pasta à Lixeira?"
          description={`A pasta inteira e seus ${folderReview.files} arquivos serão movidos à Lixeira. Você pode recuperá-la pelo Histórico ou pelo Finder. O espaço só será liberado após esvaziar a Lixeira.`}
          items={[folderReview]}
          acknowledge="Revisei a pasta e seu conteúdo e quero movê-la à Lixeira."
          pending={t.trashFolder.isPending}
          error={t.trashFolder.isError ? t.trashFolder.error : null}
          onClose={() => setFolderReview(null)}
          onConfirm={() => t.trashFolder.mutate(folderReview, { onSuccess: () => {
            const activeTrail = trail[0] === r?.root ? trail : [r!.root];
            const removedIndex = activeTrail.findIndex((p) => p === folderReview.path || p.startsWith(folderReview.path + "/"));
            if (removedIndex >= 0) setTrail(activeTrail.slice(0, removedIndex));
            setFolderReview(null);
          } })}
        />
      )}
    </main>
  );
}
function FileRow({
  f,
  checked,
  disabled,
  onToggle,
}: {
  f: FileEntry;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const w = useWorkspace(),
    t = useTools();
  return (
    <div className={"tool-row file-row " + (checked ? "selected" : "")}>
      <input
        type="checkbox"
        aria-label={"Selecionar " + f.path}
        checked={checked}
        disabled={disabled || !!f.blocked}
        onChange={onToggle}
      />
      <File size={18} />
      <div className="file-label">
        <strong>{f.name}</strong>
        <code title={f.path}>{f.path}</code>
        {f.blocked && <small className="blocked-reason">{f.blocked}</small>}
      </div>
      <span className="file-date">{date(f.modified).split(" às ")[0]}</span>
      <strong title={"Tamanho lógico: " + bytes(f.logicalBytes)}>
        {bytes(f.bytes)}
      </strong>
      <button
        className="icon-button"
        aria-label={"Prévia de " + f.name}
        title="Quick Look"
        onClick={() => void w.feedback(() => toolsApi.preview(f.path))}
      >
        <Eye size={16} />
      </button>
      <button
        className="icon-button"
        aria-label={"Mostrar " + f.name + " no Finder"}
        onClick={() => void w.feedback(() => api.reveal(f.path))}
      >
        <ArrowUpRight size={16} />
      </button>
    </div>
  );
}
function LargeFiles({
  files,
  selected,
  setSelected,
}: {
  files: FileEntry[];
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
}) {
  const w = useWorkspace();
  const [search, setSearch] = useState(""),
    [minimum, setMinimum] = useState(50),
    [age, setAge] = useState(0),
    [type, setType] = useState("all"),
    [clock, setClock] = useState("modified");
  const kind = (f: FileEntry) =>
    ["dmg", "iso"].includes(f.kind)
      ? "disk"
      : ["zip", "7z", "rar", "tar", "gz"].includes(f.kind)
        ? "archive"
        : ["mp4", "mov", "mkv", "avi"].includes(f.kind)
          ? "video"
          : ["png", "jpg", "jpeg", "webp", "heic", "tiff"].includes(f.kind)
            ? "image"
            : "other";
  const filtered = files.filter(
    (f) =>
      f.path.toLowerCase().includes(search.toLowerCase()) &&
      f.logicalBytes >= minimum * 1e6 &&
      (type === "all" || kind(f) === type) &&
      (!age ||
        ((clock === "accessed" ? f.accessed : f.modified) != null &&
          (clock === "accessed" ? f.accessed! : f.modified) <
            Date.now() / 1000 - age * 86400)),
  );
  return (
    <>
      <div className="file-filters">
        <label className="search-input">
          <Search size={16} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nome ou caminho"
            aria-label="Buscar arquivos"
          />
        </label>
        <label>
          Tipo
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="all">Todos</option>
            <option value="disk">DMG / ISO</option>
            <option value="archive">Compactados</option>
            <option value="video">Vídeos</option>
            <option value="image">Imagens</option>
            <option value="other">Outros</option>
          </select>
        </label>
        <label>
          Tamanho mínimo
          <select
            value={minimum}
            onChange={(e) => setMinimum(Number(e.target.value))}
          >
            <option value={50}>50 MB</option>
            <option value={500}>500 MB</option>
            <option value={1000}>1 GB</option>
            <option value={5000}>5 GB</option>
          </select>
        </label>
        <label>
          Mais antigo que
          <select value={age} onChange={(e) => setAge(Number(e.target.value))}>
            <option value={0}>Qualquer data</option>
            <option value={30}>30 dias</option>
            <option value={90}>90 dias</option>
            <option value={180}>180 dias</option>
            <option value={365}>1 ano</option>
          </select>
        </label>
        <label>
          Data de
          <select value={clock} onChange={(e) => setClock(e.target.value)}>
            <option value="modified">Modificação</option>
            <option value="accessed">Acesso</option>
          </select>
        </label>
      </div>
      <p className="setting-caption">
        {filtered.length} arquivos · tamanhos alocados; filtro por tamanho
        lógico. Datas de acesso podem ser afetadas pelo sistema e pela leitura.
        A lista contém os 5.000 maiores arquivos a partir de 50 MB.
      </p>
      <div className="tool-list">
        {filtered.slice(0, 500).map((f) => (
          <FileRow
            key={f.id}
            f={f}
            checked={selected.has(f.id)}
            disabled={w.busy}
            onToggle={() => {
              const next = new Set(selected);
              next.has(f.id) ? next.delete(f.id) : next.add(f.id);
              setSelected(next);
            }}
          />
        ))}
      </div>
      {!filtered.length && (
        <Empty
          icon={<Search size={30} />}
          heading="Nenhum arquivo com estes filtros."
          description="Ajuste tamanho, tipo ou data para explorar outros resultados."
        />
      )}
      {filtered.length > 500 && (
        <p className="setting-caption">
          Exibindo os 500 maiores resultados. Refine os filtros para ver os
          demais.
        </p>
      )}
    </>
  );
}
export function Projects() {
  const t = useTools(),
    w = useWorkspace(),
    disk = useDisk();
  const r = t.catalog.data;
  return (
    <main className="content tool-content">
      <Heading
        eyebrow="O PESO DO DESENVOLVIMENTO"
        title="Espaço por projeto"
        description="Entenda quanto fica no projeto, nas dependências e nos builds."
        action={
          <button
            className="button subtle compact"
            disabled={w.busy || !w.roots.length}
            onClick={() => t.scan.mutate(w.roots[0])}
          >
            <ScanIcon />
            Analisar projetos
          </button>
        }
      />
      {t.scan.isPending ? (
        <Operation label="Medindo projetos…" />
      ) : !r ? (
        <Empty
          icon={<Code2 size={35} />}
          heading="Seus projetos, em perspectiva."
          description="O app reconhece Cargo, package.json, Godot e Python. A primeira pasta configurada será analisada."
        />
      ) : (
        <>
          <div className="scope-strip">
            <FolderOpen size={17} />
            <code>{shortPath(r.root, disk.data?.home)}</code>
            <span>
              {r.projects.length} projetos
              {r.incomplete ? " · leitura parcial" : ""}
            </span>
            <Link to="/explore" className="text-button">
              Explorar
              <ArrowRight size={15} />
            </Link>
          </div>
          {r.projects.map((p) => (
            <section className="project-card" key={p.path}>
              <div className="project-heading">
                <div className="project-icon">
                  <Code2 size={23} />
                </div>
                <div>
                  <h2>{p.name}</h2>
                  <code title={p.path}>
                    {shortPath(p.path, disk.data?.home)}
                  </code>
                </div>
                <span className="project-eco">{p.ecosystem}</span>
                <strong>{bytes(p.bytes)}</strong>
              </div>
              <div className="project-meter">
                <span
                  className="build-part"
                  style={{
                    width: (p.buildBytes / Math.max(p.bytes, 1)) * 100 + "%",
                  }}
                />
                <span
                  className="dependency-part"
                  style={{
                    width:
                      (p.dependencyBytes / Math.max(p.bytes, 1)) * 100 + "%",
                  }}
                />
              </div>
              <div className="project-legend">
                <span>
                  <i className="build-part" />
                  Builds e caches <strong>{bytes(p.buildBytes)}</strong>
                </span>
                <span>
                  <i className="dependency-part" />
                  Dependências <strong>{bytes(p.dependencyBytes)}</strong>
                </span>
                <span>
                  <i />
                  Demais arquivos{" "}
                  <strong>
                    {bytes(
                      Math.max(0, p.bytes - p.buildBytes - p.dependencyBytes),
                    )}
                  </strong>
                </span>
              </div>
              <p>
                {p.ecosystem === "Rust"
                  ? "Recompilar builds Rust pode levar vários minutos. Releases entram no diagnóstico, mas a limpeza rápida preserva target/release."
                  : p.ecosystem === "JavaScript"
                    ? "Builds serão recriados. Para selecionar dependências, use o filtro node_modules na Visão geral."
                    : p.ecosystem === "Godot"
                      ? "Caches de importação podem ser recriados; assets e cenas são dados do projeto."
                      : "Ambientes virtuais são dependências. Reinstalá-los exige os pacotes e possivelmente conexão."}
              </p>
            </section>
          ))}
          {!r.projects.length && (
            <Empty
              icon={<FolderOpen size={32} />}
              heading="Nenhum manifesto de projeto encontrado."
              description="Escolha uma pasta de desenvolvimento no Explorador."
            />
          )}
          <Warnings items={r.warnings} />
        </>
      )}
      <div className="scope-note">
        <ShieldCheck size={16} />
        <span>
          Projetos aninhados têm contabilização própria. Este diagnóstico inclui
          builds que a limpeza rápida preserva.
        </span>
      </div>
      <Link to="/" className="button subtle">
        Revisar caches removíveis
        <ArrowRight size={16} />
      </Link>
    </main>
  );
}
function ScanIcon() {
  return <RefreshCw size={16} />;
}
export function Applications() {
  const t = useTools(),
    w = useWorkspace();
  const [includeContainers, setIncludeContainers] = useState(false);
  const [filter, setFilter] = useState("all"),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState<Set<string>>(new Set()),
    [review, setReview] = useState(false);
  const r = t.apps;
  useEffect(() => {
    setSelected(new Set());
    setReview(false);
  }, [r?.id]);
  const chosen = (r?.apps ?? [])
    .flatMap((a) => a.parts)
    .filter((p) => selected.has(p.id));
  const apps = (r?.apps ?? []).filter(
    (a) =>
      (filter === "all" || (filter === "leftovers") === a.leftover) &&
      a.name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <main className="content tool-content">
      <Heading
        eyebrow="O QUE FICA DEPOIS DOS APPS"
        title="Apps e resíduos"
        description="Revise o app e os dados associados antes de desinstalar."
        action={
          <button
            className="button primary compact"
            disabled={w.busy}
            onClick={() =>
              t.scanApps.mutate(includeContainers, {
                onSuccess: () => setSelected(new Set()),
              })
            }
          >
            <Package size={16} />
            Analisar apps
          </button>
        }
      />
      <label className="container-option">
        <input
          type="checkbox"
          checked={includeContainers}
          disabled={w.busy}
          onChange={(e) => setIncludeContainers(e.target.checked)}
        />
        Incluir containers protegidos{" "}
        <span>
          O macOS pode solicitar acesso. Sem autorização, os itens ficam
          bloqueados.
        </span>
      </label>
      {t.scanApps.isPending || t.trashApps.isPending ? (
        <Operation
          label={
            t.trashApps.isPending
              ? "Enviando itens à Lixeira…"
              : "Identificando apps e seus dados…"
          }
        />
      ) : !r ? (
        <Empty
          icon={<Package size={37} />}
          heading="Mais do que arrastar o app."
          description="Procura associações exatas pelo identificador do app. Você escolhe cada cache, preferência ou pasta de dados."
        />
      ) : (
        <>
          <div className="file-filters">
            <label className="search-input">
              <Search size={16} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar app"
                aria-label="Buscar app"
              />
            </label>
            <label>
              Mostrar
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">Todos</option>
                <option value="installed">Instalados</option>
                <option value="leftovers">Sem app encontrado</option>
              </select>
            </label>
          </div>
          {apps.map((a) => (
            <details className="app-card" key={a.id}>
              <summary>
                <div className="project-icon">
                  <Package size={23} />
                </div>
                <div>
                  <strong>{a.name}</strong>
                  <p>
                    {a.leftover
                      ? "Sem app encontrado · confira antes de remover"
                      : a.bundleId}
                  </p>
                </div>
                <strong>
                  {bytes(a.parts.reduce((s, p) => s + (p.bytes ?? 0), 0))}
                  {a.parts.some((p) => p.bytes == null) && (
                    <small className="shared-label">parcial</small>
                  )}
                </strong>
                <ChevronRight size={17} />
              </summary>
              <div className="app-parts">
                {a.leftover && (
                  <p className="setting-caption">
                    Pode pertencer a um app fora das pastas pesquisadas.
                    Ausência do app não comprova que os dados são dispensáveis.
                  </p>
                )}
                {a.parts.map((p) => (
                  <label className="tool-row" key={p.id}>
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      disabled={w.busy || !!p.blocked}
                      onChange={() => {
                        const next = new Set(selected);
                        next.has(p.id) ? next.delete(p.id) : next.add(p.id);
                        setSelected(next);
                      }}
                    />
                    <div className="file-label">
                      <strong>
                        {{
                          app: "Aplicativo",
                          cache: "Cache",
                          data: "Dados pessoais do app",
                          preferences: "Preferências",
                          state: "Estado salvo",
                        }[p.kind] ?? p.kind}
                      </strong>
                      <code>{p.path}</code>
                      {p.blocked && (
                        <small className="blocked-reason">{p.blocked}</small>
                      )}
                    </div>
                    <strong>
                      {p.bytes == null ? "Não medido" : bytes(p.bytes)}
                    </strong>
                  </label>
                ))}
              </div>
            </details>
          ))}
          <Selection
            count={chosen.length}
            size={chosen.reduce((s, p) => s + (p.bytes ?? 0), 0)}
            onClear={() => setSelected(new Set())}
            onReview={() => setReview(true)}
            disabled={w.busy}
          />
          <Warnings items={r.warnings} />
        </>
      )}
      <div className="scope-note">
        <ShieldCheck size={16} />
        <span>
          Dados compartilhados entre apps não entram por aproximação de nome.
          Feche os apps selecionados antes de continuar.
        </span>
      </div>
      {review && (
        <Review
          title="Remover os itens do app?"
          description="Os itens selecionados irão à Lixeira. Dados e preferências podem conter documentos, sessões e configurações. Desinstalar um app pode interromper seu trabalho; feche-o primeiro."
          items={chosen.map((p) => ({ path: p.path, bytes: p.bytes }))}
          acknowledge="Revisei os caminhos e os dados associados que serão movidos."
          pending={t.trashApps.isPending}
          error={t.trashApps.isError ? t.trashApps.error : null}
          onClose={() => setReview(false)}
          onConfirm={() =>
            t.trashApps.mutate([...selected], {
              onSuccess: () => {
                setReview(false);
                setSelected(new Set());
              },
            })
          }
        />
      )}
    </main>
  );
}
const dockerLabels: Record<DockerItem["kind"], string> = {
  cache: "Cache de build",
  image: "Imagens",
  container: "Containers",
  volume: "Volumes",
};
export function Docker() {
  const t = useTools(),
    w = useWorkspace();
  const [tab, setTab] = useState<DockerItem["kind"]>("cache"),
    [selected, setSelected] = useState<Set<string>>(new Set()),
    [review, setReview] = useState(false);
  const r = t.docker,
    items = r?.items.filter((i) => i.kind === tab) ?? [],
    chosen = r?.items.filter((i) => selected.has(i.id)) ?? [],
    volumes = chosen.some((i) => i.kind === "volume");
  useEffect(() => {
    setSelected(new Set());
    setReview(false);
  }, [r?.id]);
  return (
    <main className="content tool-content">
      <Heading
        eyebrow="CONTAINERS TAMBÉM ACUMULAM"
        title="Uma folga no Docker"
        description="Limpe recursos locais por categoria, com os volumes sob seu controle."
        action={
          <button
            className="button primary compact"
            disabled={w.busy}
            onClick={() =>
              t.scanDocker.mutate(undefined, {
                onSuccess: () => setSelected(new Set()),
              })
            }
          >
            <Box size={17} />
            Analisar Docker
          </button>
        }
      />
      {t.scanDocker.isPending || t.cleanDocker.isPending ? (
        <Operation
          label={
            t.cleanDocker.isPending
              ? "Removendo recursos Docker selecionados…"
              : "Consultando Docker local…"
          }
        />
      ) : !r ? (
        <Empty
          icon={<Box size={39} />}
          heading="Cada recurso tem seu lugar."
          description="Abra Docker ou OrbStack. O app identifica o contexto local e preserva containers em execução e recursos vinculados."
        />
      ) : (
        <>
          <div className="scope-strip">
            <Box size={17} />
            <strong>{r.context}</strong>
            <code title={r.endpoint}>{r.endpoint}</code>
          </div>
          <div
            className="tool-tabs"
            role="tablist"
            aria-label="Categorias Docker"
          >
            {(["cache", "image", "container", "volume"] as const).map(
              (kind) => (
                <button
                  key={kind}
                  role="tab"
                  aria-selected={tab === kind}
                  onClick={() => setTab(kind)}
                >
                  {kind === "cache" ? <Layers size={16} /> : <Box size={16} />}{" "}
                  {dockerLabels[kind]}
                  <span className="tab-count">
                    {r.items.filter((i) => i.kind === kind).length}
                  </span>
                </button>
              ),
            )}
          </div>
          <div className="tool-list">
            {items.map((i) => (
              <div
                className={
                  "tool-row docker-row " +
                  (selected.has(i.id) ? "selected" : "")
                }
                key={i.id}
              >
                <input
                  type="checkbox"
                  aria-label={"Selecionar " + i.name}
                  disabled={w.busy || !!i.blocked}
                  checked={selected.has(i.id)}
                  onChange={() => {
                    const next = new Set(selected);
                    next.has(i.id) ? next.delete(i.id) : next.add(i.id);
                    setSelected(next);
                  }}
                />
                <Box size={18} />
                <div className="file-label">
                  <strong>{i.name || i.resourceId}</strong>
                  <small>{i.detail}</small>
                  {i.blocked && (
                    <small className="blocked-reason">{i.blocked}</small>
                  )}
                </div>
                <strong>
                  {i.bytes == null ? "Desconhecido" : bytes(i.bytes)}
                  {i.shared && (
                    <small className="shared-label">compartilhado</small>
                  )}
                </strong>
              </div>
            ))}
          </div>
          {!items.length && (
            <Empty
              icon={<ShieldCheck size={30} />}
              heading="Nenhum recurso nesta categoria."
              description="Confira os avisos caso o cache de build esteja indisponível."
            />
          )}
          <Selection
            count={chosen.length}
            size={chosen.reduce((s, i) => s + (i.bytes ?? 0), 0)}
            label="Revisar remoção"
            onClear={() => setSelected(new Set())}
            onReview={() => setReview(true)}
            disabled={w.busy}
          />
          <p className="setting-caption">
            Total selecionado é uma estimativa, exclui tamanhos desconhecidos e
            pode somar camadas compartilhadas. Remoções são permanentes; a VM do
            Docker pode não devolver todo o espaço imediatamente ao macOS.
          </p>
          <Warnings items={r.warnings} />
        </>
      )}
      <div className="scope-note">
        <ShieldCheck size={16} />
        <span>
          Não executa prune geral. Remove IDs selecionados; volumes nunca são
          incluídos por seleção automática.
        </span>
      </div>
      {review && (
        <Review
          title="Remover recursos Docker?"
          description={
            volumes
              ? "Você selecionou volumes com dados persistentes. Isso pode apagar bancos de dados de forma permanente. Containers e imagens selecionados também serão removidos."
              : "Os recursos selecionados serão removidos permanentemente. Builds e imagens precisarão ser refeitos ou baixados novamente; a camada gravável dos containers será perdida."
          }
          items={chosen.map((i) => ({
            path: dockerLabels[i.kind] + " · " + i.name,
            bytes: i.bytes,
          }))}
          phrase={volumes ? "APAGAR VOLUMES" : undefined}
          acknowledge="Entendo que a remoção é permanente e revisei os recursos selecionados."
          pending={t.cleanDocker.isPending}
          error={t.cleanDocker.isError ? t.cleanDocker.error : null}
          onClose={() => setReview(false)}
          onConfirm={(phrase) =>
            t.cleanDocker.mutate(
              { ids: [...selected], phrase },
              {
                onSuccess: () => {
                  setReview(false);
                  setSelected(new Set());
                },
              },
            )
          }
        />
      )}
    </main>
  );
}
export function System() {
  const w = useWorkspace(),
    t = useTools(),
    monitor = useMonitor();
  const diagnose = useMutation({
    mutationFn: toolsApi.system,
    onError: (e) => w.setNotice(String(e)),
  });
  const r = diagnose.data;
  const samples = monitor.data?.samples ?? [],
    growth = monitor.data?.growth ?? [];
  const max = Math.max(...samples.map((s) => s.free), 1),
    min = Math.min(...samples.map((s) => s.free), max);
  const floor = Math.max(0, min - (max - min) * 0.2),
    ceil = max + (max - min) * 0.2 || 1;
  const points = samples
    .map(
      (s, i) =>
        `${(i / Math.max(samples.length - 1, 1)) * 1000},${130 - ((s.free - floor) / Math.max(ceil - floor, 1)) * 110}`,
    )
    .join(" ");
  return (
    <main className="content tool-content">
      <Heading
        eyebrow="O DISCO ALÉM DOS ARQUIVOS"
        title="Diagnóstico e crescimento"
        description="Acompanhe o espaço livre e entenda o que o macOS informa."
        action={
          <button
            className="button subtle compact"
            disabled={w.busy}
            onClick={() => diagnose.mutate()}
          >
            <Activity size={17} />
            Diagnosticar APFS
          </button>
        }
      />
      {diagnose.isPending && (
        <Operation label="Consultando informações do macOS…" />
      )}
      {r && (
        <section className="settings-card">
          <div className="section-heading">
            <div>
              <h2>{r.volume}</h2>
              <p>
                {r.filesystem.toUpperCase()} · volumes compartilham o espaço do
                contêiner
              </p>
            </div>
            <Monitor size={24} />
          </div>
          <dl className="system-facts">
            <div>
              <dt>Capacidade do contêiner</dt>
              <dd>
                {r.containerBytes == null
                  ? "Não informado"
                  : bytes(r.containerBytes)}
              </dd>
            </div>
            <div>
              <dt>Livre no contêiner</dt>
              <dd>
                {r.containerFree == null
                  ? "Não informado"
                  : bytes(r.containerFree)}
              </dd>
            </div>
            <div>
              <dt>Uso do volume de dados</dt>
              <dd>
                {r.dataBytes == null ? "Não informado" : bytes(r.dataBytes)}
              </dd>
            </div>
            <div>
              <dt>Espaço purgável</dt>
              <dd>
                {r.purgeableBytes == null
                  ? "Não informado pelo macOS"
                  : bytes(r.purgeableBytes)}
              </dd>
            </div>
          </dl>
          <div className="snapshot-heading">
            <h3>{r.snapshots.length} snapshots identificados</h3>
            <p>
              O tamanho individual não foi informado. Snapshots de sistema e
              atualização são preservados.
            </p>
          </div>
          {r.snapshots.map((s, i) => (
            <div className="snapshot-row" key={i}>
              <Layers size={17} />
              <code>{s.name}</code>
              <span>
                {s.scope}
                {s.purgeable === true ? " · purgável" : ""}
              </span>
            </div>
          ))}
          <Warnings items={r.warnings} />
        </section>
      )}
      <section className="settings-card">
        <div className="section-heading">
          <div>
            <h2>O espaço ao longo do tempo</h2>
            <p>Uma amostra a cada 5 minutos, enquanto o Space está aberto.</p>
          </div>
          <Activity size={22} />
        </div>
        {monitor.isError ? (
          <p className="inline-error">{String(monitor.error)}</p>
        ) : samples.length < 2 ? (
          <Empty
            icon={<Activity size={28} />}
            heading="A curva começa com duas leituras."
            description="O histórico se forma enquanto o app está aberto. Nenhuma pasta é varrida em segundo plano."
          />
        ) : (
          <>
            <div
              className="disk-chart"
              role="img"
              aria-label={`Espaço livre: ${bytes(samples[0].free)} até ${bytes(samples.at(-1)!.free)}`}
            >
              <div className="chart-labels">
                <span>{bytes(ceil)}</span>
                <span>{bytes(floor)}</span>
              </div>
              <svg viewBox="0 0 1000 150" preserveAspectRatio="none">
                <line x1="0" y1="20" x2="1000" y2="20" />
                <line x1="0" y1="75" x2="1000" y2="75" />
                <line x1="0" y1="130" x2="1000" y2="130" />
                <polyline points={points} />
              </svg>
            </div>
            <div className="chart-times">
              <span>{date(samples[0].at)}</span>
              <strong>{bytes(samples.at(-1)!.free)} livres</strong>
              <span>{date(samples.at(-1)!.at)}</span>
            </div>
          </>
        )}
      </section>
      <section className="settings-card">
        <div className="section-heading">
          <div>
            <h2>Pastas que cresceram</h2>
            <p>Compara análises manuais completas da mesma pasta.</p>
          </div>
          <Link to="/explore" className="text-button">
            Nova análise
            <ArrowRight size={16} />
          </Link>
        </div>
        {!growth.length ? (
          <Empty
            icon={<FolderTree size={28} />}
            heading="Crie uma referência."
            description="Analise uma pasta no Explorador. A segunda leitura mostrará a diferença."
          />
        ) : (
          <div className="growth-list">
            {growth.slice(0, 100).map((g, i) => (
              <div className="tool-row" key={g.path + i}>
                <FolderOpen size={17} />
                <div className="file-label">
                  <code>{g.path}</code>
                  <small>
                    {date(g.at)}
                    {g.previousAt ? " · comparado a " + date(g.previousAt) : ""}
                    {!g.complete ? " · análise incompleta" : ""}
                  </small>
                </div>
                <span>{bytes(g.bytes)}</span>
                <strong
                  className={
                    g.delta != null && g.delta > 0
                      ? "growth-up"
                      : "growth-neutral"
                  }
                >
                  {g.delta == null
                    ? "Sem comparação"
                    : (g.delta > 0 ? "+" : g.delta < 0 ? "−" : "") +
                      bytes(Math.abs(g.delta))}
                </strong>
              </div>
            ))}
          </div>
        )}
      </section>
      {t.catalog.data?.warnings.length ? (
        <section className="settings-card">
          <h2>Acesso à análise de arquivos</h2>
          <p>
            Pastas inacessíveis reduzem a cobertura. Os tamanhos do mapa não
            representam todo o disco quando a análise é parcial.
          </p>
          <Warnings items={t.catalog.data.warnings} />
        </section>
      ) : null}
      <div className="scope-note">
        <ShieldCheck size={16} />
        <span>
          “Dados do Sistema” é uma categoria do macOS, não um único cache
          removível. Valores desconhecidos não entram em promessas de espaço
          recuperável.
        </span>
      </div>
    </main>
  );
}
export function MonitorPreferences() {
  const monitor = useMonitor(),
    client = useQueryClient(),
    w = useWorkspace();
  const update = useMutation({
    mutationFn: toolsApi.updateMonitor,
    onSuccess: (r) => {
      client.setQueryData(["monitor"], r);
      localStorage.setItem("folga.threshold", String(r.settings.threshold));
    },
    onError: (e) => w.setNotice(String(e)),
  });
  const settings = monitor.data?.settings;
  const notify = async (enabled: boolean) => {
    if (!settings) return;
    try {
      if (enabled && !(await toolsApi.permission())) {
        w.setNotice(
          "As notificações não foram autorizadas pelo macOS. Você pode habilitá-las nos Ajustes do Sistema.",
        );
        return;
      }
      update.mutate({ ...settings, notifications: enabled });
    } catch (e) {
      w.setNotice(String(e));
    }
  };
  return (
    <section className="settings-card">
      <div className="section-heading">
        <div>
          <h2>Histórico e avisos do disco</h2>
          <p>
            Medição leve de espaço livre, sem leitura periódica das suas pastas.
          </p>
        </div>
        <Bell size={22} />
      </div>
      {settings ? (
        <>
          <label className="toggle-setting">
            <span>
              <strong>Registrar espaço em segundo plano</strong>
              <small>
                Enquanto o Space estiver aberto, inclusive com a janela fechada.
              </small>
            </span>
            <input
              type="checkbox"
              checked={settings.enabled}
              disabled={update.isPending}
              onChange={(e) =>
                update.mutate({ ...settings, enabled: e.target.checked })
              }
            />
          </label>
          <label className="toggle-setting">
            <span>
              <strong>Notificar quando o disco ficar cheio</strong>
              <small>
                Abaixo do limite configurado. No máximo um aviso a cada 6 horas.
              </small>
            </span>
            <input
              type="checkbox"
              checked={settings.notifications}
              disabled={!native || !settings.enabled || update.isPending}
              onChange={(e) => void notify(e.target.checked)}
            />
          </label>
          <label className="toggle-setting">
            <span>
              <strong>Limite do aviso</strong>
              <small>Usado pelo monitor nativo e pelas notificações.</small>
            </span>
            <select
              aria-label="Limite para notificações"
              value={settings.threshold}
              disabled={update.isPending}
              onChange={(e) =>
                update.mutate({
                  ...settings,
                  threshold: Number(e.target.value),
                })
              }
            >
              {[5, 10, 15, 20, 25, 30, 35, 40].map((v) => (
                <option key={v} value={v}>
                  {v}% livre
                </option>
              ))}
            </select>
          </label>
        </>
      ) : (
        <p>{monitor.isError ? String(monitor.error) : "Lendo preferências…"}</p>
      )}
    </section>
  );
}
