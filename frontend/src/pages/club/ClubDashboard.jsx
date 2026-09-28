import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, CreditCard, FileText, Shield, Users } from "lucide-react";
import { KpiTile, PageHeader, SectionTitle } from "@/components/fsl/Primitives";
import { ClubCrest } from "@/components/fsl/ClubCrest";
import { RosterModulePanel } from "@/components/fsl/RosterImport";
import { EmptyState, ErrorState, LoadingState } from "@/components/fsl/States";
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

export default function ClubDashboard() {
  const { data, error, membership } = useMyClub();
  if (!membership) return <EmptyState icon={Shield} title="Nessuna società assegnata" description="Il tuo account non è collegato a una società in nessun torneo. Contatta la segreteria." testId="club-no-membership" />;
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
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiTile icon={Users} value={teams.length} label="Squadre iscritte" testId="club-kpi-teams" to="/societa/squadre" />
        <KpiTile icon={FileText} value={data.roster.players} label="Giocatori in rosa" hint={data.roster.expiring_documents ? `${data.roster.expiring_documents} documenti in scadenza` : "Rose e documenti"} testId="club-kpi-players" to="/societa/rose" />
        <KpiTile icon={CreditCard} value={`${data.payments.due.toFixed(2)} €`} label="Da pagare" hint={`Pagato ${data.payments.paid.toFixed(2)} €`} testId="club-kpi-payments" to="/societa/pagamenti" />
        <KpiTile icon={CalendarDays} value={data.next_match ? fmtDate(data.next_match.kickoff_at, { time: true }) : "—"} label="Prossima gara" hint={data.next_match ? `${data.next_match.home?.club?.short_name || data.next_match.home?.name || ""} – ${data.next_match.away?.club?.short_name || data.next_match.away?.name || ""}` : "Nessuna gara programmata"} testId="club-kpi-next" to={data.next_match ? `/societa/partite/${data.next_match.id}` : "/societa/calendario"} />
      </div>
      <section>
        <SectionTitle right={<Link to="/societa/squadre" className="text-xs text-fsl-gold hover:underline">Tutte le squadre</Link>}>Le nostre squadre</SectionTitle>
        {teams.length === 0 ? (
          <EmptyState icon={Users} title="Nessuna squadra iscritta" description="La segreteria del torneo iscriverà le tue squadre alle competizioni." />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {teams.map((t) => (
              <div key={t.id} className="fsl-card p-4" data-testid={`club-team-${t.id}`}>
                <div className="font-display font-extrabold text-2xl num">{t.category}</div>
                <div className="text-sm font-semibold">{t.name}</div>
                <div className="text-xs text-fsl-slate">{t.competition_name}</div>
              </div>
            ))}
          </div>
        )}
      </section>
      <RosterModulePanel tid={membership.tournament_id} teams={teams} />
    </div>
  );
}
