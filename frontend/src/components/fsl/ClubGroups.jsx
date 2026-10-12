import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart3, Camera, CheckCircle2, Clock, Download, ExternalLink, FileSpreadsheet, Plus, Trash2, Upload, Users } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, apiError } from "@/lib/api";
import { fmtDate } from "@/lib/format";

const EMPTY = { category: "", name: "", birth_year: "", level: "", description: "", requested_tournament_id: "", request_note: "" };

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
  const upload = async (file, fromImage = false) => {
    if (!file) return;
    setBusy(fromImage ? "image" : "xlsx");
    const fd = new FormData(); fd.append("team_id", g.id); fd.append("file", file);
    try { const r = await api.post(`/tournaments/${tid}/roster-imports${fromImage ? "/from-image" : ""}`, fd, { headers: { "Content-Type": "multipart/form-data" }, timeout: 120000 }); toast.success(`${fromImage ? "Rosa letta dall'immagine" : "Modulo inviato"}: ${r.data.rows.length} giocatori in attesa di conferma${pending ? " (insieme al gruppo)" : ""}`); onChanged(); } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
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
        <button className="btn-ghost h-9 text-xs border-fsl-gold/60 text-fsl-gold hover:bg-fsl-gold/10" onClick={() => downloadTemplate(tid, g.id).catch((e) => toast.error(apiError(e)))} data-testid={`group-template-${g.id}`}><Download className="h-3.5 w-3.5" /> Scarica modulo rosa</button>
        <label className={`btn-gold h-9 text-xs cursor-pointer ${busy || g.roster_import?.status === "submitted" ? "opacity-60 pointer-events-none" : ""}`} data-testid={`group-upload-${g.id}`}><Upload className="h-3.5 w-3.5" /> {busy === "xlsx" ? "Invio…" : "Carica rosa"}<input type="file" accept=".xlsx" className="hidden" onChange={(e) => { upload(e.target.files[0]); e.target.value = ""; }} data-testid={`group-upload-input-${g.id}`} /></label>
        <label className={`btn-primary h-9 text-xs cursor-pointer ${busy || g.roster_import?.status === "submitted" ? "opacity-60 pointer-events-none" : ""}`} title="Foto, screenshot WhatsApp o PDF della lista: la leggiamo in automatico, poi l'organizzazione la conferma" data-testid={`group-photo-${g.id}`}><Camera className="h-3.5 w-3.5" /> {busy === "image" ? "Leggo…" : "Da foto"}<input type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => { upload(e.target.files[0], true); e.target.value = ""; }} data-testid={`group-photo-input-${g.id}`} /></label>
        {g.players_count > 0 && <Link to="/societa/rose" className="btn-ghost h-9 text-xs" data-testid={`group-roster-link-${g.id}`}><Users className="h-3.5 w-3.5" /> Rosa</Link>}
        {pending && g.players_count === 0 && <button className="btn-ghost h-9 text-xs text-fsl-danger ml-auto" onClick={remove} data-testid={`group-delete-${g.id}`}><Trash2 className="h-3.5 w-3.5" /></button>}
      </div>
    </div>
  );
}

function AddGroupDialog({ categories, levels, onClose, onDone, initialTournament = "" }) {
  const [f, setF] = useState({ ...EMPTY, requested_tournament_id: initialTournament });
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState([]);
  useEffect(() => { api.get("/public/tournaments").then((r) => setOpen(r.data.filter((t) => t.status !== "archived"))).catch(() => {}); }, []);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      await api.post("/me/club/groups", { ...f, birth_year: f.birth_year === "" ? null : Number(f.birth_year), requested_tournament_id: f.requested_tournament_id || null });
      toast.success(f.requested_tournament_id ? "Richiesta inviata: l'organizzazione approverà l'invito al torneo." : "Gruppo salvato: potrai caricare la rosa subito; l'organizzazione lo inviterà a un torneo."); onDone();
    } catch (err) { toast.error(apiError(err)); } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-navy-800 border-white/20 text-fsl-white rounded-xl max-w-lg" aria-describedby={undefined} data-testid="add-group-dialog">
        <DialogHeader><DialogTitle className="font-display uppercase text-2xl">{initialTournament ? "Richiedi partecipazione" : "Aggiungi squadra"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3" data-testid="add-group-form">
          <p className="text-xs text-fsl-slate">Indica categoria, anno e livello dei ragazzi. Puoi caricare la rosa da subito e, se vuoi, chiedere l'invito a un torneo già pubblicato: l'organizzazione approva e il gruppo entra in gara.</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="fsl-label">Categoria *</span><input className="fsl-input mt-1" required list="group-categories" placeholder="es. 2014, Pulcini, Esordienti" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} data-testid="add-group-category" /><datalist id="group-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist></label>
            <label className="block"><span className="fsl-label">Anno di nascita</span><input type="number" min="1990" max="2030" className="fsl-input mt-1 num" placeholder="es. 2014" value={f.birth_year} onChange={(e) => setF({ ...f, birth_year: e.target.value })} data-testid="add-group-year" /></label>
            <label className="block"><span className="fsl-label">Livello</span><select className="fsl-input mt-1" value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })} data-testid="add-group-level">{levels.map((l) => <option key={l} value={l}>{l || "—"}</option>)}</select></label>
            <label className="block"><span className="fsl-label">Nome squadra</span><input className="fsl-input mt-1" placeholder="es. Rossi 2014 Blu (facoltativo)" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="add-group-name" /></label>
          </div>
          <label className="block"><span className="fsl-label">Descrizione</span><textarea rows={3} className="fsl-input mt-1 h-auto py-2" placeholder="Allenatore, note organizzative, esigenze particolari…" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} data-testid="add-group-description" /></label>
          <div className="rounded-lg border border-fsl-gold/30 bg-ink-950/40 p-3 space-y-2">
            <label className="block"><span className="fsl-label">Chiedi l'invito a un torneo (facoltativo)</span><select className="fsl-input mt-1" value={f.requested_tournament_id} onChange={(e) => setF({ ...f, requested_tournament_id: e.target.value })} data-testid="add-group-tournament"><option value="">Nessuno: in attesa di una competizione per questa categoria</option>{open.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
            {f.requested_tournament_id && <input className="fsl-input" placeholder="Nota per l'organizzazione (facoltativa)" value={f.request_note} onChange={(e) => setF({ ...f, request_note: e.target.value })} data-testid="add-group-request-note" />}
          </div>
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
      {groups.some((g) => g.players_count === 0 && g.roster_import?.status !== "submitted") && <p className="text-xs text-fsl-slate flex items-center gap-2" data-testid={`club-groups-howto-${t.id}`}><FileSpreadsheet className="h-4 w-4 text-fsl-gold shrink-0" /> Per ogni gruppo: <strong className="text-fsl-white">1</strong> Scarica modulo rosa (Excel) · <strong className="text-fsl-white">2</strong> compilalo con i tuoi giocatori · <strong className="text-fsl-white">3</strong> Carica rosa. L'organizzazione conferma e nascono le home dei giocatori.</p>}
      {groups.length === 0 ? (
        <div className="fsl-card p-6 text-sm text-fsl-slate" data-testid={`club-groups-empty-${t.id}`}>Nessun gruppo ancora iscritto a questo torneo.</div>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">{groups.map((g) => <GroupCard key={g.id} tid={t.id} g={g} onChanged={onChanged} />)}</div>
      )}
    </section>
  );
}

async function downloadOrgTemplate(g) {
  const r = await api.get(`/me/club/groups/${g.id}/template`, { responseType: "blob" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(r.data); a.download = `FSL_Modulo_Rosa_${(g.name || g.category).replace(/\s+/g, "_")}.xlsx`; a.click(); URL.revokeObjectURL(a.href);
}

function PendingGroupCard({ g, onChanged }) {
  const [busy, setBusy] = useState(false);
  const remove = () => window.confirm(`Eliminare il gruppo «${g.name || g.category}»?`) && api.delete(`/me/club/groups/${g.id}`).then(() => { toast.success("Gruppo eliminato"); onChanged(); }).catch((e) => toast.error(apiError(e)));
  const upload = async (file, kind) => {
    if (!file) return;
    setBusy(kind);
    const fd = new FormData(); fd.append("file", file);
    try { const r = await api.post(`/me/club/groups/${g.id}/roster`, fd, { headers: { "Content-Type": "multipart/form-data" }, timeout: 120000 }); toast.success(`Rosa salvata: ${r.data.roster.rows} giocatori${r.data.roster.errors ? `, ${r.data.roster.errors} da controllare` : ""}. Sarà confermata dall'organizzazione all'invito.`); onChanged(); } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  const [open, setOpen] = useState([]);
  useEffect(() => { api.get("/public/tournaments").then((r) => setOpen(r.data.filter((t) => t.status !== "archived"))).catch(() => {}); }, []);
  const request = async (tournament_id) => {
    try { await api.post(`/me/club/groups/${g.id}/request`, { tournament_id: tournament_id || null, note: "" }); toast.success(tournament_id ? "Richiesta inviata all'organizzazione" : "Richiesta ritirata"); onChanged(); } catch (e) { toast.error(apiError(e)); }
  };
  const meta = [g.birth_year && `Anno ${g.birth_year}`, g.level].filter(Boolean).join(" · ");
  return (
    <div className="fsl-card p-4 border-dashed border-fsl-warning/40 flex flex-col gap-3" data-testid={`pending-group-${g.id}`}>
      <div className="flex items-start gap-3">
        <div className="font-display font-extrabold text-3xl num text-fsl-gold leading-none">{g.category}</div>
        <div className="min-w-0 flex-1"><div className="text-sm font-semibold truncate">{g.name}</div><div className="text-xs text-fsl-slate truncate">{meta || "—"}</div></div>
        <span className="h-6 px-2 rounded text-[10px] font-bold uppercase inline-flex items-center shrink-0 bg-fsl-warning/20 text-fsl-warning border border-fsl-warning/40" data-testid={`pending-group-status-${g.id}`}><Clock className="h-3 w-3 mr-1" /> In attesa di invito</span>
      </div>
      {g.description && <p className="text-xs text-fsl-slate line-clamp-2">{g.description}</p>}
      {g.requested_tournament_name ? <div className="text-xs text-fsl-gold flex items-center gap-2" data-testid={`pending-group-requested-${g.id}`}><span>Richiesta per <strong>{g.requested_tournament_name}</strong> · in approvazione</span><button className="text-fsl-slate hover:text-fsl-white underline" onClick={() => request("")} data-testid={`pending-group-unrequest-${g.id}`}>ritira</button></div>
        : <label className="block text-xs"><span className="fsl-label">Partecipa a un torneo</span><select className="fsl-input h-9 mt-1" value="" onChange={(e) => e.target.value && request(e.target.value)} data-testid={`pending-group-request-${g.id}`}><option value="">Scegli il torneo e invia la richiesta…</option>{open.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>}
      <div className="flex flex-wrap items-center gap-2">
        {g.roster ? <span className="h-6 px-2 rounded text-[10px] font-bold uppercase inline-flex items-center gap-1 bg-fsl-success text-ink-950" data-testid={`pending-group-roster-${g.id}`}><CheckCircle2 className="h-3 w-3" /> Rosa pronta · {g.roster.rows}{g.roster.errors ? ` (${g.roster.errors} da controllare)` : ""}</span> : <span className="h-6 px-2 rounded text-[10px] font-bold uppercase inline-flex items-center border border-white/15 text-fsl-slate" data-testid={`pending-group-roster-${g.id}`}>Nessuna rosa</span>}
      </div>
      <div className="flex flex-wrap gap-2 mt-auto">
        <button className="btn-ghost h-9 text-xs border-fsl-gold/60 text-fsl-gold hover:bg-fsl-gold/10" onClick={() => downloadOrgTemplate(g).catch((e) => toast.error(apiError(e)))} data-testid={`pending-group-template-${g.id}`}><Download className="h-3.5 w-3.5" /> Modulo rosa</button>
        <label className={`btn-gold h-9 text-xs cursor-pointer ${busy ? "opacity-60 pointer-events-none" : ""}`} data-testid={`pending-group-upload-${g.id}`}><Upload className="h-3.5 w-3.5" /> {busy === "xlsx" ? "Invio…" : "Carica Excel"}<input type="file" accept=".xlsx" className="hidden" onChange={(e) => { upload(e.target.files[0], "xlsx"); e.target.value = ""; }} data-testid={`pending-group-upload-input-${g.id}`} /></label>
        <label className={`btn-primary h-9 text-xs cursor-pointer ${busy ? "opacity-60 pointer-events-none" : ""}`} title="Foto, screenshot WhatsApp o PDF: la leggiamo in automatico" data-testid={`pending-group-photo-${g.id}`}><Camera className="h-3.5 w-3.5" /> {busy === "image" ? "Leggo…" : "Da foto"}<input type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => { upload(e.target.files[0], "image"); e.target.value = ""; }} data-testid={`pending-group-photo-input-${g.id}`} /></label>
        <button className="btn-ghost h-9 text-xs text-fsl-danger ml-auto" onClick={remove} data-testid={`pending-group-delete-${g.id}`}><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  );
}

export function ClubGroups({ onLoaded, requestTournamentId = "" }) {
  const [data, setData] = useState(null);
  const [adding, setAdding] = useState(!!requestTournamentId);
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
        <h2 className="fsl-section-title flex items-center gap-2"><Users className="h-5 w-5 text-fsl-gold" /> Le nostre squadre</h2>
        {pending.length > 0 && <span className="h-6 px-2 rounded-full bg-fsl-warning text-ink-950 text-xs font-bold num inline-flex items-center" data-testid="pending-groups-count">{pending.length} in attesa</span>}
        <div className="ml-auto flex items-center gap-3">
          {data.tournaments.length > 0 && <Link to="/societa/rose" className="text-xs text-fsl-gold hover:underline" data-testid="club-groups-go-rose">Vai alle rose →</Link>}
          <button className="btn-gold h-10" onClick={() => setAdding(true)} data-testid="club-groups-add"><Plus className="h-4 w-4" /> Aggiungi squadra</button>
        </div>
      </div>
      {pending.length === 0 && data.tournaments.length === 0 && (
        <div className="fsl-card-gold p-6 flex flex-wrap items-center gap-4" data-testid="club-groups-empty"><FileSpreadsheet className="h-8 w-8 text-fsl-gold shrink-0" /><div className="flex-1 min-w-[220px]"><div className="font-display font-bold uppercase">Nessun gruppo ancora</div><p className="text-xs text-fsl-slate">Aggiungi i gruppi (categoria, anno, livello) della tua società: l'organizzazione li inviterà ai tornei e per ognuno potrai scaricare il modulo rosa Excel e caricarlo compilato.</p></div></div>
      )}
      {pending.length > 0 && (
        <section className="space-y-3" data-testid="club-groups-pending">
          <div className="fsl-kicker">Squadre della società · non ancora in un torneo (carica la rosa e chiedi la partecipazione)</div>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">{pending.map((g) => <PendingGroupCard key={g.id} g={g} onChanged={load} />)}</div>
        </section>
      )}
      {data.tournaments.map((b) => <TournamentBlock key={b.tournament.id} block={b} onChanged={load} />)}
      {adding && <AddGroupDialog categories={categories} levels={data.levels || [""]} initialTournament={requestTournamentId} onClose={() => setAdding(false)} onDone={() => { setAdding(false); load(); }} />}
    </div>
  );
}
