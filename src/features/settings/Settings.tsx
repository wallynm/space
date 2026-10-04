import { FolderOpen, PanelTop, Plus, ShieldCheck, X } from "lucide-react";
import { version as appVersion } from "../../../package.json";
import { api } from "../../bridge";
import { Mark } from "../../components/ui/BrandMark";
import { ProtectedFolders, Updates } from "../../settings-tools";
import { useWorkspace } from "../../workspace";
import { MonitorPreferences } from "./MonitorPreferences";

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
          <button className="button subtle compact" disabled={w.busy} onClick={() => void add()}>
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
          Caches conhecidos de npm, Python, Homebrew e Xcode também são conferidos. Excluir um local
          desta lista não apaga seus arquivos.
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
            A análise de pastas é manual. O monitor pode registrar o espaço livre em segundo plano.
            Nenhuma limpeza acontece automaticamente. Cada exclusão exige uma seleção e revisão;
            dados do Docker exigem confirmação adicional.
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
