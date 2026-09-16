import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Award, CalendarDays, Target } from "lucide-react";
import { ClubCrest } from "@/components/fsl/ClubCrest";
import { MatchCard, MatchStatusBadge, kickoffLabel } from "@/components/fsl/MatchCard";
import { RatingRow } from "@/components/fsl/Ratings";
import { AwardsBoard, OutcomesList } from "@/pages/admin/Extras";
import { PageHeader, SectionTitle } from "@/components/fsl/Primitives";
import { StandingsTable } from "@/components/fsl/StandingsTable";
import { EmptyState, ErrorState, LoadingState } from "@/components/fsl/States";
import { usePublicTournament } from "@/hooks/usePublicTournament";
import { api, apiError } from "@/lib/api";

const Wrap = ({ children }) => <div className="mx-auto max-w-[1488px] px-6 py-10">{children}</div>;

function useSlugData(path, params) {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const key = JSON.stringify(params || {});
  const reload = useCallback(() => api.get(`/public/tournaments/${slug}${path}`, { params }).then((r) => setData(r.data)).catch(setError), [slug, path, key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setData(null); reload(); }, [reload]);
  return { slug, data, error, reload };
}

export function PublicMatches() {
  const { data: home } = usePublicTournament();
  const [params, setParams] = useSearchParams();
  const cat = params.get("cat") || home?.settings?.categories?.[0] || "";
  const { slug, data, error } = useSlugData("/matches", cat ? { category: cat } : {});
  const groups = useMemo(() => { const g = {}; (data || []).forEach((m) => { const k = m.stage === "finals" ? `Fase finale · ${m.round_name}` : m.round_name; (g[k] = g[k] || []).push(m); }); return g; }, [data]);
  if (error) return <Wrap><ErrorState message={apiError(error)} /></Wrap>;
  if (!data || !home) return <LoadingState full />;
  return (
    <Wrap>
      <PageHeader kicker={home.tournament.name} title="Partite" subtitle="Risultati ufficiali e prossime gare. Un risultato in verifica non incide sulla classifica." actions={<select className="fsl-input w-40" value={cat} onChange={(e) => setParams({ cat: e.target.value })} data-testid="public-matches-category">{home.settings.categories.map((c) => <option key={c}>{c}</option>)}</select>} />
      {data.length === 0 ? <EmptyState icon={CalendarDays} title="Calendario in preparazione" description="Le gare compariranno dopo la pubblicazione del calendario." /> : Object.entries(groups).map(([round, ms]) => (
        <section key={round} className="mb-8"><SectionTitle right={<span className="text-xs text-fsl-slate num">{kickoffLabel(ms[0].kickoff_at).split(" · ")[0]}</span>}>{round}</SectionTitle><div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3" data-testid="public-matches-grid">{ms.map((m) => <MatchCard key={m.id} m={m} to={`/tornei/${slug}/partite/${m.id}`} />)}</div></section>
      ))}
    </Wrap>
  );
}

export function PublicMatchCenter() {
  const { matchId } = useParams();
  const { slug, data: m, error, reload } = useSlugData(`/matches/${matchId}`);
  useEffect(() => {
    if (!m || m.status !== "in_progress") return undefined;
    const id = setInterval(reload, 5000);
    return () => clearInterval(id);
  }, [m, reload]);
  if (error) return <Wrap><ErrorState message={apiError(error)} /></Wrap>;
  if (!m) return <LoadingState full />;
  const live = m.status === "in_progress";
  const hasScore = m.score.home !== null;
  const teamName = (id) => (id === m.home_team_id ? m.home.club?.name : m.away.club?.name);
  const LABEL = { goal: "Gol", own_goal: "Autogol", yellow_card: "Ammonizione", red_card: "Espulsione", substitution: "Sostituzione", injury: "Infortunio", mvp: "MVP" };
  return (
    <div>
      <section className="relative grain bg-navy-800 border-b border-white/10">
        <div className="mx-auto max-w-[1488px] px-6 py-10">
          <div className="flex items-center justify-between text-xs text-fsl-slate mb-4"><span className="fsl-kicker">{m.competition_name} · {m.round_name}</span><MatchStatusBadge status={m.status} label={m.display_status} /></div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
            <Link to={`/tornei/${slug}/squadre/${m.home.club?.slug}`} className="flex flex-col items-center text-center gap-3"><ClubCrest club={m.home.club} size={96} /><span className="font-display font-extrabold uppercase text-xl leading-none">{m.home.club?.name}</span></Link>
            <div className="text-center"><div className="font-display font-extrabold text-6xl sm:text-8xl num leading-none" data-testid="match-center-score">{hasScore ? `${m.score.home} - ${m.score.away}` : m.kickoff_at.slice(11, 16)}</div><div className={`text-xs uppercase tracking-wider mt-2 inline-flex items-center gap-2 ${live ? "text-fsl-danger" : "text-fsl-gold"}`} data-testid="match-center-status">{live && <span className="h-2 w-2 rounded-full bg-fsl-danger animate-pulse" />}{live ? "Live · aggiornamento automatico" : m.display_status}</div></div>
            <Link to={`/tornei/${slug}/squadre/${m.away.club?.slug}`} className="flex flex-col items-center text-center gap-3"><ClubCrest club={m.away.club} size={96} /><span className="font-display font-extrabold uppercase text-xl leading-none">{m.away.club?.name}</span></Link>
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-5 text-sm text-fsl-slate num"><span>{kickoffLabel(m.kickoff_at)}</span><span>{m.venue_name} · {m.field_name}</span>{m.referee_name && <span>Arbitro {m.referee_name}</span>}</div>
        </div>
      </section>
      <Wrap>
        <div className="grid lg:grid-cols-[1fr_1.3fr] gap-6">
          <div>
            <SectionTitle>Cronaca</SectionTitle>
            <div className="fsl-card divide-y divide-white/[0.06]" data-testid="match-center-events">
              {m.events.length === 0 && <p className="p-6 text-sm text-fsl-slate text-center">{hasScore ? "Nessun evento pubblicato." : "La cronaca sarà disponibile durante la gara."}</p>}
              {[...m.events].sort((a, b) => a.minute - b.minute).map((e) => <div key={e.id} className="flex items-center gap-3 px-4 h-12 text-sm"><span className="num font-display font-bold text-fsl-gold w-10">{e.minute}'</span><span className={`h-2.5 w-2.5 rounded-full ${e.type === "goal" ? "bg-fsl-success" : e.type === "yellow_card" ? "bg-fsl-warning" : e.type === "red_card" ? "bg-fsl-danger" : "bg-fsl-slate"}`} /><span className="font-semibold">{LABEL[e.type]}</span><span className="text-fsl-slate">{teamName(e.team_id)}</span><span className="ml-auto text-fsl-slate">{e.player_name}</span></div>)}
            </div>
            <SectionTitle>Forma recente</SectionTitle>
            <div className="space-y-2">{m.recent_form.slice(0, 5).map((r) => <MatchCard key={r.id} m={r} to={`/tornei/${slug}/partite/${r.id}`} compact />)}{m.recent_form.length === 0 && <p className="text-sm text-fsl-slate">Nessun risultato ufficiale precedente.</p>}</div>
          </div>
          <div><SectionTitle>Classifica</SectionTitle>{m.standings.length > 0 ? <StandingsTable competition={{ name: m.competition_name, code: m.competition_id, zones: {} }} rows={m.standings} clubBase={`/tornei/${slug}/squadre`} /> : <p className="text-sm text-fsl-slate">Classifica non disponibile per la fase finale.</p>}</div>
        </div>
        {m.ratings?.length > 0 && (
          <section className="mt-8" data-testid="match-center-ratings">
            <SectionTitle right={<span className="text-xs text-fsl-slate">Fantavoto = voto + bonus · MVP al miglior fantavoto</span>}>Pagelle</SectionTitle>
            <div className="grid md:grid-cols-2 gap-3">
              <div className="space-y-2">{m.ratings.filter((r) => r.side === "home").map((r, i) => <RatingRow key={i} r={r} />)}</div>
              <div className="space-y-2">{m.ratings.filter((r) => r.side === "away").map((r, i) => <RatingRow key={i} r={r} right />)}</div>
            </div>
          </section>
        )}
      </Wrap>
    </div>
  );
}

export function PublicStandingsLive() {
  const { data: home } = usePublicTournament();
  const [params, setParams] = useSearchParams();
  const cat = params.get("cat") || home?.settings?.categories?.[0] || "";
  const { slug, data, error } = useSlugData("/standings", cat ? { category: cat } : {});
  if (error) return <Wrap><ErrorState message={apiError(error)} /></Wrap>;
  if (!data || !home) return <LoadingState full />;
  return (
    <Wrap>
      <PageHeader kicker={home.tournament.name} title="Classifiche" subtitle="Solo risultati ufficiali o rettificati alimentano la classifica pubblica." actions={<select className="fsl-input w-40" value={cat} onChange={(e) => setParams({ cat: e.target.value })} aria-label="Categoria" data-testid="standings-category-select">{home.settings.categories.map((c) => <option key={c}>{c}</option>)}</select>} />
      <div className="grid xl:grid-cols-2 gap-4">{data.map((s) => <StandingsTable key={s.competition.id} competition={s.competition} rows={s.rows} clubBase={`/tornei/${slug}/squadre`} />)}</div>
    </Wrap>
  );
}

export function PublicStats() {
  const { data: home } = usePublicTournament();
  const { data, error } = useSlugData("/stats");
  if (error) return <Wrap><ErrorState message={apiError(error)} /></Wrap>;
  if (!data || !home) return <LoadingState full />;
  return (
    <Wrap>
      <PageHeader kicker={home.tournament.name} title="Statistiche" subtitle="Marcatori e numeri calcolati esclusivamente da gare ufficiali." />
      <div className="grid grid-cols-3 gap-3 mb-8">{[[data.matches_official, "Gare ufficiali"], [data.goals, "Gol"], [data.avg_goals, "Media gol/gara"]].map(([v, l]) => <div key={l} className="fsl-card p-5"><div className="font-display font-extrabold text-4xl num">{v}</div><div className="text-[11px] uppercase tracking-wider text-fsl-slate">{l}</div></div>)}</div>
      <SectionTitle>Marcatori</SectionTitle>
      {data.top_scorers.length === 0 ? <EmptyState icon={Target} title="Nessun marcatore" description="La classifica marcatori si popola con i gol delle gare ufficiali." /> : <div className="fsl-card divide-y divide-white/[0.06]" data-testid="public-top-scorers">{data.top_scorers.map((s, i) => <div key={i} className="flex items-center gap-4 px-4 h-14"><span className="num font-display font-extrabold text-2xl text-fsl-gold w-8">{i + 1}</span><div className="flex-1"><div className="font-semibold">{s.name}</div><div className="text-xs text-fsl-slate">{s.team}</div></div><span className="num font-display font-extrabold text-3xl">{s.goals}</span></div>)}</div>}
      <div className="mt-10"><SectionTitle right={<span className="text-xs text-fsl-slate inline-flex items-center gap-1"><Award className="h-4 w-4 text-fsl-gold" /> Dalle pagelle delle gare ufficiali</span>}>Premi e MVP</SectionTitle><AwardsBoard rows={data.awards} testId="public-awards" /></div>
      {data.outcomes?.length > 0 && <div className="mt-10"><SectionTitle>Esiti stagione</SectionTitle><OutcomesList outcomes={data.outcomes} testId="public-outcomes" /></div>}
    </Wrap>
  );
}
