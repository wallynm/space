import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  ArrowRight,
  FolderOpen,
  FolderTree,
  Layers,
  Monitor,
  ShieldCheck,
} from "lucide-react";
import { Empty } from "../../components/ui/Empty";
import { Heading } from "../../components/ui/Heading";
import { Operation } from "../../components/ui/Operation";
import { Warnings } from "../../components/ui/Warnings";
import { bytes, date } from "../../format";
import { toolsApi } from "../../tools-api";
import { useMonitor, useTools } from "../../tools-context";
import { useWorkspace } from "../../workspace";

export function System() {
  const w = useWorkspace();
  const t = useTools();
  const monitor = useMonitor();

  const diagnose = useMutation({
    mutationFn: toolsApi.system,
    onError: (e) => w.setNotice(String(e)),
  });

  const r = diagnose.data;
  const samples = monitor.data?.samples ?? [];
  const growth = monitor.data?.growth ?? [];

  const max = Math.max(...samples.map((s) => s.free), 1);
  const min = Math.min(...samples.map((s) => s.free), max);
  const floor = Math.max(0, min - (max - min) * 0.2);
  const ceil = max + (max - min) * 0.2 || 1;
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
      {diagnose.isPending && <Operation label="Consultando informações do macOS…" />}
      {r && (
        <section className="settings-card">
          <div className="section-heading">
            <div>
              <h2>{r.volume}</h2>
              <p>{r.filesystem.toUpperCase()} · volumes compartilham o espaço do contêiner</p>
            </div>
            <Monitor size={24} />
          </div>
          <dl className="system-facts">
            <div>
              <dt>Capacidade do contêiner</dt>
              <dd>{r.containerBytes == null ? "Não informado" : bytes(r.containerBytes)}</dd>
            </div>
            <div>
              <dt>Livre no contêiner</dt>
              <dd>{r.containerFree == null ? "Não informado" : bytes(r.containerFree)}</dd>
            </div>
            <div>
              <dt>Uso do volume de dados</dt>
              <dd>{r.dataBytes == null ? "Não informado" : bytes(r.dataBytes)}</dd>
            </div>
            <div>
              <dt>Espaço purgável</dt>
              <dd>
                {r.purgeableBytes == null ? "Não informado pelo macOS" : bytes(r.purgeableBytes)}
              </dd>
            </div>
          </dl>
          <div className="snapshot-heading">
            <h3>{r.snapshots.length} snapshots identificados</h3>
            <p>
              O tamanho individual não foi informado. Snapshots de sistema e atualização são
              preservados.
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
              <svg aria-hidden="true" viewBox="0 0 1000 150" preserveAspectRatio="none">
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
                <strong className={g.delta != null && g.delta > 0 ? "growth-up" : "growth-neutral"}>
                  {g.delta == null
                    ? "Sem comparação"
                    : (g.delta > 0 ? "+" : g.delta < 0 ? "−" : "") + bytes(Math.abs(g.delta))}
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
            Pastas inacessíveis reduzem a cobertura. Os tamanhos do mapa não representam todo o
            disco quando a análise é parcial.
          </p>
          <Warnings items={t.catalog.data.warnings} />
        </section>
      ) : null}
      <div className="scope-note">
        <ShieldCheck size={16} />
        <span>
          “Dados do Sistema” é uma categoria do macOS, não um único cache removível. Valores
          desconhecidos não entram em promessas de espaço recuperável.
        </span>
      </div>
    </main>
  );
}
