import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Sparkles, Trophy } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/fsl/Primitives";
import { EmptyState, LoadingState } from "@/components/fsl/States";
import { DownloadTop11, Top11Board } from "@/components/fsl/Top11Board";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/context/AuthContext";
import { api, apiError } from "@/lib/api";

const STATUS = { draft: ["Bozza", "text-fsl-slate"], review: ["In revisione", "text-fsl-warning"], published: ["Pubblicata", "text-fsl-success"], archived: ["Archiviata", "text-fsl-slate"] };

function ReplaceDialog({ doc, slot, onClose, onDone, tid }) {
  const [pid, setPid] = useState("");
  const [reason, setReason] = useState("");
  const inLineup = new Set(doc.lineup.filter((s) => s.player).map((s) => s.player.player_id));
  const opts = doc.candidates.filter((c) => !inLineup.has(c.player_id));
  const submit = async (e) => { e.preventDefault(); try { const { data } = await api.post(`/tournaments/${tid}/top11/${doc.id}/replace`, { slot: slot.slot, player_id: pid, reason }); toast.success("Sostituzione registrata nell'audit"); onDone(data); } catch (err) { toast.error(apiError(err)); } };
  return (
    <Dialog open onOpenChange={onClose}><DialogContent className="bg-navy-800 border-white/20 text-fsl-white rounded-xl" aria-describedby={undefined} data-testid="top11-replace-dialog">
      <DialogHeader><DialogTitle className="font-display uppercase text-2xl">Sostituisci · slot {slot.slot} ({slot.slot_label})</DialogTitle></DialogHeader>
      <p className="text-sm text-fsl-slate">Attuale: <strong className="text-fsl-white">{slot.player?.name || "vuoto"}</strong>. Solo giocatori presenti nei tabellini ufficiali della giornata; il ruolo mostrato resta quello reale.</p>
      <form onSubmit={submit} className="space-y-3">
        <select required className="fsl-input" value={pid} onChange={(e) => setPid(e.target.value)} data-testid="top11-replace-select"><option value="">Scegli il giocatore…</option>{opts.map((c) => <option key={c.player_id} value={c.player_id}>{c.name} · {c.team} · {c.role} · {Number(c.fanta).toFixed(1)}</option>)}</select>
        <input required minLength={5} className="fsl-input" placeholder="Motivazione (obbligatoria, finisce nell'audit)" value={reason} onChange={(e) => setReason(e.target.value)} data-testid="top11-replace-reason" />
        <button className="btn-primary w-full" data-testid="top11-replace-submit">Conferma sostituzione</button>
      </form>
    </DialogContent></Dialog>
  );
}

export default function Top11Admin() {
  const { tournamentId: tid } = useParams();
  const { user } = useAuth();
  const canPublish = user.is_super_admin || user.role === "director";
  const [comps, setComps] = useState(null);
  const [compId, setCompId] = useState("");
  const [items, setItems] = useState([]);
  const [doc, setDoc] = useState(null);
  const [slot, setSlot] = useState(null);
  const [sponsor, setSponsor] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback((cid) => api.get(`/tournaments/${tid}/top11`, { params: { competition_id: cid } }).then((r) => setItems(r.data)), [tid]);
  useEffect(() => { api.get(`/tournaments/${tid}/competitions`).then((r) => { const list = Array.isArray(r.data) ? r.data : r.data.items; setComps(list); if (list[0]) setCompId(list[0].id); }); }, [tid]);
  useEffect(() => { if (compId) { load(compId); setDoc(null); } }, [compId, load]);
  const comp = comps?.find((c) => c.id === compId);
  const open = async (id) => { const { data } = await api.get(`/tournaments/${tid}/top11/${id}`); setDoc(data); setSponsor(data.sponsor || ""); };
  const generate = async () => { setBusy(true); try { const { data } = await api.post(`/tournaments/${tid}/top11/generate`, { competition_id: compId }); toast.success(`${data.length} giornate elaborate dai tabellini ufficiali`); await load(compId); if (data[0]) open(data[0].id); } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); } };
  const setStatus = async (status) => { try { const { data } = await api.post(`/tournaments/${tid}/top11/${doc.id}/status`, { status, sponsor }); setDoc(data); load(compId); toast.success(status === "published" ? "Top 11 pubblicata: badge assegnati ai giocatori" : `Stato: ${STATUS[status][0]}`); } catch (e) { toast.error(apiError(e)); } };
  if (!comps) return <LoadingState />;
  const editable = doc && !["published", "archived"].includes(doc.status);
  return (
    <div data-testid="top11-admin">
      <PageHeader kicker="FSL Weekly · Formazione ideale" title="Top 11 della giornata" subtitle="Selezione automatica dai tabellini ufficiali con il fantavoto FSL (4-3-3). Anteprima, sostituzioni motivate, approvazione e pubblicazione." actions={<div className="flex gap-2 items-center"><select className="fsl-input h-11 w-64" value={compId} onChange={(e) => setCompId(e.target.value)} data-testid="top11-competition-select">{comps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><button className="btn-primary" disabled={busy || !compId} onClick={generate} data-testid="top11-generate"><Sparkles className="h-4 w-4" /> {busy ? "Elaboro…" : "Elabora giornate"}</button></div>} />
      <div className="grid lg:grid-cols-[280px_minmax(0,1fr)] gap-6">
        <aside className="fsl-card p-3 space-y-1 self-start" data-testid="top11-list">
          {items.length === 0 ? <p className="p-3 text-sm text-fsl-slate">Nessuna giornata elaborata: premi «Elabora giornate».</p> : items.map((it) => <button key={it.id} onClick={() => open(it.id)} className={`w-full text-left h-12 px-3 rounded-md flex items-center justify-between text-sm ${doc?.id === it.id ? "bg-fsl-blue/20 text-fsl-white" : "hover:bg-white/5 text-fsl-white/85"}`} data-testid={`top11-item-${it.match_day}`}><span className="font-display font-bold uppercase">Giornata {it.match_day}</span><span className={`text-xs ${STATUS[it.status][1]}`}>{STATUS[it.status][0]}</span></button>)}
        </aside>
        <section className="space-y-4">
          {!doc ? <EmptyState icon={Trophy} title="Seleziona una giornata" description="La formazione compare qui: clicca un giocatore per aprire la scheda, usa «Sostituisci» sotto la card prima della pubblicazione." /> : (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm"><span className={`font-bold ${STATUS[doc.status][1]}`} data-testid="top11-status">{STATUS[doc.status][0]}</span><span className="text-fsl-slate">· {doc.match_ids?.length || 0} gare ufficiali · {doc.lineup.filter((s) => s.off_role).length} fuori ruolo · {doc.changes?.length || 0} sostituzioni</span>
                <div className="ml-auto flex flex-wrap gap-2">
                  {doc.status === "draft" && <button className="btn-ghost h-9" onClick={() => setStatus("review")} data-testid="top11-to-review">Manda in revisione</button>}
                  {doc.status === "review" && <button className="btn-ghost h-9" onClick={() => setStatus("draft")} data-testid="top11-to-draft">Torna in bozza</button>}
                  {doc.status === "review" && canPublish && <button className="btn-gold h-9" onClick={() => setStatus("published")} data-testid="top11-publish"><Trophy className="h-4 w-4" /> Approva e pubblica</button>}
                  {doc.status !== "archived" && canPublish && <button className="btn-ghost h-9 text-fsl-danger" onClick={() => window.confirm("Archiviare questa Top 11?") && setStatus("archived")} data-testid="top11-archive">Archivia</button>}
                </div></div>
              {editable && <input className="fsl-input h-10 max-w-sm" placeholder="Sponsor (es. Presented by …)" value={sponsor} onChange={(e) => setSponsor(e.target.value)} data-testid="top11-sponsor" />}
              <Top11Board doc={doc} competition={comp} editable={editable} onPick={setSlot} linkTo={(p) => `/admin/t/${tid}/giocatori/${p.player_id}`} />
              <DownloadTop11 doc={doc} competition={comp} />
              {doc.changes?.length > 0 && <div className="fsl-card p-4 text-xs text-fsl-slate space-y-1" data-testid="top11-changes">{doc.changes.map((c, i) => <div key={i}>Slot {c.slot}: <span className="text-fsl-white">{c.out_name || "vuoto"} → {c.in_name}</span> · {c.reason}</div>)}</div>}
            </>
          )}
        </section>
      </div>
      {slot && doc && <ReplaceDialog doc={doc} slot={slot} tid={tid} onClose={() => setSlot(null)} onDone={(d) => { setDoc(d); setSlot(null); }} />}
    </div>
  );
}
