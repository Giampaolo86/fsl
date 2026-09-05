import { Trophy } from "lucide-react";
import { PageHeader } from "@/components/fsl/Primitives";
import { EmptyState, ErrorState, LoadingState } from "@/components/fsl/States";
import { useScoped } from "@/hooks/useTournamentData";
import { apiError } from "@/lib/api";
import { FORMULA, TIEBREAK_LABELS } from "@/lib/format";

export default function Competitions() {
  const { data, error, loading, reload } = useScoped("competitions");
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={apiError(error)} onRetry={reload} />;
  return (
    <div>
      <PageHeader kicker="Stagioni e competizioni" title="Competizioni" subtitle="Un campionato per ogni combinazione categoria × serie. Regole e tie-break sono memorizzati per competizione." />
      {data.length === 0 ? (
        <EmptyState icon={Trophy} title="Nessuna competizione" description="Aggiungi categorie e serie nelle impostazioni per generare i campionati." />
      ) : (
        <div className="fsl-card overflow-x-auto">
          <table className="w-full table-dark" data-testid="competitions-table">
            <thead>
              <tr>
                <th>Competizione</th>
                <th>Categoria</th>
                <th>Serie</th>
                <th>Formula</th>
                <th className="text-right">Squadre</th>
                <th className="text-right">Giornate</th>
                <th>Zone</th>
                <th>Tie-break</th>
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id} data-testid={`competition-row-${c.code}`}>
                  <td className="font-semibold">{c.name}</td>
                  <td className="num">{c.category}</td>
                  <td>{c.series}</td>
                  <td className="text-fsl-slate">{FORMULA[c.format]}</td>
                  <td className="num text-right">
                    <span className={c.teams_registered === c.teams_count ? "text-fsl-success" : ""}>{c.teams_registered}</span>
                    <span className="text-fsl-slate">/{c.teams_count}</span>
                  </td>
                  <td className="num text-right">{c.rounds}</td>
                  <td className="text-xs text-fsl-slate">
                    {Object.keys(c.zones || {}).length === 0
                      ? "—"
                      : Object.entries(c.zones).map(([k, v]) => (
                          <span key={k} className="inline-block mr-2">
                            {k.replace(/_/g, " ")}: <span className="num text-fsl-white">{Array.isArray(v) ? v.join("–") : v}</span>
                          </span>
                        ))}
                  </td>
                  <td className="text-xs text-fsl-slate">{c.tiebreakers.map((t) => TIEBREAK_LABELS[t] || t).join(" → ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
