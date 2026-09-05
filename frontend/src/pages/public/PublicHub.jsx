import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Trophy } from "lucide-react";
import { StatusBadge } from "@/components/fsl/StatusBadge";
import { EmptyState, ErrorState, LoadingState } from "@/components/fsl/States";
import { api, apiError } from "@/lib/api";
import { fmtPeriod } from "@/lib/format";

const HERO = "https://images.unsplash.com/photo-1574629810360-7efbbe195018?crop=entropy&cs=srgb&fm=jpg&q=80&w=1800";

export function usePublicTournaments() {
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    api.get("/public/tournaments").then((r) => setList(r.data)).catch(setError);
  }, []);
  return { list, error };
}

export default function PublicHub() {
  const { list, error } = usePublicTournaments();
  if (error) return <div className="p-6"><ErrorState message={apiError(error)} /></div>;
  if (!list) return <LoadingState full />;
  return (
    <div>
      <section className="relative overflow-hidden grain min-h-[520px] flex items-end">
        <img src={HERO} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 hero-overlay" />
        <div className="relative mx-auto max-w-[1488px] w-full px-6 pb-12 pt-32">
          <div className="fsl-kicker mb-3">Future Stars League</div>
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold leading-[0.9] max-w-3xl">La Serie A del futuro</h1>
          <p className="mt-4 text-fsl-slate max-w-xl text-base">Tornei giovanili con risultati ufficiali, classifiche in tempo reale e schede di ogni società. Scegli un torneo per iniziare.</p>
        </div>
      </section>
      <section className="mx-auto max-w-[1488px] px-6 -mt-10 relative">
        {list.length === 0 ? (
          <EmptyState icon={Trophy} title="Nessun torneo pubblicato" description="I tornei attivi compariranno qui appena pubblicati dall'organizzazione." />
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4" data-testid="public-tournament-list">
            {list.map((t) => (
              <Link key={t.id} to={`/tornei/${t.slug}`} className="fsl-card overflow-hidden group hover:border-fsl-gold/50 transition-colors animate-rise" data-testid={`public-tournament-card-${t.slug}`}>
                <div className="relative h-40 bg-ink-950">
                  {t.visual?.cover_url && <img src={t.visual.cover_url} alt="" className="absolute inset-0 h-full w-full object-cover group-hover:scale-[1.03] transition-transform duration-500" />}
                  <div className="absolute inset-0 bg-gradient-to-t from-navy-800 to-transparent" />
                  <div className="absolute left-4 bottom-3"><StatusBadge status={t.status} /></div>
                </div>
                <div className="p-4">
                  <h2 className="text-2xl font-extrabold leading-none">{t.name}</h2>
                  <p className="text-sm text-fsl-slate mt-1">{t.payoff}</p>
                  <div className="mt-3 flex items-center justify-between text-xs text-fsl-slate num">
                    <span>{t.summary.teams_capacity} squadre · {t.categories.length} categorie · {t.fields_count} campi</span>
                    <span className="uppercase font-semibold text-fsl-white">{fmtPeriod(t.start_date, t.end_date)}</span>
                  </div>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm text-fsl-gold font-semibold">Apri il torneo <ArrowRight className="h-4 w-4" /></span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
