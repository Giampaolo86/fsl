import { Archive } from "lucide-react";
import { PageHeader } from "@/components/fsl/Primitives";
import { EmptyState, ErrorState, LoadingState } from "@/components/fsl/States";
import { useScoped } from "@/hooks/useTournamentData";
import { apiError } from "@/lib/api";
import { fmtDate } from "@/lib/format";

export default function Audit() {
  const { data, error, loading, reload } = useScoped("audit");
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={apiError(error)} onRetry={reload} />;
  return (
    <div>
      <PageHeader kicker="Audit, esportazioni e impostazioni" title="Audit log" subtitle="Registro append-only di tutte le mutazioni del torneo: autore, azione, entità, valori prima/dopo e motivazione." />
      {data.length === 0 ? (
        <EmptyState icon={Archive} title="Nessuna voce" description="Le operazioni sul torneo verranno registrate qui." />
      ) : (
        <div className="fsl-card overflow-x-auto">
          <table className="w-full table-dark" data-testid="audit-table">
            <thead><tr><th>Data</th><th>Autore</th><th>Azione</th><th>Entità</th><th>Prima → Dopo</th><th>Motivazione</th></tr></thead>
            <tbody>
              {data.map((l) => (
                <tr key={l.id} data-testid={`audit-row-${l.id}`}>
                  <td className="num text-xs whitespace-nowrap">{fmtDate(l.created_at, { time: true })}</td>
                  <td className="text-xs"><div className="font-semibold">{l.actor_email}</div><div className="text-fsl-slate">{l.actor_role}</div></td>
                  <td><code className="text-xs text-fsl-gold">{l.action}</code></td>
                  <td className="text-xs text-fsl-slate">{l.entity}<br /><span className="num">{l.entity_id?.slice(-6)}</span></td>
                  <td className="text-xs max-w-xs">
                    {l.before && <div className="text-fsl-danger/90 truncate">− {JSON.stringify(l.before)}</div>}
                    {l.after && <div className="text-fsl-success/90 truncate">+ {JSON.stringify(l.after)}</div>}
                  </td>
                  <td className="text-xs text-fsl-slate">{l.reason || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
