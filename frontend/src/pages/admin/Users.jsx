import { useEffect, useState } from "react";
import { Plus, UserCog } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/fsl/Primitives";
import { ErrorState, LoadingState } from "@/components/fsl/States";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/context/AuthContext";
import { useTournaments } from "@/context/TournamentContext";
import { api, apiError } from "@/lib/api";
import { ROLE_LABELS } from "@/lib/format";

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
      <div className="fsl-card overflow-x-auto">
        <table className="w-full table-dark" data-testid="users-table">
          <thead><tr><th>Utente</th><th>Ruolo</th><th>Tornei assegnati</th><th>MFA</th><th>Stato</th></tr></thead>
          <tbody>
            {list.map((u) => (
              <tr key={u.id} data-testid={`user-row-${u.email}`}>
                <td><div className="font-semibold">{u.full_name}</div><div className="text-xs text-fsl-slate">{u.email}</div></td>
                <td><span className="inline-flex items-center gap-1.5 text-xs"><UserCog className="h-3.5 w-3.5 text-fsl-gold" /> {u.role_label}</span></td>
                <td className="text-xs text-fsl-slate">{u.is_super_admin ? "Tutti i tornei" : u.memberships.map((m) => m.tournament_name).filter(Boolean).join(", ") || "—"}</td>
                <td className="text-xs">{u.mfa_required ? <span className="text-fsl-warning">Richiesta (Fase 7)</span> : <span className="text-fsl-slate">Consigliata</span>}</td>
                <td className="text-xs"><span className={u.status === "active" ? "text-fsl-success" : "text-fsl-danger"}>● {u.status === "active" ? "Attivo" : "Disabilitato"}</span></td>
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
            <label><span className="fsl-label">Password (min 8)</span><input type="password" className="fsl-input mt-1" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="user-password-input" /></label>
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
