import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { StatusBadge } from "@/components/fsl/StatusBadge";
import { ErrorState, LoadingState } from "@/components/fsl/States";
import { HubAccess, HubPlatform, HubJoin, HubCodice, HubHero, HubMedia, HubMission, HubStats, HubTournaments, Kicker } from "@/components/fsl/HomeHub";
import { api, apiError } from "@/lib/api";
import { fmtPeriod } from "@/lib/format";

export function usePublicTournaments() {
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    api.get("/public/tournaments").then((r) => setList(r.data)).catch(setError);
  }, []);
  return { list, error, main: list?.find((t) => t.status === "active") || list?.[0] || null };
}

export function PublicTournamentsList() {
  const { list, error } = usePublicTournaments();
  if (error) return <div className="p-6"><ErrorState message={apiError(error)} /></div>;
  if (!list) return <LoadingState full />;
  return (
    <section className="mx-auto max-w-[1488px] px-6 py-14 gold-skin" data-testid="public-tournaments-page">
      <Kicker className="mb-3">I nostri campionati</Kicker>
      <h1 className="text-5xl sm:text-6xl font-extrabold leading-[0.9]">Tutti i tornei</h1>
      <p className="mt-4 text-fsl-slate max-w-xl">Scegli un torneo per calendario, risultati ufficiali, classifiche e schede delle società.</p>
      {list.length === 0 ? <p className="mt-10 text-fsl-slate">Nessun torneo pubblicato.</p> : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4 mt-10" data-testid="public-tournament-list">
          {list.map((t) => (
            <Link key={t.id} to={`/tornei/${t.slug}`} className="fsl-card overflow-hidden group hover:border-fsl-gold/50 transition-colors animate-rise" data-testid={`public-tournament-card-${t.slug}`}>
              <div className="relative h-40 bg-ink-950">{t.visual?.cover_url && <img src={t.visual.cover_url} alt="" className="absolute inset-0 h-full w-full object-cover group-hover:scale-[1.03] transition-transform duration-500" />}<div className="absolute inset-0 bg-gradient-to-t from-navy-800 to-transparent" /><div className="absolute left-4 bottom-3"><StatusBadge status={t.status} /></div></div>
              <div className="p-4"><h2 className="!text-2xl font-extrabold leading-none">{t.name}</h2><p className="text-sm text-fsl-slate mt-1">{t.payoff}</p>
                <div className="mt-3 flex items-center justify-between text-xs text-fsl-slate num"><span>{t.summary?.teams_capacity} squadre · {t.categories.length} categorie · {t.fields_count} campi</span><span className="uppercase font-semibold text-fsl-white">{fmtPeriod(t.start_date, t.end_date)}</span></div>
                <span className="mt-4 inline-flex items-center gap-1 text-sm text-fsl-gold font-semibold">Apri il torneo <ArrowRight className="h-4 w-4" /></span></div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

export default function PublicHub() {
  const { list, error, main } = usePublicTournaments();
  const { hash } = useLocation();
  useEffect(() => {
    if (!list || !hash) return;
    const el = document.getElementById(hash.slice(1));
    if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }, [list, hash]);
  if (error) return <div className="p-6"><ErrorState message={apiError(error)} /></div>;
  if (!list) return <LoadingState full />;
  return (
    <div data-testid="public-hub">
      <HubHero main={main} />
      <HubMission />
      <HubCodice />
      <HubTournaments list={list} />
      <HubStats list={list} main={main} />
      <HubPlatform />
      <HubMedia main={main} />
      <HubJoin />
      <HubAccess />
    </div>
  );
}
