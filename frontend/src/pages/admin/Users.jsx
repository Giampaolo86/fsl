import { useEffect, useState } from "react";
import { Eye, KeyRound, Plus, Trash2, UserCog } from "lucide-react";
import { toast } from "sonner";
import { AccessRequests } from "@/components/fsl/ClubOnboarding";
import { ResetRequests } from "@/components/fsl/AccountTools";
import { PageHeader } from "@/components/fsl/Primitives";
import { ErrorState, LoadingState } from "@/components/fsl/States";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/context/AuthContext";
import { useTournaments } from "@/context/TournamentContext";
import { api, apiError } from "@/lib/api";
import { ROLE_LABELS } from "@/lib/format";

const IMPERSONABLE = ["club_manager", "referee", "fan", "secretary"];

function UserActions({ u, me, onChanged }) {
  const [temp, setTemp] = useState(null);
  const act = async (label, fn) => { try { const r = await fn(); toast.success(label); onChanged(); return r; } catch (e) { toast.error(apiError(e)); } };
  const canMfaReset = u.mfa_enabled && (me?.is_super_admin || !["director", "super_admin"].includes(u.role));
  const canImpersonate = me?.is_super_admin && !me?.impersonation && u.status === "active" && !u.is_super_admin && IMPERSONABLE.includes(u.role);
  const impersonate = async () => {
    const win = window.open("", "_blank");
    try {
      const { data } = await api.post(`/auth/impersonate/${u.id}`);
      const url = `/impersona#token=${encodeURIComponent(data.access_token)}&to=${encodeURIComponent(data.landing)}`;
      if (win) win.location = url; else window.location.assign(url);
      toast.success(`Area di ${u.full_name} aperta in una nuova scheda (20 minuti)`);
    } catch (e) {
      win?.close();
      toast.error(apiError(e));
    }
  };
  const remove = () => {
    if (!window.confirm(`Eliminare DEFINITIVAMENTE ${u.full_name} (${u.email})? Verranno rimosse sessioni, membership e notifiche. L'operazione non è reversibile.`)) return;
    act("Utente eliminato", () => api.delete(`/users/${u.id}`));
  };
  return (
    <div className="inline-flex flex-wrap justify-end gap-1.5">
      {canImpersonate && <button className="btn-gold h-8 px-2.5 text-xs" onClick={impersonate} data-testid={`user-impersonate-${u.email}`}><Eye className="h-3.5 w-3.5" /> Entra come</button>}
      <button className="btn-ghost h-8 px-2.5 text-xs" onClick={async () => { const r = await act("Password temporanea generata", () => api.post(`/users/${u.id}/temporary-password`).then((x) => x.data)); if (r) setTemp(r.temporary_password); }} data-testid={`user-temp-password-${u.email}`}><KeyRound className="h-3.5 w-3.5" /> Password temp.</button>
      {canMfaReset && <button className="btn-ghost h-8 px-2.5 text-xs" onClick={() => window.confirm(`Azzerare la verifica in due passaggi di ${u.full_name}? Dovrà riconfigurarla al prossimo accesso.`) && act("MFA azzerata", () => api.post(`/users/${u.id}/mfa/reset`))} data-testid={`user-mfa-reset-${u.email}`}>Azzera MFA</button>}
      <button className={`btn-ghost h-8 px-2.5 text-xs ${u.status === "active" ? "text-fsl-danger" : "text-fsl-success"}`} onClick={() => window.confirm(u.status === "active" ? `Disabilitare ${u.full_name}? Le sue sessioni verranno chiuse subito.` : `Riattivare ${u.full_name}?`) && act(u.status === "active" ? "Utente disabilitato" : "Utente riattivato", () => api.patch(`/users/${u.id}/status`, { status: u.status === "active" ? "disabled" : "active" }))} data-testid={`user-toggle-status-${u.email}`}>{u.status === "active" ? "Disabilita" : "Riattiva"}</button>
      {me?.is_super_admin && <button className="btn-ghost h-8 px-2 text-xs text-fsl-danger" onClick={remove} title="Elimina utente" aria-label={`Elimina ${u.full_name}`} data-testid={`user-delete-${u.email}`}><Trash2 className="h-3.5 w-3.5" /></button>}
      <Dialog open={!!temp} onOpenChange={() => setTemp(null)}>
        <DialogContent className="bg-navy-800 border-white/20 text-fsl-white rounded-xl" data-testid="temp-password-dialog" aria-describedby={undefined}>
          <DialogHeader><DialogTitle className="font-display uppercase text-2xl">Password temporanea</DialogTitle></DialogHeader>
          <p className="text-sm text-fsl-slate">Comunicala a <strong className="text-fsl-white">{u.full_name}</strong> ({u.email}) di persona o per telefono. Viene mostrata una sola volta; al primo accesso dovrà sceglierne una nuova.</p>
          <code className="block text-center text-2xl font-mono tracking-widest rounded-lg bg-navy-700/60 border border-fsl-gold/40 px-4 py-4 select-all" data-testid="temp-password-value">{temp}</code>
          <button className="btn-primary" onClick={() => { navigator.clipboard?.writeText(temp); toast.success("Copiata"); }} data-testid="temp-password-copy">Copia</button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function UsersPage() {
  const { user } = useAuth();
  const { tournaments } = useTournaments();
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);
  const [clubs, setClubs] = useState([]);
  const [form, setForm] = useState({ email: "", full_name: "", password: "", role: "secretary", tournament_id: "", club_id: "" });
  const [busy, setBusy] = useState(false);

  const load = () => api.get("/users").then(({ data }) => setList(data)).catch(setError);
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (form.tournament_id && form.role === "club_manager") api.get(`/tournaments/${form.tournament_id}/clubs`).then(({ data }) => setClubs(data));
  }, [form.tournament_id, form.role]);

  if (error) return <ErrorState message={apiError(error)} onRetry={load} />;
  if (!list) return <LoadingState />;
  const canCreate = user.is_super_admin || user.role === "director";

  const submit = async () => {
    setBusy(true);
    try {
      await api.post("/users", { ...form, tournament_id: form.tournament_id || null, club_id: form.club_id || null });
      toast.success("Utente creato");
      setOpen(false);
      load();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader kicker="Utenti, ruoli e permessi" title="Utenti" subtitle="Ogni utente ha un ruolo e una o più membership per torneo. I permessi sono applicati lato API." actions={canCreate && <button className="btn-primary" onClick={() => setOpen(true)} data-testid="users-create-button"><Plus className="h-4 w-4" /> Nuovo utente</button>} />
      {user.is_super_admin && <p className="mb-6 -mt-2 text-xs text-fsl-slate flex items-start gap-2" data-testid="impersonation-hint"><Eye className="h-3.5 w-3.5 text-fsl-gold mt-0.5 shrink-0" /><span><strong className="text-fsl-white">Entra come</strong>: apre l'Area Società, l'Area Arbitro o l'Area Genitori di un utente in una nuova scheda per 20 minuti, con i suoi stessi permessi, senza chiudere la tua sessione. Ogni accesso è registrato nell'Audit.</span></p>}
      <AccessRequests tournaments={tournaments || []} canApprove={canCreate} />
      <ResetRequests />
      <div className="fsl-card overflow-x-auto">
        <table className="w-full table-dark" data-testid="users-table">
          <thead><tr><th>Utente</th><th>Ruolo</th><th>Tornei assegnati</th><th>MFA</th><th>Stato</th><th className="text-right">Azioni</th></tr></thead>
          <tbody>
            {list.map((u) => (
              <tr key={u.id} data-testid={`user-row-${u.email}`}>
                <td><div className="font-semibold">{u.full_name}</div><div className="text-xs text-fsl-slate">{u.email}</div></td>
                <td><span className="inline-flex items-center gap-1.5 text-xs"><UserCog className="h-3.5 w-3.5 text-fsl-gold" /> {u.role_label}</span></td>
                <td className="text-xs text-fsl-slate">{u.is_super_admin ? "Tutti i tornei" : u.memberships.map((m) => m.tournament_name).filter(Boolean).join(", ") || "—"}</td>
                <td className="text-xs" data-testid={`user-mfa-${u.email}`}>{u.mfa_enabled ? <span className="text-fsl-success">Attiva</span> : u.mfa_required ? <span className="text-fsl-warning">Da configurare al login</span> : <span className="text-fsl-slate">Non attiva</span>}</td>
                <td className="text-xs"><span className={u.status === "active" ? "text-fsl-success" : "text-fsl-danger"}>● {u.status === "active" ? "Attivo" : "Disabilitato"}</span>{u.must_change_password && <div className="text-[10px] text-fsl-slate">password temporanea</div>}</td>
                <td className="text-right">{canCreate && u.id !== user.id && <UserActions u={u} me={user} onChanged={load} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-navy-800 border-white/20 text-fsl-white rounded-xl" data-testid="user-create-dialog" aria-describedby={undefined}>
          <DialogHeader><DialogTitle className="font-display uppercase text-2xl">Nuovo utente</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <label><span className="fsl-label">Nome completo</span><input className="fsl-input mt-1" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} data-testid="user-name-input" /></label>
            <label><span className="fsl-label">Email</span><input type="email" className="fsl-input mt-1" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="user-email-input" /></label>
            <label><span className="fsl-label">Password iniziale (min 10, lettere e numeri · l'utente dovrà cambiarla)</span><input type="password" className="fsl-input mt-1" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="user-password-input" /></label>
            <label><span className="fsl-label">Ruolo</span>
              <select className="fsl-input mt-1" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value, club_id: "" })} data-testid="user-role-select">
                {Object.entries(ROLE_LABELS).filter(([k]) => k !== "super_admin" || user.is_super_admin).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </label>
            {form.role !== "super_admin" && (
              <label><span className="fsl-label">Torneo</span>
                <select className="fsl-input mt-1" value={form.tournament_id} onChange={(e) => setForm({ ...form, tournament_id: e.target.value, club_id: "" })} data-testid="user-tournament-select">
                  <option value="">Seleziona…</option>
                  {tournaments.filter((t) => t.status !== "archived").map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
            )}
            {form.role === "club_manager" && (
              <label><span className="fsl-label">Società</span>
                <select className="fsl-input mt-1" value={form.club_id} onChange={(e) => setForm({ ...form, club_id: e.target.value })} data-testid="user-club-select">
                  <option value="">Seleziona…</option>
                  {clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            )}
          </div>
          <DialogFooter>
            <button className="btn-ghost" onClick={() => setOpen(false)}>Annulla</button>
            <button className="btn-primary" disabled={busy} onClick={submit} data-testid="user-create-submit">Crea utente</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
