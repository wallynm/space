import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import {
  ShieldCheck,
  FolderOpen,
  X,
  Download,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { api, native } from "./bridge";
import { desktopApi } from "./desktop-api";
import { useWorkspace } from "./workspace";
import type { CatalogReport, UpdateView } from "./types";
import { bytes } from "./format";

export function ProtectedFolders() {
  const w = useWorkspace(),
    client = useQueryClient();
  const protection = useQuery({
    queryKey: ["protection"],
    queryFn: desktopApi.protection,
    staleTime: Infinity,
  });
  const update = useMutation({
    mutationFn: desktopApi.protect,
    onSuccess: (p) => client.setQueryData(["protection"], p),
    onError: (e) => w.setNotice(String(e)),
  });
  const add = async () => {
    try {
      const p = await api.pickFolder();
      if (p) update.mutate([...(protection.data?.paths ?? []), p]);
    } catch (e) {
      w.setNotice(String(e));
    }
  };
  return (
    <section className="settings-card">
      <div className="section-heading">
        <div>
          <h2>Pastas protegidas</h2>
          <p>
            Você pode consultar estas pastas no Finder. O Space preserva seus
            arquivos e não oferece limpeza delas ou de pastas que as contenham.
          </p>
        </div>
        <button
          className="button subtle compact"
          disabled={w.busy || !protection.data}
          onClick={() => void add()}
        >
          <ShieldCheck size={16} />
          Proteger pasta
        </button>
      </div>
      <div className="roots-list">
        {protection.data?.paths.map((p) => (
          <div key={p}>
            <ShieldCheck size={18} />
            <code>{p}</code>
            <button
              className="icon-button"
              disabled={w.busy}
              aria-label={"Remover proteção de " + p}
              onClick={() =>
                update.mutate(protection.data!.paths.filter((v) => v !== p))
              }
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
      {!protection.data?.paths.length && (
        <p className="setting-caption">
          Adicione seus backups, projetos importantes ou pastas de bancos de
          dados.
        </p>
      )}
      {protection.isError && (
        <p role="alert" className="inline-error">
          {String(protection.error)}
        </p>
      )}
      <p className="setting-caption">
        Alterar a proteção invalida as seleções anteriores. Proteger o
        armazenamento de Docker ou OrbStack também bloqueia a limpeza de seus
        recursos.
      </p>
    </section>
  );
}
export function PermissionHelp({ report }: { report: CatalogReport }) {
  const w = useWorkspace(),
    client = useQueryClient();
  const retry = useMutation({
    mutationFn: desktopApi.retry,
    onSuccess: (r) => client.setQueryData(["catalog"], r),
    onError: (e) => w.setNotice(String(e)),
  });
  if (!report.unreadable?.length) return null;
  return (
    <section className="permission-card">
      <div className="section-heading">
        <div>
          <h2>
            <AlertCircle size={18} /> Algumas pastas ficaram sem leitura
          </h2>
          <p>
            O macOS pode pedir autorização. Em Privacidade e Segurança, habilite
            o Space em Acesso Total ao Disco se necessário; pode ser preciso
            encerrar e abrir o app novamente. Nenhuma permissão é concedida
            automaticamente.
          </p>
        </div>
        <button
          className="button subtle compact"
          disabled={!native || w.busy}
          onClick={() => void w.feedback(desktopApi.privacy)}
        >
          Abrir ajustes
        </button>
      </div>
      <p className="setting-caption">
        Reanalisar uma pasta abaixo consulta apenas esse local e abre seu
        próprio mapa. A análise salva anterior continua disponível até concluir
        a leitura.
      </p>
      {report.unreadable.slice(0, 20).map((item) => (
        <div className="permission-row" key={item.path}>
          <FolderOpen size={17} />
          <div>
            <code>{item.path}</code>
            <small>{item.reason}</small>
          </div>
          <button
            className="button subtle compact"
            disabled={!native || w.busy}
            onClick={() => retry.mutate(item.path)}
          >
            Reanalisar pasta
          </button>
        </div>
      ))}
    </section>
  );
}
export function Updates() {
  const w = useWorkspace(),
    client = useQueryClient();
  const info = useQuery({
    queryKey: ["updates"],
    queryFn: desktopApi.updates,
    staleTime: Infinity,
  });
  const done = (v: UpdateView) => client.setQueryData(["updates"], v);
  const check = useMutation({
    mutationFn: desktopApi.checkUpdates,
    onSuccess: done,
    onError: (e) => w.setNotice(String(e)),
  });
  const preferences = useMutation({
    mutationFn: desktopApi.updatePreferences,
    onSuccess: done,
    onError: (e) => w.setNotice(String(e)),
  });
  const install = useMutation({
    mutationFn: desktopApi.installUpdate,
    onSuccess: done,
    onError: (e) => w.setNotice(String(e)),
  });
  useEffect(() => {
    if (!native) return;
    const sub = listen<UpdateView>("updates-changed", (e) => done(e.payload));
    return () => {
      void sub.then((stop) => stop());
    };
  }, [client]);
  const r = info.data;
  return (
    <section className="settings-card update-card">
      <div className="section-heading">
        <div>
          <h2>Atualizações do Space</h2>
          <p>
            Versão instalada: {r?.currentVersion ?? "…"}. Novas versões são
            verificadas antes da instalação.
          </p>
        </div>
        <button
          className="button subtle compact"
          disabled={w.busy || !r?.configured || r.phase === "installed"}
          onClick={() => check.mutate()}
        >
          <RefreshCw size={16} />
          Buscar atualização
        </button>
      </div>
      {r && (
        <label className="update-preference">
          <input
            type="checkbox"
            checked={r.checkOnLaunch}
            disabled={w.busy || !r.configured}
            onChange={(e) => preferences.mutate(e.target.checked)}
          />
          Buscar novidades ao abrir o Space
        </label>
      )}
      {!r?.configured && (
        <p className="setting-caption">
          Atualizações pelo app ainda não foram publicadas para esta edição. O
          instalador local continua disponível.
        </p>
      )}
      {r?.phase === "current" && (
        <p className="update-status">Você está na versão mais recente.</p>
      )}
      {r?.version && (
        <div className="update-release">
          <strong>Space {r.version}</strong>
          {r.notes && <p>{r.notes}</p>}
        </div>
      )}
      {(r?.phase === "downloading" || r?.phase === "installing") && (
        <div role="status">
          <p>
            {r.phase === "installing"
              ? "Instalando pacote verificado…"
              : `${bytes(r.downloaded)} baixados${r.total ? " de " + bytes(r.total) : ""}`}
          </p>
          {r.total && <progress value={r.downloaded} max={r.total} />}
        </div>
      )}
      {r?.phase === "checking" && (
        <p role="status">Procurando novas versões…</p>
      )}
      {r?.version && ["available", "error"].includes(r.phase) && (
        <button
          className="button primary"
          disabled={w.busy || !native}
          onClick={() => install.mutate(r.version!)}
        >
          <Download size={16} />
          Instalar versão {r.version}
        </button>
      )}
      {r?.phase === "installed" && (
        <button
          className="button primary"
          disabled={w.busy}
          onClick={() => void w.feedback(desktopApi.restart)}
        >
          Reiniciar para usar a atualização
        </button>
      )}
      {(r?.error || info.isError) && (
        <p role="alert" className="inline-error">
          {r?.error || String(info.error)}
        </p>
      )}
    </section>
  );
}
