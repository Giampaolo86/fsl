import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, Copy, CreditCard, Crown, FileText, KeyRound, Shield, Trash2, UserRound, Users } from "lucide-react";
import { toast } from "sonner";
import { InviteMailForm } from "@/components/fsl/InviteMailForm";
import { ReadinessCard } from "@/components/fsl/ReadinessCard";
import { KpiTile } from "@/components/fsl/Primitives";
import { ClubCrest } from "@/components/fsl/ClubCrest";
import { ClubGroups } from "@/components/fsl/ClubGroups";
import { ErrorState, LoadingState } from "@/components/fsl/States";
import { useAuth } from "@/context/AuthContext";
import { api, apiError } from "@/lib/api";
import { fmtDate } from "@/lib/format";

export function useMyClub() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const membership = user.memberships.find((m) => m.role === "club_manager");
  useEffect(() => {
    if (!membership) return;
    api.get("/me/club", { params: { tournament_id: membership.tournament_id } }).then((r) => setData(r.data)).catch(setError);
  }, [membership]);
  return { data, error, membership };
}

function OrgOnlyDashboard() {
  const { user, updateUser } = useAuth();
  const [org, setOrg] = useState(null);
  const onLoaded = (d) => { setOrg(d.org); if (d.tournaments?.length) api.get("/auth/me").then((r) => updateUser({ memberships: (r.data.user || r.data).memberships })).catch(() => {}); };
  return (
    <div className="space-y-8" data-testid="club-org-dashboard">
      <section className="relative overflow-hidden rounded-xl border border-white/15 grain bg-navy-800">
        <div className="relative p-6 md:p-8 flex flex-wrap items-center gap-6">
          <div className="h-[88px] w-[88px] rounded-full bg-ink-950 border border-fsl-gold/40 flex items-center justify-center"><Shield className="h-10 w-10 text-fsl-gold" /></div>
          <div className="min-w-0 flex-1">
            <div className="fsl-kicker">Area Società</div>
            <h1 className="text-4xl sm:text-5xl font-extrabold leading-[0.92]" data-testid="club-dashboard-name">{org?.name || user.full_name}</h1>
            <p className="text-sm text-fsl-slate mt-2 max-w-2xl">Benvenuto! La tua società non è ancora iscritta a un torneo: aggiungi i gruppi (categoria e anno) che vuoi portare in campo e l'organizzazione li inviterà al torneo giusto. Nel frattempo puoi <Link to="/societa/profilo" className="text-fsl-gold hover:underline" data-testid="club-org-profile-link">completare il profilo della società</Link> (stemma, colori, contatti: vale per tutti i tornei) e seguire i tornei dal <Link to="/" className="text-fsl-gold hover:underline">portale pubblico</Link>.</p>
          </div>
        </div>
      </section>
      <ClubGroups onLoaded={onLoaded} />
    </div>
  );
}

export default function ClubDashboard() {
  const { data, error, membership } = useMyClub();
  if (!membership) return <OrgOnlyDashboard />;
  if (error) return <ErrorState message={apiError(error)} />;
  if (!data) return <LoadingState />;
  const { club, tournament, teams } = data;
  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-xl border border-white/15 grain" style={{ background: `linear-gradient(120deg, ${club.colors.primary} 0%, #041E32 70%)` }}>
        {club.cover_url && <img src={club.cover_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />}
        <div className="relative p-6 md:p-8 flex items-center gap-6">
          <ClubCrest club={club} size={88} />
          <div>
            <div className="fsl-kicker">{tournament.name}</div>
            <h1 className="text-4xl sm:text-5xl font-extrabold leading-[0.92]" data-testid="club-dashboard-name">{club.name}</h1>
            <p className="text-fsl-gold font-display uppercase text-sm tracking-wide mt-1">{club.motto}</p>
            {club.crest_is_placeholder && <p className="text-xs text-fsl-slate mt-2">Stemma segnaposto · <Link to="/societa/profilo" className="text-fsl-gold hover:underline">carica il tuo stemma ufficiale</Link> da «La mia homepage»</p>}
          </div>
        </div>
      </section>
      <ReadinessCard tid={membership.tournament_id} cid={membership.club_id} />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiTile icon={Users} value={teams.length} label="Squadre iscritte" testId="club-kpi-teams" to="/societa/squadre" />
        <KpiTile icon={FileText} value={data.roster.players} label="Giocatori in rosa" hint={data.roster.expiring_documents ? `${data.roster.expiring_documents} documenti in scadenza` : "Rose e documenti"} testId="club-kpi-players" to="/societa/rose" />
        <KpiTile icon={CreditCard} value={`${data.payments.due.toFixed(2)} €`} label="Da pagare" hint={`Pagato ${data.payments.paid.toFixed(2)} €`} testId="club-kpi-payments" to="/societa/pagamenti" />
        <KpiTile icon={CalendarDays} value={data.next_match ? fmtDate(data.next_match.kickoff_at, { time: true }) : "—"} label="Prossima gara" hint={data.next_match ? `${data.next_match.home?.club?.short_name || data.next_match.home?.name || ""} – ${data.next_match.away?.club?.short_name || data.next_match.away?.name || ""}` : "Nessuna gara programmata"} testId="club-kpi-next" to={data.next_match ? `/societa/partite/${data.next_match.id}` : "/societa/calendario"} />
      </div>
      <ClubGroups />
      <ClubManagersCard tid={membership.tournament_id} />
    </div>
  );
}

function ClubManagersCard({ tid }) {
  const [data, setData] = useState(null);
  const load = () => api.get("/me/club/invite", { params: { tournament_id: tid } }).then((r) => setData(r.data)).catch((e) => toast.error(apiError(e)));
  useEffect(() => { load(); }, [tid]); // eslint-disable-line react-hooks/exhaustive-deps
  const [sent, setSent] = useState(null);
  const gen = (body) => api.post("/me/club/invite", body || null, { params: { tournament_id: tid } }).then((r) => { setSent(body?.email ? r.data : null); toast.success(r.data.emailed ? `Email di benvenuto inviata a ${body.email}` : "Codice invito generato"); load(); }).catch((e) => toast.error(apiError(e)));
  if (!data) return null;
  const inv = data.valid ? data.invite : null;
  const link = inv ? `${window.location.origin}/registrati-societa?codice=${inv.code}` : "";
  const copy = (t) => navigator.clipboard?.writeText(t).then(() => toast.success("Copiato"));
  const remove = (m) => {
    if (!window.confirm(`Togliere ${m.full_name || m.email} dai dirigenti? Perderà subito l'accesso all'Area Società (l'account resta e potrà essere reinvitato).`)) return;
    api.delete(`/me/club/managers/${m.id}`, { params: { tournament_id: tid } }).then(() => { toast.success("Dirigente rimosso"); load(); }).catch((e) => toast.error(apiError(e)));
  };
  const handover = (m) => {
    if (!window.confirm(`Passare il ruolo di Responsabile a ${m.full_name || m.email}? Tu resterai dirigente con pieni poteri, ma solo il nuovo Responsabile potrà invitare, rimuovere dirigenti e passare di nuovo il ruolo.`)) return;
    api.post(`/me/club/managers/${m.id}/handover`, null, { params: { tournament_id: tid } }).then(() => { toast.success(`${m.full_name || m.email} è il nuovo Responsabile`); load(); }).catch((e) => toast.error(apiError(e)));
  };
  return (
    <section className="fsl-card p-5 md:p-6" data-testid="club-managers-card">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex-1 min-w-[240px]">
          <div className="fsl-section-title">Dirigenti della società</div>
          <p className="text-xs text-fsl-slate mt-1">Chi accede all'Area Società con pieni poteri (rose, convocazioni, documenti, pagamenti). Invita un altro dirigente con un codice: si registra su /registrati-societa e trova subito tutte le squadre della società.{data.can_manage ? " Se lasci la società, passa il ruolo di Responsabile a un dirigente con la corona." : ""}</p>
          <ul className="mt-3 space-y-1 text-sm" data-testid="club-managers-list">
            {data.managers.map((m) => <li key={m.id} className="flex items-center gap-2" data-testid={`club-manager-${m.id}`}><UserRound className="h-4 w-4 text-fsl-gold" /> <span className="font-semibold">{m.full_name || m.email}</span><span className="text-xs text-fsl-slate">{m.email}{m.id === data.responsabile_id ? " · responsabile" : ""}</span>{data.can_manage && m.id !== data.responsabile_id && <><button type="button" className="btn-ghost h-7 px-2 text-fsl-gold" onClick={() => handover(m)} title="Passa il ruolo di Responsabile" aria-label={`Nomina Responsabile ${m.full_name || m.email}`} data-testid={`club-manager-handover-${m.id}`}><Crown className="h-3.5 w-3.5" /></button><button type="button" className="btn-ghost h-7 px-2 text-fsl-danger" onClick={() => remove(m)} title="Rimuovi dirigente" aria-label={`Rimuovi ${m.full_name || m.email}`} data-testid={`club-manager-remove-${m.id}`}><Trash2 className="h-3.5 w-3.5" /></button></>}</li>)}
          </ul>
        </div>
        <div className="w-full sm:w-auto sm:min-w-[280px] space-y-2">
          <InviteMailForm onSend={gen} sent={sent} testPrefix="club-invite" />
          {inv ? (
            <>
              <code className="block text-center text-2xl font-mono tracking-widest rounded-lg bg-navy-700/60 border border-fsl-gold/40 px-4 py-3 select-all" data-testid="club-invite-code">{inv.code}</code>
              <p className="text-[11px] text-fsl-slate text-center">Valido fino al {fmtDate(inv.expires_at)} · una sola registrazione</p>
              <div className="flex gap-2"><button className="btn-primary flex-1 h-9" onClick={() => copy(link)} data-testid="club-invite-copy"><Copy className="h-4 w-4" /> Copia link</button><button className="btn-ghost h-9" onClick={() => gen()} data-testid="club-invite-regen">Rigenera</button></div>
            </>
          ) : <button className="btn-ghost w-full h-9 text-xs" onClick={() => gen()} data-testid="club-invite-generate"><KeyRound className="h-4 w-4" /> Genera solo il codice (senza email)</button>}
        </div>
      </div>
    </section>
  );
}
