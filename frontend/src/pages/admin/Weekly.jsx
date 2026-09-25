import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Newspaper, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/fsl/Primitives";
import { EmptyState, LoadingState } from "@/components/fsl/States";
import { WeeklyIssue } from "@/components/fsl/WeeklyIssue";
import { useAuth } from "@/context/AuthContext";
import { api, apiError } from "@/lib/api";

const STATUS = { draft: ["Bozza", "text-fsl-slate"], review: ["In revisione", "text-fsl-warning"], published: ["Pubblicato", "text-fsl-success"], archived: ["Archiviato", "text-fsl-slate"] };

function Editorial({ issue, tid, onSaved, sponsors }) {
  const [f, setF] = useState(issue.editorial);
  useEffect(() => setF(issue.editorial), [issue]);
  const save = async () => { try { const { data } = await api.patch(`/tournaments/${tid}/weekly/${issue.id}`, f); toast.success("Testi salvati"); onSaved(data); } catch (e) { toast.error(apiError(e)); } };
  return (
    <div className="fsl-card p-4 grid md:grid-cols-2 gap-3" data-testid="weekly-editorial">
      <label className="block md:col-span-2"><span className="fsl-label">Titolo</span><input className="fsl-input mt-1" value={f.title || ""} onChange={(e) => setF({ ...f, title: e.target.value })} data-testid="weekly-title-input" /></label>
      <label className="block md:col-span-2"><span className="fsl-label">Editoriale di apertura</span><textarea className="fsl-input mt-1 min-h-[90px]" value={f.intro || ""} onChange={(e) => setF({ ...f, intro: e.target.value })} data-testid="weekly-intro-input" /></label>
      <label className="block"><span className="fsl-label">Nota del Direttore (facoltativa)</span><textarea className="fsl-input mt-1 min-h-[70px]" value={f.note || ""} onChange={(e) => setF({ ...f, note: e.target.value })} data-testid="weekly-note-input" /></label>
      <label className="block"><span className="fsl-label">Sponsor «Presented by»</span>{sponsors?.length ? <select className="fsl-input mt-1" value={f.sponsor || ""} onChange={(e) => setF({ ...f, sponsor: e.target.value })} data-testid="weekly-sponsor-select"><option value="">Nessuno</option>{sponsors.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}</select> : <input className="fsl-input mt-1" placeholder="Nome sponsor (o configura gli sponsor nelle Impostazioni)" value={f.sponsor || ""} onChange={(e) => setF({ ...f, sponsor: e.target.value })} data-testid="weekly-sponsor-input" />}</label>
      <div className="md:col-span-2"><button className="btn-primary h-10" onClick={save} data-testid="weekly-save"><Save className="h-4 w-4" /> Salva testi</button></div>
    </div>
  );
}

export default function WeeklyAdmin() {
  const { tournamentId: tid } = useParams();
  const { user } = useAuth();
  const canPublish = user.is_super_admin || user.role === "director";
  const [comps, setComps] = useState(null);
  const [compId, setCompId] = useState("");
  const [items, setItems] = useState([]);
  const [issue, setIssue] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sponsors, setSponsors] = useState([]);
  const load = useCallback((cid) => api.get(`/tournaments/${tid}/weekly`, { params: { competition_id: cid } }).then((r) => setItems(r.data)), [tid]);
  useEffect(() => { api.get(`/tournaments/${tid}/competitions`).then((r) => { const list = Array.isArray(r.data) ? r.data : r.data.items; setComps(list); if (list[0]) setCompId(list[0].id); }); api.get(`/tournaments/${tid}`).then((r) => setSponsors(r.data.settings?.sponsors || [])).catch(() => null); }, [tid]);
  useEffect(() => { if (compId) { load(compId); setIssue(null); } }, [compId, load]);
  const open = async (id) => { const { data } = await api.get(`/tournaments/${tid}/weekly/${id}`); setIssue(data); };
  const generate = async () => { setBusy(true); try { const { data } = await api.post(`/tournaments/${tid}/weekly/generate`, { competition_id: compId }); toast.success(`${data.length} numeri generati dai dati ufficiali`); await load(compId); if (data[0]) open(data[0].id); } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); } };
  const setStatus = async (status) => { try { const { data } = await api.post(`/tournaments/${tid}/weekly/${issue.id}/status`, { status }); setIssue(data); load(compId); toast.success(status === "published" ? "FSL Weekly pubblicato: pagina pubblica e articolo nel blog aggiornati" : `Stato: ${STATUS[status][0]}`); } catch (e) { toast.error(apiError(e)); } };
  if (!comps) return <LoadingState />;
  const editable = issue && !["published", "archived"].includes(issue.status);
  return (
    <div data-testid="weekly-admin">
      <PageHeader kicker="FSL Weekly · Il giornale della giornata" title="FSL Weekly" subtitle="Generato automaticamente da risultati ufficiali, classifica, Top 11 pubblicata, MVP e prossimo turno. Testi editoriali modificabili, approvazione e pubblicazione del Direttore." actions={<div className="flex gap-2 items-center"><select className="fsl-input h-11 w-64" value={compId} onChange={(e) => setCompId(e.target.value)} data-testid="weekly-competition-select">{comps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><button className="btn-primary" disabled={busy || !compId} onClick={generate} data-testid="weekly-generate"><Sparkles className="h-4 w-4" /> {busy ? "Genero…" : "Genera numeri"}</button></div>} />
      <div className="grid lg:grid-cols-[260px_minmax(0,1fr)] gap-6">
        <aside className="fsl-card p-3 space-y-1 self-start" data-testid="weekly-list">
          {items.length === 0 ? <p className="p-3 text-sm text-fsl-slate">Nessun numero: premi «Genera numeri» dopo le gare ufficiali.</p> : items.map((it) => <button key={it.id} onClick={() => open(it.id)} className={`w-full text-left h-12 px-3 rounded-md flex items-center justify-between text-sm ${issue?.id === it.id ? "bg-fsl-blue/20 text-fsl-white" : "hover:bg-white/5 text-fsl-white/85"}`} data-testid={`weekly-item-${it.match_day}`}><span className="font-display font-bold uppercase">Giornata {it.match_day}</span><span className={`text-xs ${STATUS[it.status][1]}`}>{STATUS[it.status][0]}</span></button>)}
        </aside>
        <section className="space-y-5">
          {!issue ? <EmptyState icon={Newspaper} title="Seleziona un numero" description="Il giornale della giornata compare qui: correggi i testi, manda in revisione e pubblica." /> : (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm"><span className={`font-bold ${STATUS[issue.status][1]}`} data-testid="weekly-status">{STATUS[issue.status][0]}</span><span className="text-fsl-slate">· {issue.content?.results?.length || 0} gare · {issue.content?.top11 ? "Top 11 inclusa" : "Top 11 non ancora pubblicata"}</span>
                <div className="ml-auto flex flex-wrap gap-2">
                  {issue.status === "draft" && <button className="btn-ghost h-9" onClick={() => setStatus("review")} data-testid="weekly-to-review">Manda in revisione</button>}
                  {issue.status === "review" && <button className="btn-ghost h-9" onClick={() => setStatus("draft")} data-testid="weekly-to-draft">Torna in bozza</button>}
                  {issue.status === "review" && canPublish && <button className="btn-gold h-9" onClick={() => setStatus("published")} data-testid="weekly-publish"><Newspaper className="h-4 w-4" /> Approva e pubblica</button>}
                  {issue.status !== "archived" && canPublish && <button className="btn-ghost h-9 text-fsl-danger" onClick={() => window.confirm("Archiviare questo numero? L'articolo nel blog verrà ritirato.") && setStatus("archived")} data-testid="weekly-archive">Archivia</button>}
                </div></div>
              {editable && <Editorial issue={issue} tid={tid} onSaved={setIssue} sponsors={sponsors} />}
              <WeeklyIssue issue={issue} matchTo={(mid) => `/admin/t/${tid}/partite/${mid}`} />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
