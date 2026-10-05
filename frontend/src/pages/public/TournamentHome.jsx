import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, FileDown, BarChart3, CalendarDays, Grid3X3, Shield, Trophy, Users, Volleyball } from "lucide-react";
import { ClubCrest } from "@/components/fsl/ClubCrest";
import { FavButton } from "@/components/fsl/FavButton";
import { FeaturedNews, HomeHeading, InterviewsBlock, ShopShowcase } from "@/components/fsl/HomeSections";
import { MatchCard } from "@/components/fsl/MatchCard";
import { BracketSection } from "@/components/fsl/Bracket";
import { HospitalitySection } from "@/components/fsl/Hospitality";
import { ShopStrip } from "@/components/fsl/ShopStrip";
import { EmptyState, ErrorState, LoadingState } from "@/components/fsl/States";
import { usePublicTournament } from "@/hooks/usePublicTournament";
import { apiError } from "@/lib/api";
import { fmtNum } from "@/lib/format";

const HERO = "https://images.unsplash.com/photo-1574629810360-7efbbe195018?crop=entropy&cs=srgb&fm=jpg&q=80&w=1800";

export function CategorySelector({ categories, value, onChange }) {
  return (
    <select className="fsl-input w-40" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Categoria" data-testid="public-category-select">
      {categories.map((c) => <option key={c} value={c}>{c}</option>)}
    </select>
  );
}

function Panel({ title, right, children, testId }) {
  return (
    <div className="fsl-card p-5 flex flex-col" data-testid={testId}>
      <div className="flex items-center justify-between mb-4"><h3 className="font-display font-bold uppercase text-xl">{title}</h3>{right}</div>
      {children}
    </div>
  );
}

export default function TournamentHome() {
  const { slug, data, error, reload } = usePublicTournament();
  const [cat, setCat] = useState("");
  if (error) return <div className="p-6"><ErrorState message={apiError(error)} onRetry={reload} /></div>;
  if (!data) return <LoadingState full />;
  const { tournament: t, settings: s, summary, clubs, numbers } = data;
  const category = cat || s.categories[0];
  const changeCat = (c) => { setCat(c); reload(c); };
  const goldLink = (to, label, testId) => <Link to={to} className="text-xs text-fsl-gold hover:underline" data-testid={testId}>{label}</Link>;

  return (
    <div className="pb-24">
      <section className="relative overflow-hidden grain min-h-[60vh] md:min-h-[72vh] flex items-end">
        <img src={t.visual?.cover_url || HERO} alt="" className="absolute inset-0 h-full w-full object-cover scale-105" />
        <div className="absolute inset-0 hero-overlay" />
        <div className="relative mx-auto max-w-[1488px] w-full px-6 pb-20 pt-28">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <span className="fsl-kicker">{t.season_label}</span>
            <CategorySelector categories={s.categories} value={category} onChange={changeCat} />
          </div>
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold leading-[0.9] max-w-3xl" data-testid="public-tournament-title">{t.name}</h1>
          <div className="mt-3"><FavButton kind="tournaments" id={slug} label="Segui il torneo" /></div>
          <p className="mt-4 text-fsl-white/90 text-base md:text-lg num">{fmtNum(summary.teams_capacity)} squadre. {s.categories.length} categorie. Una sola ambizione.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to={`/tornei/${slug}/squadre`} className="btn-gold" data-testid="public-hero-cta-teams">Scopri le squadre <ArrowRight className="h-4 w-4" /></Link>
            <Link to="/codice-fsl" className="btn-ghost" data-testid="public-hero-cta-rules">Codice FSL</Link>
            {data.program_pdf_public && <a href={`${process.env.REACT_APP_BACKEND_URL}/api/public/tournaments/${slug}/program.pdf`} className="btn-ghost" data-testid="public-program-pdf"><FileDown className="h-4 w-4" /> Scarica il programma</a>}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1488px] px-6 -mt-10 relative z-10">
        <div className="rounded-xl bg-fsl-blue border border-fsl-blue-light/40 grid grid-cols-2 lg:grid-cols-4 divide-x divide-white/15 shadow-elev" data-testid="public-numbers-strip">
          {[[Volleyball, fmtNum(summary.matches_total), "Partite"], [Users, fmtNum(summary.teams_capacity), "Squadre"], [Trophy, numbers.competitions, "Campionati"], [Grid3X3, numbers.fields, "Campi"]].map(([Icon, v, l]) => (
            <div key={l} className="flex items-center gap-4 px-6 py-5 transition-transform duration-300 hover:-translate-y-0.5">
              <Icon className="h-8 w-8 text-fsl-white/80 shrink-0" aria-hidden="true" />
              <div><div className="font-display font-extrabold text-4xl num leading-none">{v}</div><div className="text-[11px] uppercase tracking-wider text-fsl-white/80">{l}</div></div>
            </div>
          ))}
        </div>
      </section>

      <BracketSection slug={slug} category={category} className="mx-auto max-w-[1488px] px-6 mt-16" />
      <HospitalitySection slug={slug} className="mx-auto max-w-[1488px] px-6 mt-16" />

      <section className="mx-auto max-w-[1488px] px-6 mt-16" data-testid="home-upcoming-section">
        <HomeHeading icon={CalendarDays} kicker={`Categoria ${category}`} title="Prossime partite" right={<Link to={`/tornei/${slug}/partite?cat=${category}`} className="btn-ghost" data-testid="home-calendar-link">Calendario completo <ArrowRight className="h-4 w-4" /></Link>} />
        {data.upcoming_matches.length === 0 ? <EmptyState icon={CalendarDays} title="Calendario in preparazione" description="Le gare compariranno qui dopo la pubblicazione del calendario da parte dell'organizzazione." testId="public-empty-matches" /> : (
          <div className="flex overflow-x-auto snap-x snap-mandatory gap-4 pb-4 -mx-6 px-6 md:mx-0 md:px-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:overflow-visible" data-testid="public-upcoming">
            {data.upcoming_matches.map((m) => <div key={m.id} className="snap-start shrink-0 w-[85vw] sm:w-[360px] md:w-auto transition-transform duration-300 hover:-translate-y-1"><MatchCard m={m} to={`/tornei/${slug}/partite/${m.id}`} /></div>)}
          </div>
        )}
      </section>

      <FeaturedNews slug={slug} posts={data.news || []} />
      <InterviewsBlock slug={slug} items={data.interviews || []} />
      <ShopShowcase slug={slug} items={data.shop || []} prices={data.prices} />
      <ShopStrip slug={slug} placement="tournament_home" className="mx-auto max-w-[1488px] px-6 mt-16" />

      <section className="mx-auto max-w-[1488px] px-6 mt-20" data-testid="home-dashboard">
        <HomeHeading icon={BarChart3} kicker="Solo risultati ufficiali" title="Risultati, classifica e marcatori" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Panel title="Ultimi risultati" right={goldLink(`/tornei/${slug}/partite?cat=${category}`, "Tutte le gare", "home-results-link")} testId="public-results">
            <div className="space-y-3">{data.recent_results.length === 0 ? <p className="text-sm text-fsl-slate">Nessun risultato ufficiale ancora pubblicato.</p> : data.recent_results.slice(0, 4).map((m) => <MatchCard key={m.id} m={m} to={`/tornei/${slug}/partite/${m.id}`} compact />)}</div>
          </Panel>
          <Panel title={`Classifica ${category}`} right={goldLink(`/tornei/${slug}/classifiche?cat=${category}`, "Tutte", "home-standings-link")} testId="public-mini-standings">
            <div className="space-y-4">
              {data.standings.map((st) => (
                <div key={st.competition.id}><div className="text-xs font-semibold uppercase text-fsl-slate mb-1">{st.competition.series}</div>
                  {st.rows.map((r) => <div key={r.team_id} className="flex items-center gap-2 h-9 text-sm border-b border-white/[0.06] last:border-0 hover:bg-white/5 rounded px-1 -mx-1 transition-colors"><span className="num w-5 text-fsl-gold font-bold">{r.pos}</span><ClubCrest club={r.club} size={20} /><span className="flex-1 truncate">{r.club?.name || r.name}</span><span className="num text-xs text-fsl-slate">{r.PG}</span><span className="num font-display font-extrabold text-lg w-8 text-right">{r.PT}</span></div>)}
                </div>
              ))}
              {data.standings.length === 0 && <p className="text-sm text-fsl-slate">Classifiche disponibili dopo le prime gare ufficiali.</p>}
            </div>
          </Panel>
          <Panel title="Marcatori" right={goldLink(`/tornei/${slug}/statistiche`, "Statistiche", "home-stats-link")} testId="public-top-scorers-home">
            <div className="divide-y divide-white/[0.06]">{data.top_scorers.length === 0 ? <p className="text-sm text-fsl-slate">Nessun gol ufficiale ancora registrato.</p> : data.top_scorers.slice(0, 8).map((sc, i) => <div key={i} className="flex items-center gap-3 h-11 text-sm hover:bg-white/5 rounded px-1 -mx-1 transition-colors"><span className="fsl-kicker w-6">{i + 1}</span>{sc.photo_url ? <img src={sc.photo_url} alt="" className="h-8 w-8 rounded-full object-cover border border-white/20" /> : <span className="h-8 w-8 rounded-full bg-navy-700 inline-flex items-center justify-center text-xs font-bold">{sc.name[0]}</span>}<span className="flex-1 truncate">{sc.player_id ? <Link to={`/tornei/${slug}/giocatori/${sc.player_id}`} className="hover:text-fsl-gold" data-testid={`home-scorer-${sc.player_id}`}>{sc.name}</Link> : sc.name} <span className="text-fsl-slate text-xs">· {sc.team}</span></span><span className="num font-display font-extrabold text-xl">{sc.goals}</span></div>)}</div>
          </Panel>
        </div>
      </section>

      <section className="mx-auto max-w-[1488px] px-6 mt-20">
        <HomeHeading icon={Shield} kicker={`${clubs.length} società`} title="Le squadre" right={<Link to={`/tornei/${slug}/squadre`} className="btn-ghost" data-testid="home-clubs-link">Tutte le squadre <ArrowRight className="h-4 w-4" /></Link>} />
        {clubs.length === 0 ? (
          <EmptyState icon={Shield} title="Società in arrivo" description="Le società invitate saranno pubblicate a breve." />
        ) : (
          <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4" data-testid="public-club-grid">
            {clubs.slice(0, 16).map((c) => (
              <Link key={c.id} to={`/tornei/${slug}/squadre/${c.slug}`} className="flex flex-col items-center text-center gap-2 opacity-70 hover:opacity-100 transition-opacity" data-testid={`public-club-${c.slug}`}>
                <ClubCrest club={c} size={56} />
                <span className="text-[11px] sm:text-xs font-semibold leading-tight max-w-[110px] line-clamp-2">{c.name}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
