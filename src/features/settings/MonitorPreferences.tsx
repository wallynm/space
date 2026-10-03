import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { native } from "../../bridge";
import { toolsApi } from "../../tools-api";
import { useMonitor } from "../../tools-context";
import { useWorkspace } from "../../workspace";

export function MonitorPreferences() {
  const monitor = useMonitor();
  const client = useQueryClient();
  const w = useWorkspace();

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
          <p>Medição leve de espaço livre, sem leitura periódica das suas pastas.</p>
        </div>
        <Bell size={22} />
      </div>
      {settings ? (
        <>
          <label className="toggle-setting">
            <span>
              <strong>Registrar espaço em segundo plano</strong>
              <small>Enquanto o Space estiver aberto, inclusive com a janela fechada.</small>
            </span>
            <input
              type="checkbox"
              checked={settings.enabled}
              disabled={update.isPending}
              onChange={(e) => update.mutate({ ...settings, enabled: e.target.checked })}
            />
          </label>
          <label className="toggle-setting">
            <span>
              <strong>Notificar quando o disco ficar cheio</strong>
              <small>Abaixo do limite configurado. No máximo um aviso a cada 6 horas.</small>
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
