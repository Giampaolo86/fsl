import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CalendarDays, Trophy, Users } from "lucide-react";
import { ClubCrest } from "@/components/fsl/ClubCrest";
import { FavButton } from "@/components/fsl/FavButton";
import { HeroStage, SectionHead } from "@/components/fsl/ProfileKit";
import { ErrorState, LoadingState } from "@/components/fsl/States";
import { api, apiError } from "@/lib/api";
import { mediaUrl } from "@/lib/upload";
import { MatchesTable } from "./PublicClubHome";

export default function PublicTeam() {
  const { slug, clubSlug, teamId } = useParams();
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { api.get(`/public/tournaments/${slug}/teams/${teamId}`).then((r) => setD(r.data)).catch((e) => setError(apiError(e))); }, [slug, teamId]);
  if (error) return <ErrorState message={error} />;
  if (!d) return <LoadingState />;
  const { team: tm, club: c, standing: st, roster, matches } = d;
  const now = Date.now();
  const upcoming = matches.filter((m) => m.status !== "final" && m.status !== "validated" && (!m.kickoff_at || new Date(m.kickoff_at).getTime() >= now - 36e5));
  const recent = matches.filter((m) => m.status === "final" || m.status === "validated").reverse();
  const meta = [tm.birth_year && `Anno ${tm.birth_year}`, tm.level, d.competition?.name].filter(Boolean).join(" · ");
  return (
    <div className="pb-16" data-testid="public-team">
      <HeroStage testId="public-team-hero">
        <div className="mx-auto max-w-[1488px] px-6 py-10 md:py-14 grid md:grid-cols-[1fr_auto] gap-8 items-center">
          <div className="min-w-0">
            <Link to={`/tornei/${slug}/squadre/${clubSlug}`} className="inline-flex items-center gap-1 text-xs text-fsl-slate hover:text-fsl-white" data-testid="public-team-back"><ArrowLeft className="h-3.5 w-3.5" /> {c?.name || "Società"}</Link>
            <div className="mt-3 flex items-center gap-4"><ClubCrest club={c} size={64} /><div className="min-w-0"><div className="fsl-kicker">Gruppo {tm.category}</div><h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold uppercase leading-[0.9] truncate" data-testid="public-team-name">{tm.name}</h1></div></div>
            <p className="mt-3 text-sm text-fsl-slate">{meta || "Girone da assegnare"}</p>
            <div className="mt-4"><FavButton kind="teams" id={tm.id} label={`Segui ${tm.name}`} small /></div>
          </div>
          {st && <div className="fsl-card-gold p-5 text-center min-w-[200px]" data-testid="public-team-standing"><div className="text-[10px] uppercase tracking-[0.2em] text-fsl-slate">{st.competition}</div><div className="font-display font-extrabold text-6xl num text-fsl-gold leading-none mt-1">{st.pos}°</div><div className="text-xs text-fsl-slate mt-1 num">{st.PT} punti · {st.PG} gare · {st.V}V {st.N}N {st.P}P</div><Link to={`/tornei/${slug}/classifiche`} className="mt-3 inline-flex items-center gap-1 text-xs text-fsl-gold hover:underline"><Trophy className="h-3.5 w-3.5" /> Classifica completa</Link></div>}
        </div>
      </HeroStage>
      <div className="mx-auto max-w-[1488px] px-6 mt-10 grid lg:grid-cols-[1fr_1.2fr] gap-10">
        <section data-testid="public-team-roster">
          <SectionHead icon={Users} title="La rosa" count={roster.length} />
          {roster.length === 0 ? <p className="text-sm text-fsl-slate">La rosa sarà pubblicata appena confermata dall'organizzazione.</p> : (
            <div className="grid sm:grid-cols-2 gap-2">
              {roster.map((p) => (
                <Link key={p.id} to={`/tornei/${slug}/giocatori/${p.id}`} className="fsl-card p-3 flex items-center gap-3 hover:border-fsl-gold/60 transition-colors" data-testid={`public-team-player-${p.id}`}>
                  <div className="h-11 w-11 rounded-full bg-ink-950 border border-white/10 overflow-hidden flex items-center justify-center font-display font-extrabold text-xl num text-fsl-gold shrink-0">{p.photo_url ? <img src={mediaUrl(p.photo_url)} alt="" className="h-full w-full object-cover" /> : (p.shirt_number ?? "–")}</div>
                  <div className="min-w-0 flex-1"><div className="text-sm font-semibold truncate">{p.name}</div><div className="text-xs text-fsl-slate">{[p.shirt_number != null && `#${p.shirt_number}`, p.role].filter(Boolean).join(" · ") || "Giocatore"}</div></div>
                  <span className="text-[11px] text-fsl-gold">Home →</span>
                </Link>
              ))}
            </div>
          )}
        </section>
        <section data-testid="public-team-calendar">
          <SectionHead icon={CalendarDays} title="Calendario e risultati" count={matches.length} to={`/tornei/${slug}/partite`} linkLabel="Tutte le gare" />
          {matches.length === 0 ? <p className="text-sm text-fsl-slate">Il calendario sarà pubblicato quando il gruppo verrà assegnato a un girone.</p> : <MatchesTable recent={recent} upcoming={upcoming} teamIds={new Set([tm.id])} slug={slug} maxUpcoming={50} />}
        </section>
      </div>
    </div>
  );
}
