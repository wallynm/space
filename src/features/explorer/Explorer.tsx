import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  Copy,
  Eye,
  File,
  FolderOpen,
  FolderTree,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../bridge";
import { Empty } from "../../components/ui/Empty";
import { Heading } from "../../components/ui/Heading";
import { Operation } from "../../components/ui/Operation";
import { ReviewModal } from "../../components/ui/ReviewModal";
import { SelectionBar } from "../../components/ui/SelectionBar";
import { Warnings } from "../../components/ui/Warnings";
import { bytes, date, shortPath } from "../../format";
import { PermissionHelp } from "../../settings-tools";
import { toolsApi } from "../../tools-api";
import { useTools } from "../../tools-context";
import { treemap } from "../../treemap";
import type { FileEntry, FolderReview, MapNode } from "../../types";
import { useDisk, useWorkspace } from "../../workspace";

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
  const w = useWorkspace();
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
      <strong title={"Tamanho lógico: " + bytes(f.logicalBytes)}>{bytes(f.bytes)}</strong>
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
  const [search, setSearch] = useState("");
  const [minimum, setMinimum] = useState(50);
  const [age, setAge] = useState(0);
  const [type, setType] = useState("all");
  const [clock, setClock] = useState("modified");

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
          (clock === "accessed" ? f.accessed! : f.modified) < Date.now() / 1000 - age * 86400)),
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
          <select value={minimum} onChange={(e) => setMinimum(Number(e.target.value))}>
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
        {filtered.length} arquivos · tamanhos alocados; filtro por tamanho lógico. Datas de acesso
        podem ser afetadas pelo sistema e pela leitura. A lista contém os 5.000 maiores arquivos a
        partir de 50 MB.
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
              if (next.has(f.id)) {
                next.delete(f.id);
              } else {
                next.add(f.id);
              }
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
          Exibindo os 500 maiores resultados. Refine os filtros para ver os demais.
        </p>
      )}
    </>
  );
}

export function Explorer() {
  const t = useTools();
  const w = useWorkspace();
  const disk = useDisk();
  const [tab, setTab] = useState<"map" | "large" | "duplicates">("map");
  const [trail, setTrail] = useState<string[]>([]);
  const [review, setReview] = useState(false);
  const [folderReview, setFolderReview] = useState<FolderReview | null>(null);

  const r = t.catalog.data;
  const path = trail[0] === r?.root ? trail.at(-1)! : (r?.root ?? "");

  useEffect(() => {
    setFolderReview(null);
  }, [r?.root, tab, path]);

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
    if (n.directory) {
      setTrail(trail[0] === r?.root ? [...trail, n.path] : [r!.root, n.path]);
    } else {
      void w.feedback(() => toolsApi.preview(n.path));
    }
  };

  const nodes = children.data ?? [];
  const shown = nodes.filter((n) => n.bytes > 0).slice(0, 40);
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
  const selection = tab === "duplicates" ? t.duplicateSelection : t.fileSelection;
  const selectedFiles =
    tab === "duplicates"
      ? (t.duplicates ?? []).flatMap((g) => g.files).filter((f) => selection.has(f.id))
      : (r?.files ?? []).filter((f) => selection.has(f.id));

  const reviewIdentity = selectedFiles
    .map((f) => f.id + ":" + f.bytes)
    .sort()
    .join("|");

  useEffect(() => {
    setReview(false);
  }, [r?.root, reviewIdentity]);

  return (
    <main className="content tool-content">
      <Heading
        eyebrow="UM OLHAR MAIS DE PERTO"
        title="Encontre o espaço"
        description="Explore as pastas. Escolha o que faz sentido guardar."
        action={
          <button className="button subtle compact" disabled={w.busy} onClick={() => void choose()}>
            <FolderOpen size={16} />
            Escolher pasta
          </button>
        }
      />
      <div className="tool-tabs" role="tablist" aria-label="Ferramentas de arquivos">
        {(
          [
            ["map", FolderTree, "Mapa visual"],
            ["large", File, "Grandes e antigos"],
            ["duplicates", Copy, "Duplicados"],
          ] as const
        ).map(([id, Icon, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
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
          <button className="button primary" disabled={w.busy || !disk.data} onClick={scanHome}>
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
                : t.indexStatus.data?.watching
                  ? "Índice acompanhado automaticamente"
                  : "Índice salvo · conferência periódica"}
            </span>
            <span>
              {r.reusedDirectories ?? 0} pastas reutilizadas · {r.scannedDirectories ?? 0} relidas ·{" "}
              {((r.elapsedMs ?? 0) / 1000).toFixed(1)} s
            </span>
          </div>
          <p className="saved-catalog-note">
            {r.cached
              ? "O índice salvo está disponível enquanto a conferência automática acontece. "
              : "Mudanças e limpezas atualizam os registros afetados. "}
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
                        setTrail((trail[0] === r.root ? trail : [r.root]).slice(0, i + 1))
                      }
                    >
                      {i === 0 ? shortPath(p, disk.data?.home) : p.split("/").at(-1)}
                    </button>
                    <ChevronRight size={13} />
                  </span>
                ))}
              </div>
              <div className="map-folder-actions">
                <code title={path}>{shortPath(path, disk.data?.home)}</code>
                <button
                  className="button subtle compact"
                  disabled={w.busy || path === r.root || children.isPending || children.isError}
                  onClick={() => reviewFolder(path)}
                >
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
                  <div className="treemap" role="region" aria-label={"Mapa de " + path}>
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
                            (n.directory ? <FolderOpen size={20} /> : <File size={20} />)}
                        </button>
                      );
                    })}
                    {!rectangles.length && (
                      <span className="map-zero">Nenhum espaço alocado nesta pasta.</span>
                    )}
                  </div>
                  <p className="setting-caption">
                    Clique em uma pasta para navegar; em um arquivo para abrir Quick Look. O mapa
                    usa espaço alocado e agrupa após os 40 maiores itens.
                  </p>
                  <div className="tool-list">
                    {nodes.slice(0, 300).map((n) => (
                      <div className="tool-row" key={n.path}>
                        <button className="row-link" disabled={w.busy} onClick={() => drill(n)}>
                          {n.directory ? <FolderOpen size={18} /> : <File size={18} />}
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
                          <button
                            className="icon-button"
                            disabled={w.busy || n.incomplete}
                            title="Enviar pasta à Lixeira"
                            aria-label={"Enviar " + n.name + " à Lixeira"}
                            onClick={() => reviewFolder(n.path)}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                        <button
                          className="icon-button"
                          aria-label={"Mostrar " + n.name + " no Finder"}
                          onClick={() => void w.feedback(() => api.reveal(n.path))}
                        >
                          <ArrowUpRight size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                  {nodes.length > 300 && (
                    <p className="setting-caption">
                      Exibindo os 300 maiores itens. Escolha uma subpasta para detalhar.
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
                    Compara arquivos a partir de 1 MiB. Links para o mesmo arquivo não são
                    duplicados.
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
                      <span>Até {bytes(g.recoverableBytes)} · preserve uma cópia</span>
                    </div>
                    {g.files.map((f) => {
                      const count = g.files.filter((f) => t.duplicateSelection.has(f.id)).length;
                      return (
                        <FileRow
                          key={f.id}
                          f={f}
                          checked={t.duplicateSelection.has(f.id)}
                          disabled={
                            w.busy ||
                            (!t.duplicateSelection.has(f.id) && count >= g.files.length - 1)
                          }
                          onToggle={() => {
                            const next = new Set(t.duplicateSelection);
                            if (next.has(f.id)) {
                              next.delete(f.id);
                            } else {
                              next.add(f.id);
                            }
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
            <SelectionBar
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
          Arquivos pessoais não são selecionados automaticamente. O envio à Lixeira só libera espaço
          após esvaziá-la no Finder.
        </span>
      </div>
      {review && (
        <ReviewModal
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
        <ReviewModal
          title="Enviar esta pasta à Lixeira?"
          description={`A pasta inteira e seus ${folderReview.files} arquivos serão movidos à Lixeira. Você pode recuperá-la pelo Histórico ou pelo Finder. O espaço só será liberado após esvaziar a Lixeira.`}
          items={[folderReview]}
          acknowledge="Revisei a pasta e seu conteúdo e quero movê-la à Lixeira."
          pending={t.trashFolder.isPending}
          error={t.trashFolder.isError ? t.trashFolder.error : null}
          onClose={() => setFolderReview(null)}
          onConfirm={() =>
            t.trashFolder.mutate(folderReview, {
              onSuccess: () => {
                const activeTrail = trail[0] === r?.root ? trail : [r!.root];
                const removedIndex = activeTrail.findIndex(
                  (p) => p === folderReview.path || p.startsWith(folderReview.path + "/"),
                );
                if (removedIndex >= 0) {
                  setTrail(activeTrail.slice(0, removedIndex));
                }
                setFolderReview(null);
              },
            })
          }
        />
      )}
    </main>
  );
}
