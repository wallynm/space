import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Check,
  ChevronDown,
  History as HistoryIcon,
  LoaderCircle,
  ShieldCheck,
  Trash2,
  Undo2,
} from "lucide-react";
import { native } from "../../bridge";
import { bytes, date } from "../../format";
import { toolsApi } from "../../tools-api";
import { useHistory, useWorkspace } from "../../workspace";

export function History() {
  const w = useWorkspace();
  const history = useHistory();
  const client = useQueryClient();

  const restore = useMutation({
    mutationFn: ({ recordId, itemId }: { recordId: string; itemId: string }) =>
      toolsApi.restore(recordId, itemId),
    onSuccess: (data) => {
      client.setQueryData(["history"], data);
      void client.invalidateQueries({ queryKey: ["disk"] });
    },
    onError: (e) => w.setNotice(String(e)),
  });

  const records = history.data ?? [];

  return (
    <main className="content">
      <div className="page-heading">
        <div>
          <div className="eyebrow">CADA LIMPEZA, UM REGISTRO.</div>
          <h1>
            Espaço recuperado<span>.</span>
          </h1>
          <p>Confira o que saiu e o que foi preservado.</p>
        </div>
      </div>
      <div className="history-summary">
        <HistoryIcon size={23} />
        <div>
          <span>Total registrado</span>
          <strong>{bytes(records.reduce((t, r) => t + r.freedBytes, 0))}</strong>
        </div>
        <span>
          {records.length} {records.length === 1 ? "limpeza" : "limpezas"}
        </span>
      </div>
      {history.isPending ? (
        <div className="empty-state">
          <LoaderCircle className="spin" />
        </div>
      ) : history.isError ? (
        <div role="alert" className="notice">
          {String(history.error)}
        </div>
      ) : !records.length ? (
        <div className="empty-state history-empty">
          <HistoryIcon size={36} />
          <h3>Seu histórico começa aqui.</h3>
          <p>
            Depois da primeira limpeza, os caminhos removidos
            <br />e o espaço efetivo recuperado aparecem nesta tela.
          </p>
          <Link to="/" className="text-button">
            Voltar para análise <ArrowRight size={16} />
          </Link>
        </div>
      ) : (
        records.map((record) => (
          <details className="history-record" key={record.id}>
            <summary>
              <div className="history-check">
                <Check size={20} />
              </div>
              <div>
                <strong>{date(record.createdAt)}</strong>
                <p>
                  {record.removed.length}{" "}
                  {record.mode?.startsWith("trash") ? "itens na Lixeira" : "itens removidos"} ·{" "}
                  {record.skipped.length} preservados
                </p>
              </div>
              <strong className="history-size">+ {bytes(record.freedBytes)}</strong>
              <ChevronDown size={18} />
            </summary>
            <div className="history-details">
              <h3>{record.mode?.startsWith("trash") ? "Enviados à Lixeira" : "Removidos"}</h3>
              {record.removed.map((path) => {
                const item = record.recovery?.find((i) => i.original === path);
                return (
                  <div className="history-recovery" key={path}>
                    <code>{path}</code>
                    {item && (
                      <button
                        className="text-button"
                        title={
                          item.fingerprint == null ? "Recupere manualmente pelo Finder" : undefined
                        }
                        disabled={!native || w.busy || item.restored || item.fingerprint == null}
                        onClick={() =>
                          restore.mutate({
                            recordId: record.id,
                            itemId: item.id,
                          })
                        }
                      >
                        <Undo2 size={14} />
                        {item.restored ? "Recuperado" : "Recuperar"}
                      </button>
                    )}
                  </div>
                );
              })}
              {record.skipped.length > 0 && (
                <>
                  <h3>Preservados / erros</h3>
                  {record.skipped.map((path) => (
                    <code key={path}>{path}</code>
                  ))}
                </>
              )}
              {record.mode?.startsWith("trash") ? (
                <>
                  <p>
                    {bytes(record.movedBytes ?? record.removedBytes)} enviados à Lixeira. Estes
                    itens ainda ocupam disco. Use Recuperar para voltar ao caminho original. Se a
                    recuperação automática estiver indisponível, arraste o item da Lixeira no
                    Finder. Um arquivo existente no destino será preservado.
                  </p>
                  <button
                    className="button subtle compact"
                    onClick={() => void w.feedback(toolsApi.openTrash)}
                  >
                    <Trash2 size={16} />
                    Abrir Lixeira
                  </button>
                </>
              ) : (
                <p>
                  Tamanho estimado dos recursos removidos: {bytes(record.removedBytes)}. Espaço
                  efetivo é a diferença medida no disco.
                </p>
              )}
            </div>
          </details>
        ))
      )}
      <div className="scope-note">
        <ShieldCheck size={17} />
        <span>Histórico armazenado localmente. Até 100 registros de limpeza.</span>
      </div>
    </main>
  );
}
