import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BarChart3, CalendarDays, Grid3X3, Shield, Trophy, Users, Volleyball } from "lucide-react";
import { ClubCrest } from "@/components/fsl/ClubCrest";
import { SectionTitle } from "@/components/fsl/Primitives";
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

export default function TournamentHome() {
  const { slug, data, error, reload } = usePublicTournament();
  const [cat, setCat] = useState("");
  if (error) return <div className="p-6"><ErrorState message={apiError(error)} onRetry={reload} /></div>;
  if (!data) return <LoadingState full />;
  const { tournament: t, settings: s, summary, clubs, numbers, competitions } = data;
  const category = cat || s.categories[0];
  const catComps = competitions.filter((c) => c.category === category);

  return (
    <div>
      <section className="relative overflow-hidden grain min-h-[560px] flex items-end">
        <img src={t.visual?.cover_url || HERO} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 hero-overlay" />
        <div className="relative mx-auto max-w-[1488px] w-full px-6 pb-12 pt-28">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <span className="fsl-kicker">{t.season_label}</span>
            <CategorySelector categories={s.categories} value={category} onChange={setCat} />
          </div>
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold leading-[0.9] max-w-3xl" data-testid="public-tournament-title">{t.name}</h1>
          <p className="mt-4 text-fsl-white/90 text-base md:text-lg num">{fmtNum(summary.teams_capacity)} squadre. {s.categories.length} categorie. Una sola ambizione.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to={`/tornei/${slug}/squadre`} className="btn-gold" data-testid="public-hero-cta-teams">Scopri le squadre <ArrowRight className="h-4 w-4" /></Link>
            <Link to={`/tornei/${slug}/regolamento`} className="btn-ghost" data-testid="public-hero-cta-rules">Formula e regolamento</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1488px] px-6 -mt-8 relative">
        <div className="rounded-xl bg-fsl-blue border border-fsl-blue-light/40 grid grid-cols-2 lg:grid-cols-4 divide-x divide-white/15 shadow-elev" data-testid="public-numbers-strip">
          {[
            [Volleyball, fmtNum(summary.matches_total), "Partite"],
            [Users, fmtNum(summary.teams_capacity), "Squadre"],
            [Trophy, numbers.competitions, "Campionati"],
            [Grid3X3, numbers.fields, "Campi"],
          ].map(([Icon, v, l]) => (
            <div key={l} className="flex items-center gap-4 px-6 py-5">
              <Icon className="h-8 w-8 text-fsl-white/80 shrink-0" aria-hidden="true" />
              <div><div className="font-display font-extrabold text-4xl num leading-none">{v}</div><div className="text-[11px] uppercase tracking-wider text-fsl-white/80">{l}</div></div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1488px] px-6 mt-10 grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <SectionTitle right={<Link to={`/tornei/${slug}/partite`} className="text-xs text-fsl-gold hover:underline">Vedi calendario</Link>}>Prossime partite</SectionTitle>
          <EmptyState icon={CalendarDays} title="Calendario in preparazione" description="Le gare compariranno qui dopo la pubblicazione del calendario da parte dell'organizzazione." testId="public-empty-matches" />
        </div>
        <div>
          <SectionTitle right={<Link to={`/tornei/${slug}/classifiche`} className="text-xs text-fsl-gold hover:underline">Tutte</Link>}>Classifica {category}</SectionTitle>
          <div className="fsl-card p-5 space-y-3" data-testid="public-mini-standings">
            {catComps.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-sm">
                <span className="font-semibold">{c.series}</span>
                <span className="text-xs text-fsl-slate num">{c.teams_registered}/{c.teams_count} squadre · {c.rounds} giornate</span>
              </div>
            ))}
            <p className="text-xs text-fsl-slate flex items-center gap-2 pt-2 border-t border-white/10"><BarChart3 className="h-4 w-4 text-fsl-gold" /> La classifica si popola solo con risultati ufficiali.</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1488px] px-6 mt-10">
        <SectionTitle right={<Link to={`/tornei/${slug}/squadre`} className="text-xs text-fsl-gold hover:underline">Tutte le squadre</Link>}>Le squadre</SectionTitle>
        {clubs.length === 0 ? (
          <EmptyState icon={Shield} title="Società in arrivo" description="Le società invitate saranno pubblicate a breve." />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3" data-testid="public-club-grid">
            {clubs.slice(0, 16).map((c) => (
              <Link key={c.id} to={`/tornei/${slug}/squadre/${c.slug}`} className="fsl-card p-3 flex flex-col items-center text-center gap-2 hover:border-fsl-gold/50 transition-colors" data-testid={`public-club-${c.slug}`}>
                <ClubCrest club={c} size={52} />
                <span className="text-xs font-semibold leading-tight">{c.name}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
