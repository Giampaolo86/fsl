import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Archive, CheckCircle2, Lock, Trophy } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/fsl/Primitives";
import { LoadingState } from "@/components/fsl/States";
import { useAuth } from "@/context/AuthContext";
import { api, apiError } from "@/lib/api";
import { AwardsRow, Crest } from "@/pages/public/HallOfFame";
import { fmtDate } from "@/lib/format";

export default function Legacy() {
  const { tournamentId: tid } = useParams();
  const { user } = useAuth();
  const canClose = user.is_super_admin || user.role === "director";
  const [d, setD] = useState(null);
  const [comps, setComps] = useState([]);
  const [busy, setBusy] = useState("");
  const load = useCallback(() => Promise.all([api.get(`/tournaments/${tid}/legacy/preview`), api.get(`/tournaments/${tid}/competitions`)]).then(([a, b]) => { setD(a.data); setComps(Array.isArray(b.data) ? b.data : b.data.items); }), [tid]);
  useEffect(() => { load(); }, [load]);
  const closeComp = async (c) => { if (!window.confirm(`Chiudere «${c.name}»? Verranno registrati campione, promosse e retrocesse dalla classifica finale.`)) return; setBusy(c.id); try { await api.post(`/tournaments/${tid}/competitions/${c.id}/close`); toast.success(`${c.name} chiusa`); await load(); } catch (e) { toast.error(apiError(e)); } finally { setBusy(""); } };
  const closeSeason = async () => { const reason = window.prompt("Chiudere la stagione e pubblicarla nell'Albo d'oro? Indica una nota (facoltativa):", "Stagione conclusa"); if (reason === null) return; setBusy("season"); try { await api.post(`/tournaments/${tid}/legacy/close-season`, { reason }); toast.success("Stagione archiviata nell'Albo d'oro", { action: { label: "Apri Albo d'oro", onClick: () => window.open("/albo-doro", "_blank") } }); await load(); } catch (e) { toast.error(apiError(e)); } finally { setBusy(""); } };
  const reopen = async () => { if (!window.confirm("Rimuovere la stagione dall'Albo d'oro? Potrai richiuderla in seguito.")) return; setBusy("season"); try { await api.delete(`/tournaments/${tid}/legacy/archive`, { data: { reason: "Riapertura stagione" } }); toast.success("Archivio rimosso"); await load(); } catch (e) { toast.error(apiError(e)); } finally { setBusy(""); } };
  if (!d) return <LoadingState />;
  const outcomes = Object.fromEntries(d.competitions.map((c) => [c.competition_id, c]));
  const ready = d.missing.length === 0 && d.competitions.length > 0;
  return (
    <div data-testid="legacy-admin">
      <PageHeader kicker="FSL Legacy · Albo d'oro" title="Chiusura stagione" subtitle="Chiudi ogni competizione (campione, promosse, retrocesse dalla classifica finale), poi archivia la stagione: entra nell'Albo d'oro pubblico e nello storico di ogni società." actions={d.archive ? <div className="flex gap-2"><Link to="/albo-doro" target="_blank" className="btn-gold" data-testid="legacy-open-public"><Trophy className="h-4 w-4" /> Vedi Albo d'oro</Link>{canClose && <button className="btn-ghost text-fsl-danger" disabled={busy === "season"} onClick={reopen} data-testid="legacy-reopen">Riapri stagione</button>}</div> : canClose && <button className="btn-gold" disabled={!ready || busy === "season"} onClick={closeSeason} data-testid="legacy-close-season"><Archive className="h-4 w-4" /> Chiudi stagione e archivia</button>} />
      {d.archive && <div className="fsl-card p-4 mb-6 flex items-center gap-3 border-fsl-success/40" data-testid="legacy-archived-banner"><CheckCircle2 className="h-5 w-5 text-fsl-success" /><div className="text-sm"><b>Stagione archiviata</b> il {fmtDate(d.archive.closed_at)} · {d.archive.competitions.length} competizioni nell'Albo d'oro{d.archive.reason ? ` · ${d.archive.reason}` : ""}</div></div>}
      <div className="grid lg:grid-cols-[1fr_1fr] gap-6">
        <section className="fsl-card p-5" data-testid="legacy-competitions">
          <h2 className="fsl-kicker mb-3">Competizioni</h2>
          <div className="divide-y divide-white/[0.06]">
            {comps.map((c) => { const o = outcomes[c.id]; return (
              <div key={c.id} className="py-3 flex items-center gap-3" data-testid={`legacy-comp-${c.id}`}>
                <div className="flex-1 min-w-0"><div className="font-display font-bold uppercase truncate">{c.name}</div>{o ? <div className="text-xs text-fsl-slate flex items-center gap-2 mt-0.5"><Crest r={o.champion} size="h-5 w-5" /> Campione: <b className="text-fsl-white">{o.champion?.name || "—"}</b>{o.promoted.length > 0 && <span className="text-fsl-success">↑ {o.promoted.length}</span>}{o.relegated.length > 0 && <span className="text-fsl-danger">↓ {o.relegated.length}</span>}</div> : <div className="text-xs text-fsl-slate mt-0.5">Stato: {c.status} · esito non registrato</div>}</div>
                {o ? <span className="inline-flex items-center gap-1 text-xs text-fsl-success font-bold"><Lock className="h-3.5 w-3.5" /> Chiusa</span> : canClose && !d.archive && <button className="btn-ghost h-9" disabled={busy === c.id} onClick={() => closeComp(c)} data-testid={`legacy-close-comp-${c.id}`}>{busy === c.id ? "Chiudo…" : "Chiudi competizione"}</button>}
              </div>); })}
          </div>
          {d.missing.length > 0 && <p className="mt-3 text-xs text-fsl-warning">Per archiviare la stagione chiudi prima: {d.missing.map((m) => m.name).join(", ")}. Servono tutte le gare ufficiali o annullate.</p>}
        </section>
        <section className="space-y-4">
          <div className="fsl-card p-5" data-testid="legacy-totals"><h2 className="fsl-kicker mb-3">Numeri della stagione {d.season_label}</h2><div className="grid grid-cols-3 gap-2">{[["Gare ufficiali", d.totals.matches], ["Gol", d.totals.goals], ["Giocatori", d.totals.players], ["Società", d.totals.clubs], ["Top 11", d.totals.top11], ["Weekly", d.totals.weekly]].map(([l, v]) => <div key={l} className="rounded-xl bg-ink-950/60 border border-white/10 px-3 py-2 text-center"><div className="num font-display font-extrabold text-2xl text-fsl-gold leading-none">{v}</div><div className="text-[9px] uppercase tracking-wider text-fsl-slate mt-1">{l}</div></div>)}</div></div>
          <div><h2 className="fsl-kicker mb-3">Premi individuali (anteprima)</h2><AwardsRow awards={d.awards} compact />{!d.awards.mvp && !d.awards.scorer && <p className="text-sm text-fsl-slate">Nessun premio: servono tabellini ufficiali con voti.</p>}</div>
        </section>
      </div>
    </div>
  );
}
