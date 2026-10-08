import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, CreditCard, FileText, Shield, Users } from "lucide-react";
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
            <p className="text-sm text-fsl-slate mt-2 max-w-2xl">Benvenuto! La tua società non è ancora iscritta a un torneo: aggiungi i gruppi (categoria e anno) che vuoi portare in campo e l'organizzazione li inviterà al torneo giusto. Nel frattempo puoi seguire i tornei dal <Link to="/" className="text-fsl-gold hover:underline">portale pubblico</Link>.</p>
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
    </div>
  );
}
