import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart3, CheckCircle2, Clock, Download, ExternalLink, FileSpreadsheet, Plus, Trash2, Upload, Users } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, apiError } from "@/lib/api";
import { fmtDate } from "@/lib/format";

const EMPTY = { category: "", name: "", birth_year: "", level: "", description: "" };

async function downloadTemplate(tid, teamId) {
  const r = await api.get(`/tournaments/${tid}/roster-imports/template`, { params: { team_id: teamId }, responseType: "blob" });
  const name = (r.headers["content-disposition"] || "").match(/filename="([^"]+)"/)?.[1] || "FSL_Modulo_Rosa.xlsx";
  const a = document.createElement("a"); a.href = URL.createObjectURL(r.data); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

function RosterBadge({ g }) {
  const imp = g.roster_import;
  if (imp?.status === "submitted") return <span className="h-6 px-2 rounded text-[10px] font-bold uppercase inline-flex items-center gap-1 bg-fsl-warning text-ink-950" data-testid={`group-roster-${g.id}`}><Clock className="h-3 w-3" /> Modulo inviato · {imp.rows}</span>;
  if (g.players_count > 0) return <span className="h-6 px-2 rounded text-[10px] font-bold uppercase inline-flex items-center gap-1 bg-fsl-success text-ink-950" data-testid={`group-roster-${g.id}`}><CheckCircle2 className="h-3 w-3" /> Rosa confermata · {g.players_count}</span>;
  if (imp?.status === "rejected") return <span className="h-6 px-2 rounded text-[10px] font-bold uppercase inline-flex items-center bg-fsl-danger text-fsl-white" data-testid={`group-roster-${g.id}`}>Modulo respinto</span>;
  return <span className="h-6 px-2 rounded text-[10px] font-bold uppercase inline-flex items-center border border-white/15 text-fsl-slate" data-testid={`group-roster-${g.id}`}>Nessuna rosa</span>;
}

function GroupCard({ tid, g, onChanged }) {
  const [busy, setBusy] = useState(false);
  const pending = g.status === "pending";
  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    const fd = new FormData(); fd.append("team_id", g.id); fd.append("file", file);
    try { const r = await api.post(`/tournaments/${tid}/roster-imports`, fd, { headers: { "Content-Type": "multipart/form-data" } }); toast.success(`Modulo inviato: ${r.data.rows.length} giocatori in attesa di conferma${pending ? " (insieme al gruppo)" : ""}`); onChanged(); } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  const remove = () => window.confirm(`Eliminare il gruppo «${g.name}» in attesa di conferma?`) && api.delete(`/tournaments/${tid}/club-groups/${g.id}`).then(() => { toast.success("Gruppo eliminato"); onChanged(); }).catch((e) => toast.error(apiError(e)));
  const meta = [g.birth_year && `Anno ${g.birth_year}`, g.level, g.competition_name].filter(Boolean).join(" · ");
  return (
    <div className={`fsl-card p-4 flex flex-col gap-3 ${pending ? "border-dashed border-fsl-warning/40" : ""}`} data-testid={`club-group-${g.id}`}>
      <div className="flex items-start gap-3">
        <div className="font-display font-extrabold text-3xl num text-fsl-gold leading-none">{g.category}</div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate">{g.name}</div>
          <div className="text-xs text-fsl-slate truncate">{meta || "Gruppo da assegnare al girone"}</div>
        </div>
        <span className={`h-6 px-2 rounded text-[10px] font-bold uppercase inline-flex items-center shrink-0 ${pending ? "bg-fsl-warning/20 text-fsl-warning border border-fsl-warning/40" : "bg-white/10 text-fsl-white"}`} data-testid={`group-status-${g.id}`}>{pending ? "In attesa di conferma" : "Confermato"}</span>
      </div>
      {g.description && <p className="text-xs text-fsl-slate line-clamp-2">{g.description}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <RosterBadge g={g} />
        {g.roster_import?.status === "rejected" && g.roster_import.note && <span className="text-[11px] text-fsl-slate truncate">Motivo: {g.roster_import.note}</span>}
        {g.roster_import && <span className="ml-auto text-[10px] text-fsl-slate num">{fmtDate(g.roster_import.created_at)}</span>}
      </div>
      <div className="flex flex-wrap gap-2 mt-auto">
        <button className="btn-ghost h-9 text-xs" onClick={() => downloadTemplate(tid, g.id).catch((e) => toast.error(apiError(e)))} data-testid={`group-template-${g.id}`}><Download className="h-3.5 w-3.5" /> Scarica modulo</button>
        <label className={`btn-gold h-9 text-xs cursor-pointer ${busy || g.roster_import?.status === "submitted" ? "opacity-60 pointer-events-none" : ""}`} data-testid={`group-upload-${g.id}`}><Upload className="h-3.5 w-3.5" /> {busy ? "Invio…" : "Carica rosa"}<input type="file" accept=".xlsx" className="hidden" onChange={(e) => { upload(e.target.files[0]); e.target.value = ""; }} data-testid={`group-upload-input-${g.id}`} /></label>
        {g.players_count > 0 && <Link to="/societa/rose" className="btn-ghost h-9 text-xs" data-testid={`group-roster-link-${g.id}`}><Users className="h-3.5 w-3.5" /> Rosa</Link>}
        {pending && g.players_count === 0 && <button className="btn-ghost h-9 text-xs text-fsl-danger ml-auto" onClick={remove} data-testid={`group-delete-${g.id}`}><Trash2 className="h-3.5 w-3.5" /></button>}
      </div>
    </div>
  );
}

function AddGroupDialog({ categories, levels, onClose, onDone }) {
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      await api.post("/me/club/groups", { ...f, birth_year: f.birth_year === "" ? null : Number(f.birth_year) });
      toast.success("Gruppo salvato: l'organizzazione lo inviterà a un torneo e potrai caricare la rosa."); onDone();
    } catch (err) { toast.error(apiError(err)); } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-navy-800 border-white/20 text-fsl-white rounded-xl max-w-lg" aria-describedby={undefined} data-testid="add-group-dialog">
        <DialogHeader><DialogTitle className="font-display uppercase text-2xl">Aggiungi gruppo</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3" data-testid="add-group-form">
          <p className="text-xs text-fsl-slate">Indica categoria, anno e livello dei ragazzi. Il gruppo resta «in attesa di invito» finché l'organizzazione non lo iscrive a un torneo: da quel momento potrai scaricare il modulo rosa e caricarlo.</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="fsl-label">Categoria *</span><input className="fsl-input mt-1" required list="group-categories" placeholder="es. 2014, Pulcini, Esordienti" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} data-testid="add-group-category" /><datalist id="group-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist></label>
            <label className="block"><span className="fsl-label">Anno di nascita</span><input type="number" min="1990" max="2030" className="fsl-input mt-1 num" placeholder="es. 2014" value={f.birth_year} onChange={(e) => setF({ ...f, birth_year: e.target.value })} data-testid="add-group-year" /></label>
            <label className="block"><span className="fsl-label">Livello</span><select className="fsl-input mt-1" value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })} data-testid="add-group-level">{levels.map((l) => <option key={l} value={l}>{l || "—"}</option>)}</select></label>
            <label className="block"><span className="fsl-label">Nome squadra</span><input className="fsl-input mt-1" placeholder="es. Rossi 2014 Blu (facoltativo)" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="add-group-name" /></label>
          </div>
          <label className="block"><span className="fsl-label">Descrizione</span><textarea rows={3} className="fsl-input mt-1 h-auto py-2" placeholder="Allenatore, note organizzative, esigenze particolari…" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} data-testid="add-group-description" /></label>
          <DialogFooter><button type="button" className="btn-ghost" onClick={onClose}>Annulla</button><button className="btn-gold" disabled={busy || !f.category} data-testid="add-group-submit"><Plus className="h-4 w-4" /> Salva gruppo</button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TournamentBlock({ block, onChanged }) {
  const { tournament: t, groups } = block;
  return (
    <section className="space-y-3" data-testid={`club-groups-${t.id}`}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0"><div className="fsl-kicker">Torneo</div><h3 className="font-display font-extrabold uppercase text-xl leading-none truncate">{t.name}</h3></div>
        <Link to={`/tornei/${t.slug}`} className="btn-ghost h-9 text-xs ml-auto" data-testid={`club-groups-public-${t.id}`}><BarChart3 className="h-3.5 w-3.5" /> Classifiche, marcatori e blog <ExternalLink className="h-3 w-3" /></Link>
      </div>
      {groups.length === 0 ? (
        <div className="fsl-card p-6 text-sm text-fsl-slate" data-testid={`club-groups-empty-${t.id}`}>Nessun gruppo ancora iscritto a questo torneo.</div>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">{groups.map((g) => <GroupCard key={g.id} tid={t.id} g={g} onChanged={onChanged} />)}</div>
      )}
    </section>
  );
}

function PendingGroupCard({ g, onChanged }) {
  const remove = () => window.confirm(`Eliminare il gruppo «${g.name || g.category}»?`) && api.delete(`/me/club/groups/${g.id}`).then(() => { toast.success("Gruppo eliminato"); onChanged(); }).catch((e) => toast.error(apiError(e)));
  const meta = [g.birth_year && `Anno ${g.birth_year}`, g.level].filter(Boolean).join(" · ");
  return (
    <div className="fsl-card p-4 border-dashed border-fsl-warning/40 flex flex-col gap-3" data-testid={`pending-group-${g.id}`}>
      <div className="flex items-start gap-3">
        <div className="font-display font-extrabold text-3xl num text-fsl-gold leading-none">{g.category}</div>
        <div className="min-w-0 flex-1"><div className="text-sm font-semibold truncate">{g.name}</div><div className="text-xs text-fsl-slate truncate">{meta || "—"}</div></div>
        <span className="h-6 px-2 rounded text-[10px] font-bold uppercase inline-flex items-center shrink-0 bg-fsl-warning/20 text-fsl-warning border border-fsl-warning/40" data-testid={`pending-group-status-${g.id}`}><Clock className="h-3 w-3 mr-1" /> In attesa di invito</span>
      </div>
      {g.description && <p className="text-xs text-fsl-slate line-clamp-2">{g.description}</p>}
      <div className="flex items-center gap-2 mt-auto text-xs text-fsl-slate"><span className="flex-1">Il modulo rosa si sblocca quando l'organizzazione invita il gruppo a un torneo.</span><button className="btn-ghost h-9 text-xs text-fsl-danger" onClick={remove} data-testid={`pending-group-delete-${g.id}`}><Trash2 className="h-3.5 w-3.5" /></button></div>
    </div>
  );
}

export function ClubGroups({ onLoaded }) {
  const [data, setData] = useState(null);
  const [adding, setAdding] = useState(false);
  const loadedRef = useRef(onLoaded);
  loadedRef.current = onLoaded;
  const load = useCallback(() => api.get("/me/club/overview").then((r) => { setData(r.data); loadedRef.current?.(r.data); }).catch(() => setData({ org: null, pending_groups: [], tournaments: [], levels: [""] })), []);
  useEffect(() => { load(); }, [load]);
  if (!data) return null;
  const categories = Array.from(new Set(data.tournaments.flatMap((b) => b.tournament.categories || [])));
  const pending = data.pending_groups || [];
  return (
    <div className="space-y-8" data-testid="club-groups">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="fsl-section-title flex items-center gap-2"><Users className="h-5 w-5 text-fsl-gold" /> I nostri gruppi</h2>
        {pending.length > 0 && <span className="h-6 px-2 rounded-full bg-fsl-warning text-ink-950 text-xs font-bold num inline-flex items-center" data-testid="pending-groups-count">{pending.length} in attesa</span>}
        <div className="ml-auto flex items-center gap-3">
          {data.tournaments.length > 0 && <Link to="/societa/rose" className="text-xs text-fsl-gold hover:underline" data-testid="club-groups-go-rose">Vai alle rose →</Link>}
          <button className="btn-gold h-10" onClick={() => setAdding(true)} data-testid="club-groups-add"><Plus className="h-4 w-4" /> Aggiungi gruppo</button>
        </div>
      </div>
      {pending.length === 0 && data.tournaments.length === 0 && (
        <div className="fsl-card-gold p-6 flex flex-wrap items-center gap-4" data-testid="club-groups-empty"><FileSpreadsheet className="h-8 w-8 text-fsl-gold shrink-0" /><div className="flex-1 min-w-[220px]"><div className="font-display font-bold uppercase">Nessun gruppo ancora</div><p className="text-xs text-fsl-slate">Aggiungi i gruppi (categoria, anno, livello) della tua società: l'organizzazione li inviterà ai tornei e per ognuno potrai scaricare il modulo rosa Excel e caricarlo compilato.</p></div></div>
      )}
      {pending.length > 0 && (
        <section className="space-y-3" data-testid="club-groups-pending">
          <div className="fsl-kicker">In attesa di invito a un torneo</div>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">{pending.map((g) => <PendingGroupCard key={g.id} g={g} onChanged={load} />)}</div>
        </section>
      )}
      {data.tournaments.map((b) => <TournamentBlock key={b.tournament.id} block={b} onChanged={load} />)}
      {adding && <AddGroupDialog categories={categories} levels={data.levels || [""]} onClose={() => setAdding(false)} onDone={() => { setAdding(false); load(); }} />}
    </div>
  );
}
