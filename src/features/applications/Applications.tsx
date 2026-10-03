import { ChevronRight, Package, Search, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Empty } from "../../components/ui/Empty";
import { Heading } from "../../components/ui/Heading";
import { Operation } from "../../components/ui/Operation";
import { ReviewModal } from "../../components/ui/ReviewModal";
import { SelectionBar } from "../../components/ui/SelectionBar";
import { Warnings } from "../../components/ui/Warnings";
import { bytes } from "../../format";
import { useTools } from "../../tools-context";
import { useWorkspace } from "../../workspace";

export function Applications() {
  const t = useTools();
  const w = useWorkspace();
  const [includeContainers, setIncludeContainers] = useState(false);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [review, setReview] = useState(false);

  const r = t.apps;

  useEffect(() => {
    setSelected(new Set());
    setReview(false);
  }, [r?.id]);

  const chosen = (r?.apps ?? []).flatMap((a) => a.parts).filter((p) => selected.has(p.id));

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
        <span>O macOS pode solicitar acesso. Sem autorização, os itens ficam bloqueados.</span>
      </label>
      {t.scanApps.isPending || t.trashApps.isPending ? (
        <Operation
          label={
            t.trashApps.isPending ? "Enviando itens à Lixeira…" : "Identificando apps e seus dados…"
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
              <select value={filter} onChange={(e) => setFilter(e.target.value)}>
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
                  <p>{a.leftover ? "Sem app encontrado · confira antes de remover" : a.bundleId}</p>
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
                    Pode pertencer a um app fora das pastas pesquisadas. Ausência do app não
                    comprova que os dados são dispensáveis.
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
                        if (next.has(p.id)) {
                          next.delete(p.id);
                        } else {
                          next.add(p.id);
                        }
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
                      {p.blocked && <small className="blocked-reason">{p.blocked}</small>}
                    </div>
                    <strong>{p.bytes == null ? "Não medido" : bytes(p.bytes)}</strong>
                  </label>
                ))}
              </div>
            </details>
          ))}
          <SelectionBar
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
          Dados compartilhados entre apps não entram por aproximação de nome. Feche os apps
          selecionados antes de continuar.
        </span>
      </div>
      {review && (
        <ReviewModal
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
