import { useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, KeyRound, Pencil, Plus, Shield, Trash2, UserRound, Users } from "lucide-react";
import { InviteDialog } from "@/components/fsl/OrgRegistry";
import { AddClubDialog, CategoriesDialog } from "@/components/fsl/TournamentClubAdd";
import { toast } from "sonner";
import { PageHeader } from "@/components/fsl/Primitives";
import { ProfileReviews } from "@/components/fsl/ProfileReviews";
import { ClubCrest } from "@/components/fsl/ClubCrest";
import { EmptyState, ErrorState, LoadingState } from "@/components/fsl/States";
import { useScoped, useTournamentDetail } from "@/hooks/useTournamentData";
import { api, apiError } from "@/lib/api";

export default function Clubs() {
  const { data: t } = useTournamentDetail();
  const clubs = useScoped("clubs");
  const comps = useScoped("competitions");
  const [open, setOpen] = useState(null);

  if (clubs.loading || !t) return <LoadingState />;
  if (clubs.error) return <ErrorState message={apiError(clubs.error)} onRetry={clubs.reload} />;
  const canWrite = ["super_admin", "director", "secretary"].includes(t.my_role) && !t.read_only;
  const done = (_data, opts) => { if (!opts?.keepOpen) setOpen(null); clubs.reload(); comps.reload(); };

  const deleteClub = async (c) => {
    const n = (c.teams || []).length;
    const msg = n ? `Togliere «${c.name}» da questo torneo? Le sue ${n} squadre e le relative rose verranno eliminate; nei gironi resta un segnaposto con le stesse gare (le gare già giocate bloccano l'operazione). La società resta nell'anagrafe FSL.` : `Togliere «${c.name}» da questo torneo? La società resta nell'anagrafe FSL.`;
    if (!window.confirm(msg)) return;
    try { const { data } = await api.delete(`/tournaments/${t.id}/clubs/${c.id}`, { params: n ? { force: true } : {} }); toast.success(`«${data.deleted}» tolta dal torneo${data.teams ? ` · ${data.teams} squadre eliminate` : ""}`); clubs.reload(); comps.reload(); } catch (e) { toast.error(apiError(e)); }
  };

  return (
    <div>
      <PageHeader
        kicker="Società partecipanti"
        title="Società"
        subtitle={`${clubs.data.length} società nel torneo. Le società si registrano a FSL una sola volta: qui scegli chi partecipa e in quali categorie (una squadra e una rosa per categoria). Il responsabile vede il torneo nella sua Area Società senza nuovi inviti.`}
        actions={canWrite && <button className="btn-primary" onClick={() => setOpen({ add: true })} data-testid="clubs-create-button"><Plus className="h-4 w-4" aria-hidden="true" /> Aggiungi società</button>}
      />
      <ProfileReviews tid={t.id} onDone={clubs.reload} />
      {!t.published && <p className="mb-4 text-xs text-fsl-warning" data-testid="clubs-unpublished-note">Il torneo non è ancora pubblicato: le homepage delle società sono visibili in anteprima solo allo staff loggato.</p>}
      {clubs.data.length === 0 ? (
        <EmptyState icon={Shield} title="Nessuna società" description="Aggiungi le società partecipanti dall'anagrafe FSL e scegli le categorie: le squadre si creano da sole." action={canWrite && <button className="btn-gold" onClick={() => setOpen({ add: true })}>Aggiungi società</button>} />
      ) : (
        <div className="fsl-card overflow-x-auto">
          <table className="w-full table-dark" data-testid="clubs-table">
            <thead>
              <tr>
                <th>Società</th>
                <th>Città</th>
                <th>Responsabile</th>
                <th>Categorie</th>
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
                  <td className="text-xs" data-testid={`club-manager-${c.slug}`}>
                    {c.manager ? <span className="inline-flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5 text-fsl-gold" /> {c.manager.full_name || c.manager.email}</span>
                      : canWrite ? <button className="btn-ghost h-8 text-xs text-fsl-warning" onClick={() => setOpen({ invite: c })} title="Nessun account: genera una volta sola il codice FSL con cui il responsabile si registra" data-testid={`club-invite-${c.slug}`}><KeyRound className="h-3.5 w-3.5" /> Nessun account · Codice FSL</button>
                      : <span className="text-fsl-slate">—</span>}
                  </td>
                  <td className="text-xs" data-testid={`club-categories-${c.slug}`}>
                    <div className="flex flex-wrap gap-1 items-center">
                      {(c.categories || []).map((cat) => <span key={cat} className="num rounded-full border border-fsl-gold/40 px-2 py-0.5 text-fsl-gold font-semibold">{cat}</span>)}
                      {(c.categories || []).length === 0 && <span className="text-fsl-warning">Nessuna squadra</span>}
                    </div>
                  </td>
                  <td className="text-xs">{c.crest_is_placeholder ? <span className="text-fsl-warning">Segnaposto</span> : <span className="text-fsl-success">Ufficiale</span>}</td>
                  <td className="text-right">
                    <div className="inline-flex gap-1">
                      {canWrite && <Link to={`/admin/t/${t.id}/societa/${c.id}`} className="btn-ghost h-9" data-testid={`club-edit-${c.slug}`}><Pencil className="h-4 w-4" aria-hidden="true" /> Modifica</Link>}
                      <Link to={`/tornei/${t.slug}/squadre/${c.slug}`} target="_blank" rel="noreferrer" className="btn-ghost h-9" data-testid={`club-homepage-${c.slug}`}><ExternalLink className="h-4 w-4" aria-hidden="true" /> Apri</Link>
                      <Link to={`/club/${c.org_club_id || c.slug}`} target="_blank" rel="noreferrer" className="btn-ghost h-9" title="Scheda società: tutti i tornei, i gruppi e le rose" data-testid={`club-entity-${c.slug}`}><Shield className="h-4 w-4" aria-hidden="true" /> Scheda</Link>
                    </div>
                  </td>
                  {canWrite && (
                    <td className="text-right">
                      <button className="btn-ghost h-9" onClick={() => setOpen({ categories: c })} data-testid={`club-add-team-${c.slug}`}><Users className="h-4 w-4" aria-hidden="true" /> Categorie</button>
                      <button className="btn-ghost h-9 text-fsl-danger" title="Togli dal torneo (con le sue squadre)" onClick={() => deleteClub(c)} data-testid={`club-delete-${c.slug}`}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open?.add && <AddClubDialog t={t} present={clubs.data} onClose={() => setOpen(null)} onDone={done} />}
      {open?.categories && <CategoriesDialog t={t} club={open.categories} onClose={() => setOpen(null)} onDone={done} />}
      {open?.invite && <InviteDialog club={{ org_key: open.invite.org_key || open.invite.org_club_id, name: open.invite.name }} onClose={() => setOpen(null)} />}
    </div>
  );
}
