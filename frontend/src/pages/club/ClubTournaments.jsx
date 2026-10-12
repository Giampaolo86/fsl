import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BarChart3, CalendarDays, Newspaper, Star, Trophy, Users } from "lucide-react";
import { PageHeader } from "@/components/fsl/Primitives";
import { EmptyState, LoadingState } from "@/components/fsl/States";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/format";

const LINKS = [
  ["", "Entra nel torneo", Trophy, "home"],
  ["/classifiche", "Classifiche", BarChart3, "standings"],
  ["/partite", "Partite e risultati", CalendarDays, "matches"],
  ["/statistiche", "Marcatori e statistiche", Star, "stats"],
  ["/top11", "Top 11", Users, "top11"],
  ["/news", "News e blog", Newspaper, "news"],
];

function TeamLine({ slug, team }) {
  const [d, setD] = useState(null);
  useEffect(() => { api.get(`/public/tournaments/${slug}/teams/${team.id}`).then((r) => setD(r.data)).catch(() => setD({})); }, [slug, team.id]);
  const st = d?.standing;
  const next = (d?.matches || []).find((m) => m.status !== "final" && m.status !== "validated");
  const last = [...(d?.matches || [])].reverse().find((m) => m.status === "final" || m.status === "validated");
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm py-2 border-t border-white/10 first:border-0" data-testid={`club-tournament-team-${team.id}`}>
      <span className="font-display font-extrabold text-xl num text-fsl-gold w-14">{team.category}</span>
      <Link to={`/tornei/${slug}/squadre/${d?.club?.slug || "x"}/gruppi/${team.id}`} className="font-semibold hover:text-fsl-gold">{team.name}</Link>
      <span className="text-xs text-fsl-slate">{team.competition_name || "Girone da assegnare"}</span>
      {st && <span className="text-xs num" data-testid={`club-tournament-standing-${team.id}`}><span className="text-fsl-gold font-bold">{st.pos}°</span> su {st.total} · {st.PT} pt · {st.PG} gare · {st.V}V {st.N}N {st.P}P</span>}
      {last && <span className="text-xs text-fsl-slate num">Ultima: {last.home?.name} {last.score?.home ?? ""}-{last.score?.away ?? ""} {last.away?.name}</span>}
      {next && <span className="text-xs text-fsl-slate num ml-auto">Prossima: {fmtDate(next.kickoff_at)} · vs {next.home?.id === team.id ? next.away?.name : next.home?.name}</span>}
    </div>
  );
}

export default function ClubTournaments() {
  const [data, setData] = useState(null);
  useEffect(() => { api.get("/me/club/overview").then((r) => setData(r.data)).catch(() => setData({ tournaments: [] })); }, []);
  if (!data) return <LoadingState />;
  const blocks = data.tournaments || [];
  return (
    <div className="space-y-6" data-testid="club-tournaments-page">
      <PageHeader kicker="Area Società" title="I nostri tornei" subtitle="I tornei a cui partecipa la società: entra nel torneo, segui classifiche, partite, risultati, marcatori e news con le tue squadre in evidenza." />
      {blocks.length === 0 ? (
        <EmptyState title="Nessun torneo in corso" description="Quando una tua squadra viene ammessa a una competizione, il torneo compare qui. Dalla pagina Squadre puoi chiedere la partecipazione ai tornei pubblicati." action={<Link to="/societa/squadre" className="btn-gold" data-testid="club-tournaments-go-teams">Squadre e rose <ArrowRight className="h-4 w-4" /></Link>} />
      ) : blocks.map((b) => (
        <section key={b.tournament.id} className="fsl-card p-5 space-y-4" data-testid={`club-tournament-${b.tournament.id}`}>
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="fsl-kicker">{b.tournament.status === "active" ? "In corso" : b.tournament.status === "archived" ? "Concluso" : "In preparazione"}</div>
              <h2 className="font-display font-extrabold uppercase text-2xl leading-none">{b.tournament.name}</h2>
            </div>
            <Link to={`/tornei/${b.tournament.slug}`} className="btn-gold h-10" data-testid={`club-tournament-enter-${b.tournament.id}`}><Trophy className="h-4 w-4" /> Entra nel torneo</Link>
          </div>
          <div>{(b.groups || []).filter((g) => g.status !== "pending").map((g) => <TeamLine key={g.id} slug={b.tournament.slug} team={g} />)}</div>
          <div className="flex flex-wrap gap-2">
            {LINKS.slice(1).map(([path, label, Icon, key]) => <Link key={key} to={`/tornei/${b.tournament.slug}${path}`} className="btn-ghost h-9 text-xs" data-testid={`club-tournament-${key}-${b.tournament.id}`}><Icon className="h-3.5 w-3.5" /> {label}</Link>)}
            <Link to="/societa/calendario" className="btn-ghost h-9 text-xs ml-auto" data-testid={`club-tournament-calendar-${b.tournament.id}`}><CalendarDays className="h-3.5 w-3.5" /> Il nostro calendario</Link>
          </div>
        </section>
      ))}
    </div>
  );
}
