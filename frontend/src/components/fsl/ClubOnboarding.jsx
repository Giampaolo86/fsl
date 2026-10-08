import { useCallback, useEffect, useState } from "react";
import { Check, Copy, KeyRound, RefreshCw, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FilterChips } from "@/components/fsl/Primitives";
import { api, apiError } from "@/lib/api";
import { fmtDate } from "@/lib/format";

const copy = (text) => navigator.clipboard?.writeText(text).then(() => toast.success("Copiato")).catch(() => toast.error("Copia non riuscita"));

export function InviteDialog({ tid, club, onClose }) {
  const [data, setData] = useState(null);
  const load = useCallback(() => api.get(`/tournaments/${tid}/clubs/${club.id}/invite`).then((r) => setData(r.data)).catch((e) => toast.error(apiError(e))), [tid, club.id]);
  useEffect(() => { load(); }, [load]);
  const gen = () => api.post(`/tournaments/${tid}/clubs/${club.id}/invite`).then(() => { toast.success("Codice generato"); load(); }).catch((e) => toast.error(apiError(e)));
  const inv = data?.invite;
  const link = inv ? `${window.location.origin}/registrati-societa?codice=${inv.code}` : "";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-navy-800 border-white/20 text-fsl-white rounded-xl max-w-md" aria-describedby={undefined} data-testid="invite-dialog">
        <DialogHeader><DialogTitle className="font-display uppercase text-2xl">Codice invito · {club.name}</DialogTitle></DialogHeader>
        <p className="text-xs text-fsl-slate">Il responsabile della società si registra su <span className="text-fsl-white">/registrati-societa</span> con questo codice (valido 30 giorni, uso singolo) e viene abbinato subito alla società.</p>
        {inv && data.valid ? (
          <div className="space-y-3">
            <div className="fsl-card-gold p-4 text-center"><div className="fsl-kicker">Codice</div><div className="font-display font-extrabold text-4xl tracking-widest num" data-testid="invite-code">{inv.code}</div><div className="text-[11px] text-fsl-slate mt-1">Scade il {fmtDate(inv.expires_at)}</div></div>
            <div className="flex gap-2"><button className="btn-ghost flex-1" onClick={() => copy(inv.code)} data-testid="invite-copy-code"><Copy className="h-4 w-4" /> Copia codice</button><button className="btn-primary flex-1" onClick={() => copy(link)} data-testid="invite-copy-link"><Copy className="h-4 w-4" /> Copia link</button></div>
          </div>
        ) : (
          <p className="text-sm text-fsl-slate" data-testid="invite-none">{inv?.used_by ? "L'ultimo codice è già stato utilizzato." : inv ? "L'ultimo codice è scaduto." : "Nessun codice attivo."}</p>
        )}
        <button className="btn-gold w-full" onClick={gen} data-testid="invite-generate"><RefreshCw className="h-4 w-4" /> {inv && data.valid ? "Rigenera codice (invalida il precedente)" : "Genera codice invito"}</button>
      </DialogContent>
    </Dialog>
  );
}

const STATUS = { pending: ["In attesa", "bg-fsl-warning text-ink-950"], approved: ["Approvata", "bg-fsl-success text-ink-950"], rejected: ["Rifiutata", "bg-white/10 text-fsl-slate"] };

export function AccessRequests({ tournaments, canApprove }) {
  const [rows, setRows] = useState([]);
  const [issued, setIssued] = useState(null);
  const load = useCallback(() => api.get("/access-requests").then((r) => setRows([...r.data].sort((a, b) => (a.status === "pending" ? -1 : 1) - (b.status === "pending" ? -1 : 1)))).catch(() => setRows([])), []);
  useEffect(() => { load(); }, [load]);
  const approve = (r) => api.post(`/access-requests/${r.id}/approve`, {}).then((res) => { setIssued(res.data); load(); }).catch((e) => toast.error(apiError(e)));
  const reject = (r) => api.post(`/access-requests/${r.id}/reject`, {}).then(() => { toast.success("Richiesta rifiutata"); load(); }).catch((e) => toast.error(apiError(e)));
  const remove = (r) => window.confirm(`Eliminare la richiesta di «${r.club_name}» (${r.email})? L'eventuale utente o società già creati restano.`) && api.delete(`/access-requests/${r.id}`).then(() => { toast.success("Richiesta eliminata"); load(); }).catch((e) => toast.error(apiError(e)));
  const pending = rows.filter((r) => r.status === "pending").length;
  const [status, setStatus] = useState("all");
  const [tid, setTid] = useState("");
  const shown = rows.filter((r) => (status === "all" || r.status === status) && (!tid || r.tournament_id === tid || (tid === "none" && !r.tournament_id)));
  const counts = { all: rows.length, pending, approved: rows.filter((r) => r.status === "approved").length, rejected: rows.filter((r) => r.status === "rejected").length };
  return (
    <section className="mb-8" data-testid="access-requests">
      <div className="flex items-center gap-3 mb-3"><h2 className="fsl-section-title flex items-center gap-2"><KeyRound className="h-5 w-5 text-fsl-gold" /> Richieste di accesso società</h2>{pending > 0 && <span className="h-6 px-2 rounded-full bg-fsl-gold text-ink-950 text-xs font-bold num inline-flex items-center" data-testid="access-requests-pending">{pending}</span>}</div>
      {rows.length > 0 && (
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-3" data-testid="access-requests-filters">
          <FilterChips value={status} onChange={setStatus} options={[["all", "Tutte"], ["pending", "In attesa"], ["approved", "Approvate"], ["rejected", "Rifiutate"]]} counts={counts} testId="access-requests-status" />
          {tournaments.length > 1 && <select className="fsl-input w-48 lg:ml-auto" value={tid} onChange={(e) => setTid(e.target.value)} data-testid="access-requests-tournament-filter"><option value="">Tutti i tornei</option><option value="none">Senza torneo</option>{tournaments.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>}
        </div>
      )}
      {rows.length === 0 ? <p className="text-sm text-fsl-slate fsl-card p-4" data-testid="access-requests-empty">Nessuna richiesta. Le società possono inviarla da <span className="text-fsl-white">/richiedi-accesso</span>.</p> : (
        <div className="fsl-card overflow-x-auto"><table className="w-full table-dark"><thead><tr><th>Società</th><th>Referente</th><th>Torneo</th><th>Data</th><th>Stato</th><th className="text-right">Azioni</th></tr></thead><tbody>
          {shown.length === 0 && <tr><td colSpan={6} className="text-center text-sm text-fsl-slate py-6" data-testid="access-requests-filtered-empty">Nessuna richiesta con questi filtri.</td></tr>}
          {shown.map((r) => <tr key={r.id} data-testid={`access-request-${r.id}`}><td><div className="font-semibold">{r.club_name}</div><div className="text-xs text-fsl-slate">{r.city}{r.note ? ` · ${r.note}` : ""}</div></td><td><div>{r.contact_name}</div><div className="text-xs text-fsl-slate">{r.email}{r.phone ? ` · ${r.phone}` : ""}</div></td><td className="text-xs">{r.tournament_name || <span className="text-fsl-slate">Senza torneo · da invitare</span>}</td><td className="num text-xs">{fmtDate(r.created_at)}</td><td><span className={`h-6 px-2 rounded-full text-[10px] font-bold uppercase inline-flex items-center ${STATUS[r.status][1]}`}>{STATUS[r.status][0]}</span></td><td className="text-right"><div className="inline-flex gap-1">{r.status === "pending" && canApprove && <><button className="btn-gold h-8 px-3 text-xs" onClick={() => approve(r)} data-testid={`access-request-approve-${r.id}`}><Check className="h-3.5 w-3.5" /> Approva</button><button className="btn-ghost h-8 px-3 text-xs" onClick={() => reject(r)} data-testid={`access-request-reject-${r.id}`}><X className="h-3.5 w-3.5" /> Rifiuta</button></>}{canApprove && <button className="btn-ghost h-8 px-2 text-xs text-fsl-danger" onClick={() => remove(r)} title="Elimina richiesta" aria-label="Elimina richiesta" data-testid={`access-request-delete-${r.id}`}><Trash2 className="h-3.5 w-3.5" /></button>}</div></td></tr>)}
        </tbody></table></div>
      )}
      {issued && (
        <Dialog open onOpenChange={(o) => !o && setIssued(null)}>
          <DialogContent className="bg-navy-800 border-white/20 text-fsl-white rounded-xl max-w-md" aria-describedby={undefined} data-testid="access-request-issued">
            <DialogHeader><DialogTitle className="font-display uppercase text-2xl">Account creato</DialogTitle></DialogHeader>
            <p className="text-sm text-fsl-slate">Società <strong className="text-fsl-white">{issued.club.name}</strong> e responsabile creati{issued.club && !issued.tournament ? " (senza torneo: la società aggiungerà i gruppi e li inviterai da «Tutte le società»)" : ""}. Comunica queste credenziali al referente: la password temporanea viene mostrata una sola volta.</p>
            <div className="fsl-card-gold p-4 space-y-1 text-sm"><div>Email: <span className="font-semibold" data-testid="issued-email">{issued.email}</span></div><div>Password temporanea: <span className="font-display font-extrabold text-2xl num tracking-wider" data-testid="issued-password">{issued.temp_password}</span></div></div>
            <button className="btn-primary w-full" onClick={() => copy(`Accesso Area Società FSL\n${window.location.origin}/login\nEmail: ${issued.email}\nPassword temporanea: ${issued.temp_password}`)} data-testid="issued-copy"><Copy className="h-4 w-4" /> Copia credenziali</button>
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}
