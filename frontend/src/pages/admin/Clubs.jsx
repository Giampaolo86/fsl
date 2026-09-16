import { useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, KeyRound, Pencil, Plus, Shield, Users } from "lucide-react";
import { InviteDialog } from "@/components/fsl/ClubOnboarding";
import { toast } from "sonner";
import { PageHeader } from "@/components/fsl/Primitives";
import { ProfileReviews } from "@/components/fsl/ProfileReviews";
import { ClubCrest } from "@/components/fsl/ClubCrest";
import { EmptyState, ErrorState, LoadingState } from "@/components/fsl/States";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useScoped, useTournamentDetail } from "@/hooks/useTournamentData";
import { useAuth } from "@/context/AuthContext";
import { api, apiError } from "@/lib/api";

export default function Clubs() {
  const { data: t } = useTournamentDetail();
  const clubs = useScoped("clubs");
  const comps = useScoped("competitions");
  const { user } = useAuth();
  const [open, setOpen] = useState(null);
  const [form, setForm] = useState({ name: "", city: "", motto: "", primary: "#0B57D9", secondary: "#F4AE2B" });
  const [teamForm, setTeamForm] = useState({ competition_id: "" });
  const [busy, setBusy] = useState(false);

  if (clubs.loading || !t) return <LoadingState />;
  if (clubs.error) return <ErrorState message={apiError(clubs.error)} onRetry={clubs.reload} />;
  const canWrite = ["super_admin", "director", "secretary"].includes(t.my_role) && !t.read_only;

  const createClub = async () => {
    setBusy(true);
    try {
      await api.post(`/tournaments/${t.id}/clubs`, { name: form.name, city: form.city, motto: form.motto, colors: { primary: form.primary, secondary: form.secondary } });
      toast.success("Società creata");
      setOpen(null);
      setForm({ name: "", city: "", motto: "", primary: "#0B57D9", secondary: "#F4AE2B" });
      clubs.reload();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const addTeam = async () => {
    setBusy(true);
    try {
      await api.post(`/tournaments/${t.id}/teams`, { club_id: open.id, competition_id: teamForm.competition_id });
      toast.success("Squadra iscritta");
      setOpen(null);
      clubs.reload();
      comps.reload();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        kicker="Società, squadre e inviti"
        title="Società"
        subtitle={`${clubs.data.length} società nel torneo. Clicca sul nome per aprire la homepage pubblica della società. Gli stemmi mostrati sono segnaposto finché la società non carica il proprio materiale ufficiale.`}
        actions={
          canWrite && (
            <button className="btn-primary" onClick={() => setOpen("new")} data-testid="clubs-create-button">
              <Plus className="h-4 w-4" aria-hidden="true" /> Nuova società
            </button>
          )
        }
      />
      <ProfileReviews tid={t.id} onDone={clubs.reload} />
      {!t.published && <p className="mb-4 text-xs text-fsl-warning" data-testid="clubs-unpublished-note">Il torneo non è ancora pubblicato: le homepage pubbliche delle società saranno raggiungibili dopo la pubblicazione.</p>}
      {clubs.data.length === 0 ? (
        <EmptyState icon={Shield} title="Nessuna società" description="Aggiungi le società invitate dall'organizzazione per iniziare a comporre le serie." action={canWrite && <button className="btn-gold" onClick={() => setOpen("new")}>Nuova società</button>} />
      ) : (
        <div className="fsl-card overflow-x-auto">
          <table className="w-full table-dark" data-testid="clubs-table">
            <thead>
              <tr>
                <th>Società</th>
                <th>Città</th>
                <th>Motto</th>
                <th className="text-right">Squadre</th>
                <th>Stemma</th>
                <th className="text-right">Homepage</th>
                {canWrite && <th className="text-right">Azioni</th>}
              </tr>
            </thead>
            <tbody>
              {clubs.data.map((c) => (
                <tr key={c.id} data-testid={`club-row-${c.slug}`}>
                  <td>
                    <Link to={`/tornei/${t.slug}/squadre/${c.slug}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 hover:text-fsl-gold" data-testid={`club-name-link-${c.slug}`}>
                      <ClubCrest club={c} size={32} />
                      <span className="font-semibold">{c.name}</span>
                    </Link>
                  </td>
                  <td className="text-fsl-slate">{c.city || "—"}</td>
                  <td className="text-fsl-slate text-xs">{c.motto || "—"}</td>
                  <td className="num text-right">{c.teams_count}</td>
                  <td className="text-xs">{c.crest_is_placeholder ? <span className="text-fsl-warning">Segnaposto</span> : <span className="text-fsl-success">Ufficiale</span>}</td>
                  <td className="text-right">
                    <div className="inline-flex gap-1">
                      {canWrite && <button className="btn-ghost h-9" onClick={() => setOpen({ invite: c })} data-testid={`club-invite-${c.slug}`}><KeyRound className="h-4 w-4" aria-hidden="true" /> Invito</button>}
                      {canWrite && <Link to={`/admin/t/${t.id}/societa/${c.id}`} className="btn-ghost h-9" data-testid={`club-edit-${c.slug}`}><Pencil className="h-4 w-4" aria-hidden="true" /> Modifica</Link>}
                      <Link to={`/tornei/${t.slug}/squadre/${c.slug}`} target="_blank" rel="noreferrer" className="btn-ghost h-9" data-testid={`club-homepage-${c.slug}`}>
                        <ExternalLink className="h-4 w-4" aria-hidden="true" /> Apri
                      </Link>
                    </div>
                  </td>
                  {canWrite && (
                    <td className="text-right">
                      <button className="btn-ghost h-9" onClick={() => { setOpen(c); setTeamForm({ competition_id: comps.data?.[0]?.id || "" }); }} data-testid={`club-add-team-${c.slug}`}>
                        <Users className="h-4 w-4" aria-hidden="true" /> Iscrivi squadra
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open?.invite && <InviteDialog tid={t.id} club={open.invite} onClose={() => setOpen(null)} />}
      <Dialog open={open === "new"} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="bg-navy-800 border-white/20 text-fsl-white rounded-xl" data-testid="club-create-dialog" aria-describedby={undefined}>
          <DialogHeader><DialogTitle className="font-display uppercase text-2xl">Nuova società</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <label><span className="fsl-label">Nome *</span><input className="fsl-input mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="club-name-input" /></label>
            <label><span className="fsl-label">Città</span><input className="fsl-input mt-1" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} data-testid="club-city-input" /></label>
            <label><span className="fsl-label">Motto</span><input className="fsl-input mt-1" value={form.motto} onChange={(e) => setForm({ ...form, motto: e.target.value })} data-testid="club-motto-input" /></label>
            <div className="grid grid-cols-2 gap-3">
              <label><span className="fsl-label">Colore primario</span><input type="color" className="fsl-input mt-1 p-1" value={form.primary} onChange={(e) => setForm({ ...form, primary: e.target.value })} /></label>
              <label><span className="fsl-label">Colore secondario</span><input type="color" className="fsl-input mt-1 p-1" value={form.secondary} onChange={(e) => setForm({ ...form, secondary: e.target.value })} /></label>
            </div>
            <div className="flex items-center gap-3 text-xs text-fsl-slate"><ClubCrest club={{ name: form.name || "Nuova", colors: { primary: form.primary, secondary: form.secondary } }} size={40} /> Anteprima stemma segnaposto</div>
          </div>
          <DialogFooter>
            <button className="btn-ghost" onClick={() => setOpen(null)}>Annulla</button>
            <button className="btn-primary" disabled={busy || form.name.trim().length < 2} onClick={createClub} data-testid="club-create-submit">Crea società</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!open && open !== "new" && !open.invite} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="bg-navy-800 border-white/20 text-fsl-white rounded-xl" data-testid="team-create-dialog" aria-describedby={undefined}>
          <DialogHeader><DialogTitle className="font-display uppercase text-2xl">Iscrivi {open?.name}</DialogTitle></DialogHeader>
          <label>
            <span className="fsl-label">Competizione</span>
            <select className="fsl-input mt-1" value={teamForm.competition_id} onChange={(e) => setTeamForm({ competition_id: e.target.value })} data-testid="team-competition-select">
              {(comps.data || []).map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.teams_registered}/{c.teams_count})</option>
              ))}
            </select>
          </label>
          <DialogFooter>
            <button className="btn-ghost" onClick={() => setOpen(null)}>Annulla</button>
            <button className="btn-primary" disabled={busy || !teamForm.competition_id} onClick={addTeam} data-testid="team-create-submit">Iscrivi</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
