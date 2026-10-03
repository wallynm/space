import { Box, Layers, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Empty } from "../../components/ui/Empty";
import { Heading } from "../../components/ui/Heading";
import { Operation } from "../../components/ui/Operation";
import { ReviewModal } from "../../components/ui/ReviewModal";
import { SelectionBar } from "../../components/ui/SelectionBar";
import { Warnings } from "../../components/ui/Warnings";
import { bytes } from "../../format";
import { useTools } from "../../tools-context";
import type { DockerItem } from "../../types";
import { useWorkspace } from "../../workspace";

const dockerLabels: Record<DockerItem["kind"], string> = {
  cache: "Cache de build",
  image: "Imagens",
  container: "Containers",
  volume: "Volumes",
};

export function Docker() {
  const t = useTools();
  const w = useWorkspace();
  const [tab, setTab] = useState<DockerItem["kind"]>("cache");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [review, setReview] = useState(false);

  const r = t.docker;
  const items = r?.items.filter((i) => i.kind === tab) ?? [];
  const chosen = r?.items.filter((i) => selected.has(i.id)) ?? [];
  const volumes = chosen.some((i) => i.kind === "volume");

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
          <div className="tool-tabs" role="tablist" aria-label="Categorias Docker">
            {(["cache", "image", "container", "volume"] as const).map((kind) => (
              <button
                key={kind}
                role="tab"
                aria-selected={tab === kind}
                onClick={() => setTab(kind)}
              >
                {kind === "cache" ? <Layers size={16} /> : <Box size={16} />} {dockerLabels[kind]}
                <span className="tab-count">{r.items.filter((i) => i.kind === kind).length}</span>
              </button>
            ))}
          </div>
          <div className="tool-list">
            {items.map((i) => (
              <div
                className={"tool-row docker-row " + (selected.has(i.id) ? "selected" : "")}
                key={i.id}
              >
                <input
                  type="checkbox"
                  aria-label={"Selecionar " + i.name}
                  disabled={w.busy || !!i.blocked}
                  checked={selected.has(i.id)}
                  onChange={() => {
                    const next = new Set(selected);
                    if (next.has(i.id)) {
                      next.delete(i.id);
                    } else {
                      next.add(i.id);
                    }
                    setSelected(next);
                  }}
                />
                <Box size={18} />
                <div className="file-label">
                  <strong>{i.name || i.resourceId}</strong>
                  <small>{i.detail}</small>
                  {i.blocked && <small className="blocked-reason">{i.blocked}</small>}
                </div>
                <strong>
                  {i.bytes == null ? "Desconhecido" : bytes(i.bytes)}
                  {i.shared && <small className="shared-label">compartilhado</small>}
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
          <SelectionBar
            count={chosen.length}
            size={chosen.reduce((s, i) => s + (i.bytes ?? 0), 0)}
            label="Revisar remoção"
            onClear={() => setSelected(new Set())}
            onReview={() => setReview(true)}
            disabled={w.busy}
          />
          <p className="setting-caption">
            Total selecionado é uma estimativa, exclui tamanhos desconhecidos e pode somar camadas
            compartilhadas. Remoções são permanentes; a VM do Docker pode não devolver todo o espaço
            imediatamente ao macOS.
          </p>
          <Warnings items={r.warnings} />
        </>
      )}
      <div className="scope-note">
        <ShieldCheck size={16} />
        <span>
          Não executa prune geral. Remove IDs selecionados; volumes nunca são incluídos por seleção
          automática.
        </span>
      </div>
      {review && (
        <ReviewModal
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
