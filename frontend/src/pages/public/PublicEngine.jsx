import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Award, CalendarDays, Target, TrendingUp, Trophy } from "lucide-react";
import { ClubCrest } from "@/components/fsl/ClubCrest";
import { MatchCard, MatchStatusBadge, kickoffLabel } from "@/components/fsl/MatchCard";
import { RatingsColumns } from "@/components/fsl/Ratings";
import { PlayerCardDialog } from "@/components/fsl/PlayerCard";
import { BadgeChip } from "@/components/fsl/BadgeChips";
import { SocialCard } from "@/components/fsl/SocialCard";
import { PublicShop } from "@/components/fsl/Shop";
import { FanReport } from "@/components/fsl/FanReport";
import { STAT_META } from "@/lib/fanta";
import { AwardsBoard, OutcomesList } from "@/pages/admin/Extras";
import { PageHeader, SectionTitle } from "@/components/fsl/Primitives";
import { StandingsTable } from "@/components/fsl/StandingsTable";
import { BracketSection } from "@/components/fsl/Bracket";
import { StatTile } from "@/components/fsl/ProfileKit";
import { EmptyState, ErrorState, LoadingState } from "@/components/fsl/States";
import { usePublicTournament } from "@/hooks/usePublicTournament";
import { api, apiError } from "@/lib/api";

const Wrap = ({ children, gold = false }) => <div className={`mx-auto max-w-[1488px] px-6 py-10 ${gold ? "gold-skin" : ""}`}>{children}</div>;

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
    <Wrap gold>
      <PageHeader kicker={home.tournament.name} title="Partite" subtitle="Risultati ufficiali e prossime gare. Un risultato in verifica non incide sulla classifica." actions={<select className="fsl-input w-40" value={cat} onChange={(e) => setParams({ cat: e.target.value })} data-testid="public-matches-category">{home.settings.categories.map((c) => <option key={c}>{c}</option>)}</select>} />
      <BracketSection slug={slug} category={cat} className="mb-10" />
      {data.length === 0 ? <EmptyState icon={CalendarDays} title="Calendario in preparazione" description="Le gare compariranno dopo la pubblicazione del calendario." /> : Object.entries(groups).map(([round, ms]) => (
        <section key={round} className="mb-8"><SectionTitle right={<span className="text-xs text-fsl-slate num">{kickoffLabel(ms[0].kickoff_at).split(" · ")[0]}</span>}>{round}</SectionTitle><div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3" data-testid="public-matches-grid">{ms.map((m) => <MatchCard key={m.id} m={m} to={`/tornei/${slug}/partite/${m.id}`} />)}</div></section>
      ))}
    </Wrap>
  );
}

export function PublicMatchCenter() {
  const { matchId } = useParams();
  const { slug, data: m, error, reload } = useSlugData(`/matches/${matchId}`);
  const [openPlayer, setOpenPlayer] = useState(null);
  const fetchCard = useCallback((pid) => api.get(`/public/tournaments/${slug}/players/${pid}`), [slug]);
  useEffect(() => {
    if (!m || m.status !== "in_progress") return undefined;
    const id = setInterval(reload, 5000);
    return () => clearInterval(id);
  }, [m, reload]);
  if (error) return <Wrap><ErrorState message={apiError(error)} /></Wrap>;
  if (!m) return <LoadingState full />;
  const live = m.status === "in_progress";
  const hasScore = m.score.home !== null;
  const episodes = ["goal", "own_goal", "penalty_saved", "yellow_card", "red_card"].map((t) => [t, m.events.filter((e) => e.type === t)]).filter(([, l]) => l.length);
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
            <SectionTitle right={<span className="text-xs text-fsl-slate">Dati del tabellino ufficiale</span>}>Tabellino</SectionTitle>
            <div className="fsl-card divide-y divide-white/[0.06]" data-testid="match-center-events">
              {episodes.length === 0 && <p className="p-6 text-sm text-fsl-slate text-center">{hasScore ? "Nessun episodio registrato." : "Il tabellino sarà disponibile durante la gara."}</p>}
              {episodes.map(([type, list]) => (
                <div key={type} className="px-4 py-3 grid grid-cols-[1fr_auto_1fr] gap-3 items-start text-sm">
                  <div className="space-y-1 text-right">{list.filter((e) => e.team_id === m.home_team_id).map((e) => <div key={e.id}>{e.player_id ? <button onClick={() => setOpenPlayer(e.player_id)} className="hover:text-fsl-gold" data-testid={`episode-player-${e.player_id}`}>{e.player_name}</button> : <span className="text-fsl-slate">{e.player_name || "—"}</span>}</div>)}</div>
                  <span className="h-6 px-2 rounded-full bg-navy-700 text-[10px] font-bold uppercase inline-flex items-center gap-1 self-start"><span className={`h-2 w-2 rounded-full ${type === "goal" ? "bg-fsl-success" : type === "yellow_card" ? "bg-fsl-warning" : type === "red_card" ? "bg-fsl-danger" : "bg-fsl-slate"}`} />{STAT_META[type].label}</span>
                  <div className="space-y-1">{list.filter((e) => e.team_id === m.away_team_id).map((e) => <div key={e.id}>{e.player_id ? <button onClick={() => setOpenPlayer(e.player_id)} className="hover:text-fsl-gold" data-testid={`episode-player-${e.player_id}`}>{e.player_name}</button> : <span className="text-fsl-slate">{e.player_name || "—"}</span>}</div>)}</div>
                </div>
              ))}
            </div>
            <SectionTitle>Forma recente</SectionTitle>
            <div className="space-y-2">{m.recent_form.slice(0, 5).map((r) => <MatchCard key={r.id} m={r} to={`/tornei/${slug}/partite/${r.id}`} compact />)}{m.recent_form.length === 0 && <p className="text-sm text-fsl-slate">Nessun risultato ufficiale precedente.</p>}</div>
          </div>
          <div><SectionTitle>Classifica</SectionTitle>{m.standings.length > 0 ? <StandingsTable competition={{ name: m.competition_name, code: m.competition_id, zones: {} }} rows={m.standings} clubBase={`/tornei/${slug}/squadre`} /> : <p className="text-sm text-fsl-slate">Classifica non disponibile per la fase finale.</p>}</div>
        </div>
        {m.ratings?.length > 0 && (
          <section className="mt-8" data-testid="match-center-ratings">
            <SectionTitle right={<span className="text-xs text-fsl-slate">Voto base 6 · bonus/malus dal tabellino · MVP in oro</span>}>Pagelle</SectionTitle>
            <RatingsColumns rows={m.ratings} home={m.home.club?.name} away={m.away.club?.name} onOpen={setOpenPlayer} />
          </section>
        )}
        {m.badges_unlocked?.length > 0 && (
          <section className="mt-8" data-testid="match-center-badges">
            <SectionTitle right={<span className="text-xs text-fsl-slate">Assegnati automaticamente all'ufficializzazione</span>}>Badge sbloccati</SectionTitle>
            <div className="flex flex-wrap gap-2">{m.badges_unlocked.map((b, i) => <span key={i} className="inline-flex items-center gap-2 h-9 pl-1 pr-3 rounded-full border border-fsl-gold/40 bg-navy-800 text-sm"><BadgeChip b={b} small /><span className="text-fsl-slate">{b.player}</span></span>)}</div>
          </section>
        )}
        <PublicShop slug={slug} matchId={matchId} />
        <FanReport slug={slug} matchId={matchId} />
        {hasScore && (
          <section className="mt-8" data-testid="match-center-social">
            <SectionTitle right={<span className="text-xs text-fsl-slate">Scarica o condividi su WhatsApp, Instagram, Messaggi</span>}>Social Match Center</SectionTitle>
            <SocialCard url={`/public/tournaments/${slug}/matches/${matchId}/social`} version={`${m.status}-${m.score.home}-${m.score.away}-${m.ratings?.length}`} />
          </section>
        )}
      </Wrap>
      <PlayerCardDialog playerId={openPlayer} onClose={() => setOpenPlayer(null)} fetcher={fetchCard} />
    </div>
  );
}

export function PublicStandingsLive() {
  const { data: home } = usePublicTournament();
  const [params, setParams] = useSearchParams();
  const cat = params.get("cat") || home?.settings?.categories?.[0] || "";
  const { slug, data, error } = useSlugData("/standings", cat ? { category: cat } : {});
  const setP = (k, v) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p); };
  if (error) return <Wrap><ErrorState message={apiError(error)} /></Wrap>;
  if (!data || !home) return <LoadingState full />;
  const list = data.filter((s) => !cat || s.competition.category === cat);
  const serie = list.find((s) => s.competition.id === params.get("serie")) || list[0];
  return (
    <Wrap>
      <PageHeader kicker={home.tournament.name} title="Classifiche" subtitle="Solo risultati ufficiali o rettificati alimentano la classifica pubblica." actions={<select className="fsl-input w-40" value={cat} onChange={(e) => setParams({ cat: e.target.value })} aria-label="Categoria" data-testid="standings-category-select">{home.settings.categories.map((c) => <option key={c}>{c}</option>)}</select>} />
      {list.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-5" role="tablist" aria-label="Serie o girone" data-testid="standings-serie-tabs">
          {list.map((s) => <button key={s.competition.id} role="tab" aria-selected={serie?.competition.id === s.competition.id} onClick={() => setP("serie", s.competition.id)} className={`h-10 px-4 rounded-full font-display font-bold uppercase text-sm tracking-wide border transition-colors ${serie?.competition.id === s.competition.id ? "bg-fsl-gold text-ink-950 border-fsl-gold" : "border-fsl-gold/40 text-fsl-white hover:bg-fsl-gold/10"}`} data-testid={`standings-serie-tab-${s.competition.code}`}>{s.competition.series}<span className="ml-2 num text-xs opacity-70">{s.rows.length}</span></button>)}
        </div>
      )}
      {serie ? <StandingsTable key={serie.competition.id} competition={serie.competition} rows={serie.rows} clubBase={`/tornei/${slug}/squadre`} /> : <EmptyState icon={Trophy} title="Nessuna classifica" description="Le classifiche compariranno con le prime gare ufficiali." />}
    </Wrap>
  );
}

export function PublicStats() {
  const { data: home } = usePublicTournament();
  const { slug, data, error } = useSlugData("/stats");
  if (error) return <Wrap><ErrorState message={apiError(error)} /></Wrap>;
  if (!data || !home) return <LoadingState full />;
  return (
    <Wrap gold>
      <PageHeader kicker={home.tournament.name} title="Statistiche" subtitle="Marcatori e numeri calcolati esclusivamente da gare ufficiali." />
      <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-8 max-w-3xl" data-testid="public-stats-tiles">{[[CalendarDays, data.matches_official, "Gare ufficiali"], [Target, data.goals, "Gol"], [TrendingUp, data.avg_goals, "Media gol/gara"]].map(([Icon, v, l]) => <StatTile key={l} icon={Icon} value={v} label={l} />)}</div>
      <SectionTitle>Marcatori</SectionTitle>
      {data.top_scorers.length === 0 ? <EmptyState icon={Target} title="Nessun marcatore" description="La classifica marcatori si popola con i gol delle gare ufficiali." /> : <div className="fsl-card divide-y divide-white/[0.06]" data-testid="public-top-scorers">{data.top_scorers.map((s, i) => <div key={i} className="flex items-center gap-4 px-4 h-14"><span className="num font-display font-extrabold text-2xl text-fsl-gold w-8">{i + 1}</span><div className="flex-1">{s.player_id ? <Link to={`/tornei/${slug}/giocatori/${s.player_id}`} className="font-semibold hover:text-fsl-gold" data-testid={`scorer-player-${s.player_id}`}>{s.name}</Link> : <div className="font-semibold">{s.name}</div>}<div className="text-xs text-fsl-slate">{s.team}</div></div><span className="num font-display font-extrabold text-3xl">{s.goals}</span></div>)}</div>}
      <div className="mt-10"><SectionTitle right={<span className="text-xs text-fsl-slate inline-flex items-center gap-1"><Award className="h-4 w-4 text-fsl-gold" /> Dalle pagelle delle gare ufficiali</span>}>Premi e MVP</SectionTitle><AwardsBoard rows={data.awards} testId="public-awards" linkFor={(pid) => `/tornei/${slug}/giocatori/${pid}`} /></div>
      {data.outcomes?.length > 0 && <div className="mt-10"><SectionTitle>Esiti stagione</SectionTitle><OutcomesList outcomes={data.outcomes} testId="public-outcomes" /></div>}
    </Wrap>
  );
}
