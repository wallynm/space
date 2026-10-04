import { Link } from "@tanstack/react-router";
import { ArrowRight, Code2, FolderOpen, RefreshCw, ShieldCheck } from "lucide-react";
import { Empty } from "../../components/ui/Empty";
import { Heading } from "../../components/ui/Heading";
import { Operation } from "../../components/ui/Operation";
import { Warnings } from "../../components/ui/Warnings";
import { bytes, shortPath } from "../../format";
import { useTools } from "../../tools-context";
import { useDisk, useWorkspace } from "../../workspace";

export function Projects() {
  const t = useTools();
  const w = useWorkspace();
  const disk = useDisk();
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
            <RefreshCw size={16} />
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
                  <code title={p.path}>{shortPath(p.path, disk.data?.home)}</code>
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
                    width: (p.dependencyBytes / Math.max(p.bytes, 1)) * 100 + "%",
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
                  <strong>{bytes(Math.max(0, p.bytes - p.buildBytes - p.dependencyBytes))}</strong>
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
          Projetos aninhados têm contabilização própria. Este diagnóstico inclui builds que a
          limpeza rápida preserva.
        </span>
      </div>
      <Link to="/" className="button subtle">
        Revisar caches removíveis
        <ArrowRight size={16} />
      </Link>
    </main>
  );
}
