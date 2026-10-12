import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, CheckCircle2, Copy, ExternalLink, KeyRound, Pencil, Plus, Trophy, UserRound, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ClubCrest } from "@/components/fsl/ClubCrest";
import { EmptyState, LoadingState } from "@/components/fsl/States";
import { api, apiError } from "@/lib/api";
import { fmtDate } from "@/lib/format";

const Field = ({ label, children }) => <label className="block"><span className="fsl-label">{label}</span><div className="mt-1">{children}</div></label>;

function InviteDialog({ club, onClose }) {
  const [data, setData] = useState(null);
  const load = useCallback(() => api.get(`/org-clubs/${club.org_key}/invite`).then((r) => setData(r.data)).catch((e) => toast.error(apiError(e))), [club.org_key]);
  useEffect(() => { load(); }, [load]);
  const gen = () => api.post(`/org-clubs/${club.org_key}/invite`).then(() => { toast.success("Codice FSL generato"); load(); }).catch((e) => toast.error(apiError(e)));
  const inv = data?.invite;
  const link = inv ? `${window.location.origin}/registrati-societa?codice=${inv.code}` : "";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-navy-800 border-white/20 text-fsl-white rounded-xl" data-testid="org-invite-dialog" aria-describedby={undefined}>
        <DialogHeader><DialogTitle className="font-display uppercase text-2xl">Invito FSL · {club.name}</DialogTitle></DialogHeader>
        <p className="text-sm text-fsl-slate">Il responsabile si registra una sola volta con questo codice: la società entra nell'anagrafe FSL e lo stesso account la seguirà in tutti i tornei a cui la iscriverai.</p>
        {!data ? <LoadingState /> : inv && data.valid ? (
          <div className="space-y-3">
            <code className="block text-center text-2xl font-mono tracking-widest rounded-lg bg-navy-700/60 border border-fsl-gold/40 px-4 py-4 select-all" data-testid="org-invite-code">{inv.code}</code>
            <p className="text-xs text-fsl-slate">Valido fino al {fmtDate(inv.expires_at)} · da usare su <span className="text-fsl-white">/registrati-societa</span></p>
            <div className="flex gap-2"><button className="btn-primary flex-1" onClick={() => { navigator.clipboard?.writeText(link); toast.success("Link copiato"); }} data-testid="org-invite-copy"><Copy className="h-4 w-4" /> Copia link</button><button className="btn-ghost" onClick={gen} data-testid="org-invite-regen">Rigenera</button></div>
          </div>
        ) : <button className="btn-gold w-full" onClick={gen} data-testid="org-invite-generate"><KeyRound className="h-4 w-4" /> Genera codice FSL</button>}
      </DialogContent>
    </Dialog>
  );
}

function EnrollDialog({ club, tournaments, onClose, onDone }) {
  const joined = new Set(club.tournaments.map((t) => t.tournament_id));
  const available = tournaments.filter((t) => !joined.has(t.id));
  const [tid, setTid] = useState(available[0]?.id || "");
  const [cats, setCats] = useState("");
  const [groups, setGroups] = useState([]);
  const [sel, setSel] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get("/org-groups").then((r) => { const g = r.data.pending.filter((x) => x.org_key === club.org_key); setGroups(g); setSel(g.map((x) => x.id)); }).catch(() => {}); }, [club.org_key]);
  const submit = async () => {
    if (!tid) return;
    setBusy(true);
    try {
      const r = await api.post(`/org-clubs/${club.org_key}/enroll`, { tournament_id: tid, categories: cats.split(",").map((s) => s.trim()).filter(Boolean), group_ids: sel });
      toast.success(`«${club.name}» iscritta a ${r.data.tournament.name}${r.data.teams.length ? ` con ${r.data.teams.length} gruppi` : ""}`);
      onDone();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-navy-800 border-white/20 text-fsl-white rounded-xl" data-testid="org-enroll-dialog" aria-describedby={undefined}>
        <DialogHeader><DialogTitle className="font-display uppercase text-2xl">Iscrivi {club.name} a un torneo</DialogTitle></DialogHeader>
        <p className="text-sm text-fsl-slate">La società resta una sola: nel torneo compare con lo stesso profilo (stemma, colori, contatti) e il responsabile la trova nella sua home con i gruppi di questo torneo.</p>
        {available.length === 0 ? <p className="text-sm text-fsl-warning">La società è già iscritta a tutti i tornei attivi.</p> : (
          <div className="space-y-3">
            <Field label="Torneo"><select className="fsl-input" value={tid} onChange={(e) => setTid(e.target.value)} data-testid="org-enroll-tournament">{available.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
            {groups.length > 0 && <div><div className="fsl-label mb-1">Gruppi dichiarati dalla società (in attesa di invito)</div><div className="space-y-1">{groups.map((g) => <label key={g.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sel.includes(g.id)} onChange={(e) => setSel(e.target.checked ? [...sel, g.id] : sel.filter((x) => x !== g.id))} data-testid={`org-enroll-group-${g.id}`} /> <span className="num text-fsl-gold font-bold">{g.category}</span> {g.name || g.club_name}{g.birth_year ? ` · ${g.birth_year}` : ""}</label>)}</div></div>}
            <Field label="Altre categorie da iscrivere subito (separate da virgola, es. 2015, 2016)"><input className="fsl-input" value={cats} onChange={(e) => setCats(e.target.value)} placeholder="2016, 2017" data-testid="org-enroll-categories" /></Field>
          </div>
        )}
        <DialogFooter><button className="btn-ghost" onClick={onClose}>Annulla</button><button className="btn-gold" disabled={busy || !tid} onClick={submit} data-testid="org-enroll-submit"><Trophy className="h-4 w-4" /> Iscrivi</button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewClubDialog({ onClose, onDone }) {
  const [f, setF] = useState({ name: "", city: "", contact_name: "", email: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const submit = async (e) => { e.preventDefault(); setBusy(true); try { await api.post("/org-clubs", f); toast.success(`«${f.name}» aggiunta all'anagrafe FSL`); onDone(); } catch (err) { toast.error(apiError(err)); } finally { setBusy(false); } };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-navy-800 border-white/20 text-fsl-white rounded-xl" data-testid="org-new-dialog" aria-describedby={undefined}>
        <DialogHeader><DialogTitle className="font-display uppercase text-2xl">Nuova società FSL</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3"><Field label="Nome società"><input className="fsl-input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="org-new-name" /></Field><Field label="Città"><input className="fsl-input" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} data-testid="org-new-city" /></Field></div>
          <div className="grid grid-cols-3 gap-3"><Field label="Referente"><input className="fsl-input" value={f.contact_name} onChange={(e) => setF({ ...f, contact_name: e.target.value })} /></Field><Field label="Email"><input type="email" className="fsl-input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field><Field label="Telefono"><input className="fsl-input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field></div>
          <DialogFooter><button type="button" className="btn-ghost" onClick={onClose}>Annulla</button><button className="btn-gold" disabled={busy} data-testid="org-new-submit"><Plus className="h-4 w-4" /> Aggiungi</button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Row({ c, onInvite, onEnroll, onReview }) {
  return (
    <tr data-testid={`org-club-row-${c.org_key}`}>
      <td><div className="flex items-center gap-3"><ClubCrest club={c} size={32} /><div className="min-w-0"><div className="font-semibold truncate">{c.name}</div><div className="text-xs text-fsl-slate">{c.city || "—"}</div></div></div></td>
      <td className="text-xs">{c.manager ? <span className="inline-flex items-center gap-1.5" data-testid={`org-club-manager-${c.org_key}`}><UserRound className="h-3.5 w-3.5 text-fsl-gold" /> <span className="truncate">{c.manager.full_name || c.manager.email}</span></span> : c.invite?.valid ? <span className="text-fsl-warning">Invito FSL inviato · in attesa di registrazione</span> : <span className="text-fsl-slate">Nessun responsabile</span>}</td>
      <td><div className="flex flex-wrap gap-1">{c.tournaments.length === 0 ? <span className="text-xs text-fsl-slate">Nessun torneo</span> : c.tournaments.map((t) => <Link key={t.tournament_id} to={`/admin/t/${t.tournament_id}/societa/${t.club_id}`} className="h-6 px-2 rounded-full border border-fsl-gold/40 text-fsl-gold text-[11px] inline-flex items-center gap-1 hover:bg-fsl-gold/10" title={`${t.teams} gruppi`} data-testid={`org-club-t-${c.org_key}-${t.tournament_id}`}>{t.tournament_name} <span className="num text-fsl-white">{t.teams}</span></Link>)}</div>{c.pending_groups > 0 && <div className="text-[11px] text-fsl-warning mt-1" data-testid={`org-club-pending-${c.org_key}`}>{c.pending_groups} gruppi in attesa di invito</div>}</td>
      <td className="text-xs">{c.has_draft ? <div className="flex items-center gap-1"><span className="text-fsl-warning">Modifiche da approvare</span><button className="btn-ghost h-7 px-2 text-fsl-success" onClick={() => onReview(c, "approve")} data-testid={`org-club-approve-${c.org_key}`}><CheckCircle2 className="h-3.5 w-3.5" /></button><button className="btn-ghost h-7 px-2 text-fsl-danger" onClick={() => onReview(c, "reject")} data-testid={`org-club-reject-${c.org_key}`}><XCircle className="h-3.5 w-3.5" /></button></div> : <span className="text-fsl-slate">Pubblicato</span>}</td>
      <td className="text-right"><div className="inline-flex gap-1">
        {!c.manager && <button className="btn-ghost h-9" onClick={() => onInvite(c)} data-testid={`org-club-invite-${c.org_key}`}><KeyRound className="h-4 w-4" /> Invito FSL</button>}
        <button className="btn-gold h-9" onClick={() => onEnroll(c)} data-testid={`org-club-enroll-${c.org_key}`}><Trophy className="h-4 w-4" /> Iscrivi a torneo</button>
        <Link to={`/admin/societa/${c.org_key}`} className="btn-ghost h-9" data-testid={`org-club-profile-${c.org_key}`}><Pencil className="h-4 w-4" /> Profilo</Link>
        {c.tournaments[0] && <Link to={`/tornei/${c.tournaments[0].tournament_slug}/squadre/${c.tournaments[0].club_slug}`} target="_blank" rel="noreferrer" className="btn-ghost h-9" data-testid={`org-club-open-${c.org_key}`}><ExternalLink className="h-4 w-4" /></Link>}
      </div></td>
    </tr>
  );
}

export function OrgRegistry({ onChanged }) {
  const [data, setData] = useState(null);
  const [q, setQ] = useState("");
  const [dialog, setDialog] = useState(null);
  const load = useCallback(() => api.get("/org-clubs").then((r) => setData(r.data)).catch((e) => toast.error(apiError(e))), []);
  useEffect(() => { load(); }, [load]);
  const done = () => { setDialog(null); load(); onChanged?.(); };
  const review = async (c, action) => {
    const note = action === "reject" ? window.prompt(`Motivo del rifiuto per «${c.name}» (il responsabile riceverà una notifica):`) : "";
    if (action === "reject" && !note) return;
    try { await api.post(`/org-clubs/${c.org_key}/profile/review`, { action, note }); toast.success(action === "approve" ? "Profilo pubblicato in tutti i tornei" : "Modifiche respinte"); load(); } catch (e) { toast.error(apiError(e)); }
  };
  if (!data) return <LoadingState />;
  const rows = data.items.filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()) || (c.city || "").toLowerCase().includes(q.toLowerCase()));
  return (
    <section className="space-y-3" data-testid="org-registry">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="fsl-section-title flex items-center gap-2"><Building2 className="h-5 w-5 text-fsl-gold" /> Anagrafe Società FSL</h2>
        <span className="text-xs text-fsl-slate">Una società, un responsabile, un profilo: i tornei si aggiungono da qui.</span>
        <input className="fsl-input h-10 w-56 ml-auto" placeholder="Cerca società…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="org-registry-search" />
        <button className="btn-gold h-10" onClick={() => setDialog({ kind: "new" })} data-testid="org-registry-new"><Plus className="h-4 w-4" /> Nuova società FSL</button>
      </div>
      {rows.length === 0 ? <EmptyState title="Nessuna società in anagrafe" description="Aggiungi la prima società FSL o approva una richiesta di accesso." /> : (
        <div className="fsl-card overflow-x-auto">
          <table className="w-full table-dark" data-testid="org-registry-table">
            <thead><tr><th>Società</th><th>Responsabile</th><th>Tornei e gruppi</th><th>Profilo</th><th></th></tr></thead>
            <tbody>{rows.map((c) => <Row key={c.org_key} c={c} onInvite={(x) => setDialog({ kind: "invite", club: x })} onEnroll={(x) => setDialog({ kind: "enroll", club: x })} onReview={review} />)}</tbody>
          </table>
        </div>
      )}
      {dialog?.kind === "invite" && <InviteDialog club={dialog.club} onClose={() => setDialog(null)} />}
      {dialog?.kind === "enroll" && <EnrollDialog club={dialog.club} tournaments={data.tournaments} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === "new" && <NewClubDialog onClose={() => setDialog(null)} onDone={done} />}
    </section>
  );
}
