import { Trophy, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/fsl/Primitives";
import { EmptyState, ErrorState, LoadingState } from "@/components/fsl/States";
import { useScoped, useTournamentDetail } from "@/hooks/useTournamentData";
import { api, apiError } from "@/lib/api";
import { FORMULA, TIEBREAK_LABELS } from "@/lib/format";

const KIND = { league: "Girone", knockout: "Eliminazione diretta", league_knockout: "Girone + fase finale" };

export default function Competitions() {
  const { data, error, loading, reload } = useScoped("competitions");
  const { data: t } = useTournamentDetail();
  if (loading || !t) return <LoadingState />;
  if (error) return <ErrorState message={apiError(error)} onRetry={reload} />;
  const canWrite = ["super_admin", "director"].includes(t.my_role) && !t.read_only;
  const patch = async (c, body) => { try { await api.patch(`/tournaments/${t.id}/competitions/${c.id}`, body); reload(); } catch (e) { toast.error(apiError(e)); } };
  const finals = async (c) => { try { const { data: r } = await api.post(`/tournaments/${t.id}/competitions/${c.id}/finals/generate`); toast.success(`${r.round_name}: ${r.count} gare create`); } catch (e) { toast.error(apiError(e)); } };
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
                <th>Tipo</th>
                <th>Fase finale</th>
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
                  <td>{canWrite ? <select className="fsl-input h-9 w-44" value={c.kind} onChange={(e) => patch(c, { kind: e.target.value })} data-testid={`competition-kind-${c.code}`}>{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select> : <span className="text-xs">{KIND[c.kind]}</span>}</td>
                  <td>
                    {c.kind === "league" ? <span className="text-xs text-fsl-slate">—</span> : (
                      <div className="flex items-center gap-1">
                        <select className="fsl-input h-9 w-24" value={c.finals?.qualifiers || 0} disabled={!canWrite} onChange={(e) => patch(c, { finals: { qualifiers: Number(e.target.value), mode: "knockout" } })} data-testid={`competition-qualifiers-${c.code}`}>{[0, 2, 4, 8].map((n) => <option key={n} value={n}>{n || "—"} sq.</option>)}</select>
                        {canWrite && c.finals?.qualifiers > 0 && <button className="btn-ghost h-9 px-2" onClick={() => finals(c)} title="Genera / avanza fase finale" data-testid={`competition-finals-${c.code}`}><Wand2 className="h-4 w-4" /></button>}
                      </div>
                    )}
                  </td>
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
