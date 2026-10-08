import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock, Send, Shield, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTournaments } from "@/context/TournamentContext";
import { api, apiError } from "@/lib/api";
import { fmtDate } from "@/lib/format";

function InviteDialog({ groups, tournaments, onClose, onDone }) {
  const g = groups[0];
  const many = groups.length > 1;
  const [tid, setTid] = useState(tournaments[0]?.id || "");
  const [comps, setComps] = useState([]);
  const [compId, setCompId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!tid) return; setCompId(""); api.get(`/tournaments/${tid}/competitions`).then((r) => setComps((Array.isArray(r.data) ? r.data : r.data.items || []).filter((c) => c.kind !== "knockout"))).catch(() => setComps([])); }, [tid]);
  const submit = async () => {
    setBusy(true);
    try {
      if (many) { const r = await api.post("/org-groups/invite-bulk", { group_ids: groups.map((x) => x.id), tournament_id: tid, competition_id: compId || null, note }); toast.success(`${r.data.invited.length} gruppi invitati`); r.data.errors.forEach((e) => toast.error(e.error)); }
      else { const r = await api.post(`/org-groups/${g.id}/invite`, { tournament_id: tid, competition_id: compId || null, note }); toast.success(`«${r.data.team.name}» iscritta a ${r.data.tournament.name}: la società è stata avvisata`); }
      onDone();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-navy-800 border-white/20 text-fsl-white rounded-xl max-w-lg" aria-describedby={undefined} data-testid="invite-group-dialog">
        <DialogHeader><DialogTitle className="font-display uppercase text-2xl">Invita al torneo</DialogTitle></DialogHeader>
        {many ? <div className="text-sm text-fsl-slate" data-testid="invite-group-list"><strong className="text-fsl-white">{groups.length} gruppi</strong>: {groups.map((x) => `${x.club_name} ${x.category}`).join(", ")}. Per ognuno creo la società nel torneo (se manca), l'accesso del responsabile e la squadra.</div>
          : <p className="text-sm text-fsl-slate"><strong className="text-fsl-white">{g.club_name}</strong> · {g.name || g.category}{g.birth_year ? ` · anno ${g.birth_year}` : ""}{g.level ? ` · ${g.level}` : ""}. Creo la società nel torneo (se manca), l'accesso del responsabile e la squadra; la società potrà subito caricare la rosa.</p>}
        <label className="block"><span className="fsl-label">Torneo *</span><select className="fsl-input mt-1" value={tid} onChange={(e) => setTid(e.target.value)} data-testid="invite-group-tournament">{tournaments.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label className="block"><span className="fsl-label">Girone (facoltativo)</span><select className="fsl-input mt-1" value={compId} onChange={(e) => setCompId(e.target.value)} data-testid="invite-group-competition"><option value="">Assegno dopo da Gironi e Calendario</option>{comps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="block"><span className="fsl-label">Messaggio alla società</span><input className="fsl-input mt-1" placeholder="es. Benvenuti! Caricate la rosa entro il 20 ottobre" value={note} onChange={(e) => setNote(e.target.value)} data-testid="invite-group-note" /></label>
        <DialogFooter><button className="btn-ghost" onClick={onClose}>Annulla</button><button className="btn-gold" disabled={busy || !tid} onClick={submit} data-testid="invite-group-submit"><Send className="h-4 w-4" /> {many ? `Invita ${groups.length} gruppi` : "Invita"}</button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function OrgGroupsInbox({ onChanged }) {
  const { tournaments } = useTournaments();
  const [data, setData] = useState(null);
  const [inviting, setInviting] = useState(null);
  const [sel, setSel] = useState([]);
  const load = useCallback(() => api.get("/org-groups").then((r) => setData(r.data)).catch(() => setData({ pending: [], recent: [], clubs_without_tournament: [] })), []);
  useEffect(() => { load(); }, [load]);
  if (!data) return null;
  const active = (tournaments || []).filter((t) => t.status !== "archived");
  const reject = (g) => { const note = window.prompt(`Motivo per non accogliere «${g.name || g.category}» di ${g.club_name} (la società riceverà una notifica):`); if (note === null) return; api.post(`/org-groups/${g.id}/reject`, { note }).then(() => { toast.success("Gruppo non accolto"); load(); onChanged?.(); }).catch((e) => toast.error(apiError(e))); };
  if (data.pending.length === 0 && data.clubs_without_tournament.length === 0) return null;
  return (
    <section className="space-y-4" data-testid="org-groups-inbox">
      {data.pending.length > 0 && (
        <div className="rounded-xl border border-fsl-warning/40 bg-fsl-warning/5 p-4 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            <input type="checkbox" aria-label="Seleziona tutti" checked={sel.length === data.pending.length} onChange={(e) => setSel(e.target.checked ? data.pending.map((g) => g.id) : [])} data-testid="org-groups-select-all" />
            <span className="h-6 px-2 rounded-full bg-fsl-warning text-ink-950 text-[11px] font-bold num" data-testid="org-groups-pending-count">{data.pending.length}</span> Gruppi in attesa di invito a un torneo
            {sel.length > 1 && <button className="btn-gold h-9 ml-auto" disabled={active.length === 0} onClick={() => setInviting(data.pending.filter((g) => sel.includes(g.id)))} data-testid="org-groups-invite-selected"><Send className="h-4 w-4" /> Invita {sel.length} gruppi allo stesso torneo</button>}
          </div>
          {data.pending.map((g) => (
            <div key={g.id} className="min-h-[44px] flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" data-testid={`org-group-${g.id}`}>
              <input type="checkbox" aria-label="Seleziona" checked={sel.includes(g.id)} onChange={(e) => setSel(e.target.checked ? [...sel, g.id] : sel.filter((x) => x !== g.id))} data-testid={`org-group-select-${g.id}`} />
              <span className="font-display font-extrabold text-xl num text-fsl-gold">{g.category}</span>
              <span className="flex-1 min-w-0 truncate"><span className="font-semibold">{g.club_name}</span> · {g.name}{g.birth_year ? ` · anno ${g.birth_year}` : ""}{g.level ? ` · ${g.level}` : ""}{g.description ? <span className="text-fsl-slate"> · {g.description}</span> : null}</span>
              <span className="text-xs text-fsl-slate num inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {fmtDate(g.created_at)}</span>
              <button className="btn-ghost h-9 text-fsl-danger" onClick={() => reject(g)} data-testid={`org-group-reject-${g.id}`}><XCircle className="h-4 w-4" /></button>
              <button className="btn-gold h-9" onClick={() => setInviting([g])} disabled={active.length === 0} data-testid={`org-group-invite-${g.id}`}><Send className="h-4 w-4" /> Invita al torneo</button>
            </div>
          ))}
        </div>
      )}
      {data.clubs_without_tournament.length > 0 && (
        <div className="fsl-card p-4 space-y-2" data-testid="org-clubs-orphans">
          <div className="flex items-center gap-2 text-sm font-semibold"><Shield className="h-4 w-4 text-fsl-gold" /> Società registrate senza torneo <span className="text-xs text-fsl-slate font-normal">· entrano nell'Area Società e aggiungono i gruppi; tu li inviti qui sopra</span></div>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2">{data.clubs_without_tournament.map((c) => <div key={c.id} className="rounded-md border border-white/10 px-3 py-2 text-xs" data-testid={`org-club-${c.id}`}><div className="font-semibold text-sm">{c.name}{c.city ? <span className="text-fsl-slate font-normal"> · {c.city}</span> : null}</div><div className="text-fsl-slate truncate">{c.contact_name} · {c.email}{c.phone ? ` · ${c.phone}` : ""}</div></div>)}</div>
        </div>
      )}
      {data.recent.length > 0 && <div className="text-xs text-fsl-slate flex items-center gap-2" data-testid="org-groups-recent"><CheckCircle2 className="h-3.5 w-3.5 text-fsl-success" /> Ultimi inviti: {data.recent.slice(0, 4).map((g) => `${g.club_name} ${g.category} → ${g.tournament_name}`).join(" · ")}</div>}
      {inviting && <InviteDialog groups={inviting} tournaments={active} onClose={() => setInviting(null)} onDone={() => { setInviting(null); setSel([]); load(); onChanged?.(); }} />}
    </section>
  );
}
