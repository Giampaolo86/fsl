import { useState } from "react";
import { Plus, Trash2, Trophy, Wand2 } from "lucide-react";
import { FinalsDialog } from "@/components/fsl/FinalsDialog";
import { toast } from "sonner";
import { PageHeader } from "@/components/fsl/Primitives";
import { EmptyState, ErrorState, LoadingState } from "@/components/fsl/States";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useScoped, useTournamentDetail } from "@/hooks/useTournamentData";
import { api, apiError } from "@/lib/api";
import { FORMULA, TIEBREAK_LABELS } from "@/lib/format";

const KIND = { league: "Girone", knockout: "Fase finale (incroci tra gironi)", league_knockout: "Girone + fase finale" };

function NewCompetitionDialog({ tid, categories, onClose, onDone }) {
  const [f, setF] = useState({ category: categories[0] || "", series: "", kind: "league", format: "single_round_robin", teams_count: 4 });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await api.post(`/tournaments/${tid}/competitions`, { ...f, teams_count: Number(f.teams_count) }); toast.success("Competizione creata"); onDone(); onClose(); } catch (err) { toast.error(apiError(err)); } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" data-testid="new-competition-dialog">
        <DialogHeader><DialogTitle className="font-display uppercase">Nuova competizione</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <label className="block text-xs uppercase tracking-wider text-fsl-slate">Categoria<input list="comp-cats" className="fsl-input mt-1" value={f.category} onChange={set("category")} required data-testid="new-competition-category" /><datalist id="comp-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist></label>
          <label className="block text-xs uppercase tracking-wider text-fsl-slate">Tipo<select className="fsl-input mt-1" value={f.kind} onChange={set("kind")} data-testid="new-competition-kind">{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          {f.kind !== "knockout" && (
            <>
              <label className="block text-xs uppercase tracking-wider text-fsl-slate">Nome girone / serie<input className="fsl-input mt-1" placeholder="Girone C, Serie B…" value={f.series} onChange={set("series")} required data-testid="new-competition-series" /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs uppercase tracking-wider text-fsl-slate">Formula<select className="fsl-input mt-1" value={f.format} onChange={set("format")} data-testid="new-competition-format"><option value="single_round_robin">Sola andata</option><option value="double_round_robin">Andata e ritorno</option></select></label>
                <label className="block text-xs uppercase tracking-wider text-fsl-slate">Squadre<input type="number" min={0} max={40} className="fsl-input mt-1" value={f.teams_count} onChange={set("teams_count")} data-testid="new-competition-teams" /></label>
              </div>
            </>
          )}
          <div className="flex justify-end gap-2 pt-2"><button type="button" className="btn-ghost" onClick={onClose}>Annulla</button><button type="submit" className="btn-primary" disabled={busy} data-testid="new-competition-submit">{busy ? "Creo…" : "Crea"}</button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Competitions() {
  const { data, error, loading, reload } = useScoped("competitions");
  const { data: t } = useTournamentDetail();
  const [finalsFor, setFinalsFor] = useState(null);
  const [creating, setCreating] = useState(false);
  if (loading || !t) return <LoadingState />;
  if (error) return <ErrorState message={apiError(error)} onRetry={reload} />;
  const canWrite = ["super_admin", "director"].includes(t.my_role) && !t.read_only;
  const categories = [...new Set([...(t.settings?.categories || []), ...data.map((c) => c.category)])];
  const patch = async (c, body) => { try { await api.patch(`/tournaments/${t.id}/competitions/${c.id}`, body); reload(); } catch (e) { toast.error(apiError(e)); } };
  const close = async (c) => { if (!window.confirm(`Chiudere la stagione di ${c.name}? Verranno registrati campione, promosse e retrocesse.`)) return; try { const { data: o } = await api.post(`/tournaments/${t.id}/competitions/${c.id}/close`); toast.success(`Stagione chiusa · Campione: ${o.champion?.name}`); reload(); } catch (e) { toast.error(apiError(e)); } };
  const remove = async (c) => {
    if (!window.confirm(`Eliminare «${c.name}»?\nSegnaposto e gare non giocate verranno rimossi; le squadre reali restano libere.`)) return;
    try { await api.delete(`/tournaments/${t.id}/competitions/${c.id}`); toast.success(`${c.name} eliminata`); reload(); } catch (e) { toast.error(apiError(e)); }
  };
  return (
    <div>
      <PageHeader kicker="Stagioni e competizioni" title="Competizioni" subtitle="Un campionato per ogni combinazione categoria × serie. Regole e tie-break sono memorizzati per competizione." actions={canWrite && <button className="btn-primary" onClick={() => setCreating(true)} data-testid="competition-new-button"><Plus className="h-4 w-4" /> Nuova competizione</button>} />
      {data.length === 0 ? (
        <EmptyState icon={Trophy} title="Nessuna competizione" description="Crea la prima competizione con il pulsante in alto oppure imposta gironi e squadre dal Calendario." />
      ) : (
        <>
        <div className="md:hidden space-y-3" data-testid="competitions-cards">
          {data.map((c) => (
            <div key={c.id} className="fsl-card p-4 space-y-3" data-testid={`competition-card-${c.code}`}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1"><div className="font-display font-extrabold uppercase text-base leading-tight">{c.name}</div><div className="text-xs text-fsl-slate mt-0.5">{c.category} · {c.series} · {FORMULA[c.format]}</div></div>
                {canWrite && <button type="button" className="text-fsl-slate/60 hover:text-fsl-danger shrink-0" onClick={() => remove(c)} aria-label={`Elimina ${c.name}`} data-testid={`competition-card-delete-${c.code}`}><Trash2 className="h-4 w-4" /></button>}
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-md bg-ink-950/60 border border-white/10 py-2"><div className="num font-display font-extrabold text-lg leading-none">{c.kind === "knockout" ? c.finals?.qualifiers || 0 : <>{c.teams_registered}<span className="text-fsl-slate text-sm">/{c.teams_count}</span></>}</div><div className="text-[9px] uppercase tracking-wider text-fsl-slate mt-1">{c.kind === "knockout" ? "Qualificate" : "Squadre"}</div></div>
                <div className="rounded-md bg-ink-950/60 border border-white/10 py-2"><div className="num font-display font-extrabold text-lg leading-none">{c.kind === "knockout" ? "—" : c.rounds}</div><div className="text-[9px] uppercase tracking-wider text-fsl-slate mt-1">Giornate</div></div>
                <div className="rounded-md bg-ink-950/60 border border-white/10 py-2"><div className={`font-display font-extrabold text-sm leading-none pt-1 ${c.status === "closed" ? "text-fsl-success" : "text-fsl-gold"}`}>{c.status === "closed" ? "Chiusa" : "Aperta"}</div><div className="text-[9px] uppercase tracking-wider text-fsl-slate mt-1">Stagione</div></div>
              </div>
              <div className="space-y-2">
                {!(c.kind === "knockout" && c.finals?.mode === "cross_groups") && <label className="block text-[10px] uppercase tracking-wider text-fsl-slate">Tipo<select className="fsl-input h-10 mt-1 w-full" value={c.kind} disabled={!canWrite} onChange={(e) => patch(c, { kind: e.target.value })} data-testid={`competition-card-kind-${c.code}`}>{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>}
                {c.kind !== "league" && (c.finals?.mode === "cross_groups" ? (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-fsl-slate">Prime <select className="fsl-input h-10 w-16" value={c.finals.qualifiers_per_group || 0} disabled={!canWrite} onChange={(e) => patch(c, { finals: { qualifiers_per_group: Number(e.target.value) } })} data-testid={`competition-card-qpg-${c.code}`}>{[0, 1, 2, 4].map((n) => <option key={n} value={n}>{n || "—"}</option>)}</select> di ogni girone <label className="inline-flex items-center gap-1"><input type="checkbox" checked={!!c.finals.third_place} disabled={!canWrite} onChange={(e) => patch(c, { finals: { third_place: e.target.checked } })} /> 3°/4°</label></div>
                ) : (
                  <label className="block text-[10px] uppercase tracking-wider text-fsl-slate">Qualificate alla fase finale<select className="fsl-input h-10 mt-1 w-full" value={c.finals?.qualifiers || 0} disabled={!canWrite} onChange={(e) => patch(c, { finals: { qualifiers: Number(e.target.value), mode: "knockout" } })} data-testid={`competition-card-qualifiers-${c.code}`}>{[0, 2, 4, 8].map((n) => <option key={n} value={n}>{n || "—"} squadre</option>)}</select></label>
                ))}
              </div>
              {canWrite && (
                <div className="flex flex-wrap gap-2">
                  {c.kind !== "league" && (c.finals?.mode === "cross_groups" || c.finals?.qualifiers > 0) && <button className="btn-primary h-10 px-3 text-xs flex-1" onClick={() => setFinalsFor(c)} data-testid={`competition-card-finals-${c.code}`}><Wand2 className="h-4 w-4" /> Fase finale</button>}
                  {c.status !== "closed" && <button className="btn-ghost h-10 px-3 text-xs flex-1" onClick={() => close(c)} data-testid={`competition-card-close-${c.code}`}>Chiudi stagione</button>}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="fsl-card overflow-x-auto hidden md:block">
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
                <th>Stagione</th>
                {canWrite && <th className="w-10" aria-label="Azioni" />}
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
                    {c.kind === "knockout" ? <span className="text-xs text-fsl-slate">{c.finals?.qualifiers || 0} qualificate</span> : <><span className={c.teams_registered === c.teams_count ? "text-fsl-success" : ""}>{c.teams_registered}</span><span className="text-fsl-slate">/{c.teams_count}</span></>}
                  </td>
                  <td className="num text-right">{c.kind === "knockout" ? "—" : c.rounds}</td>
                  <td>{c.kind === "knockout" && c.finals?.mode === "cross_groups" ? <span className="text-xs">{KIND.knockout}</span> : canWrite ? <select className="fsl-input h-9 w-44" value={c.kind} onChange={(e) => patch(c, { kind: e.target.value })} data-testid={`competition-kind-${c.code}`}>{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select> : <span className="text-xs">{KIND[c.kind]}</span>}</td>
                  <td>
                    {c.kind === "league" ? <span className="text-xs text-fsl-slate">—</span> : c.finals?.mode === "cross_groups" ? (
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        <span className="text-xs text-fsl-slate">Prime</span>
                        <select className="fsl-input h-9 w-16" value={c.finals.qualifiers_per_group || 0} disabled={!canWrite} onChange={(e) => patch(c, { finals: { qualifiers_per_group: Number(e.target.value) } })} data-testid={`competition-qpg-${c.code}`}>{[0, 1, 2, 4].map((n) => <option key={n} value={n}>{n || "—"}</option>)}</select>
                        <span className="text-xs text-fsl-slate">di ogni girone</span>
                        <label className="inline-flex items-center gap-1 text-xs text-fsl-slate"><input type="checkbox" checked={!!c.finals.third_place} disabled={!canWrite} onChange={(e) => patch(c, { finals: { third_place: e.target.checked } })} data-testid={`competition-third-${c.code}`} /> 3°/4°</label>
                        {canWrite && <button className="btn-primary h-9 px-3 text-xs" onClick={() => setFinalsFor(c)} data-testid={`competition-finals-${c.code}`}><Wand2 className="h-4 w-4" /> Fase finale</button>}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <select className="fsl-input h-9 w-24" value={c.finals?.qualifiers || 0} disabled={!canWrite} onChange={(e) => patch(c, { finals: { qualifiers: Number(e.target.value), mode: "knockout" } })} data-testid={`competition-qualifiers-${c.code}`}>{[0, 2, 4, 8].map((n) => <option key={n} value={n}>{n || "—"} sq.</option>)}</select>
                        {canWrite && c.finals?.qualifiers > 0 && <button className="btn-ghost h-9 px-2" onClick={() => setFinalsFor(c)} title="Genera / avanza fase finale (accoppiamenti modificabili)" data-testid={`competition-finals-${c.code}`}><Wand2 className="h-4 w-4" /></button>}
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
                  <td className="text-xs text-fsl-slate max-w-[220px]">{c.tiebreakers.map((t) => TIEBREAK_LABELS[t] || t).join(" → ")}</td>
                  <td>{c.status === "closed" ? <span className="text-xs text-fsl-success font-semibold">● Chiusa</span> : canWrite && <button className="btn-ghost h-9 px-2 text-xs whitespace-nowrap" onClick={() => close(c)} data-testid={`competition-close-${c.code}`}>Chiudi stagione</button>}</td>
                  {canWrite && <td><button type="button" className="text-fsl-slate/60 hover:text-fsl-danger transition-colors" onClick={() => remove(c)} aria-label={`Elimina ${c.name}`} title="Elimina competizione" data-testid={`competition-delete-${c.code}`}><Trash2 className="h-4 w-4" /></button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
      {finalsFor && <FinalsDialog tid={t.id} competition={finalsFor} onClose={() => setFinalsFor(null)} onDone={reload} />}
      {creating && <NewCompetitionDialog tid={t.id} categories={categories} onClose={() => setCreating(false)} onDone={reload} />}
    </div>
  );
}
