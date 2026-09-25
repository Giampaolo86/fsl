import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, Crown, Medal, Shield, Star, Target, TrendingDown, TrendingUp, Trophy } from "lucide-react";
import { Kicker } from "@/components/fsl/HomeHub";
import { EmptyState, ErrorState, LoadingState } from "@/components/fsl/States";
import { api, apiError } from "@/lib/api";
import { mediaUrl } from "@/lib/upload";

export const Crest = ({ r, size = "h-9 w-9" }) => (r?.crest_url ? <img src={mediaUrl(r.crest_url)} alt="" className={`${size} rounded-full object-contain bg-white/95 p-0.5`} /> : <span className={`${size} rounded-full inline-flex items-center justify-center font-display font-extrabold text-xs text-white`} style={{ background: r?.colors?.primary || "#0B57D9" }}>{(r?.club_name || r?.name || "?").slice(0, 3).toUpperCase()}</span>);
const ClubLink = ({ r, className = "", children }) => (r?.org_club_id ? <Link to={`/albo-doro/societa/${r.org_club_id}`} className={`hover:text-fsl-gold transition-colors ${className}`}>{children}</Link> : <span className={className}>{children}</span>);
const fmtV = (v) => (typeof v === "number" && !Number.isInteger(v) ? v.toFixed(2).replace(".", ",") : v);

export function AwardsRow({ awards, compact = false }) {
  const items = [["mvp", Crown, "Re degli MVP", "MVP"], ["scorer", Target, "Capocannoniere", "gol"], ["assist", ArrowUpRight, "Re degli assist", "assist"], ["fanta", Star, "Miglior fantamedia", ""]].filter(([k]) => awards?.[k]);
  if (!items.length) return null;
  return <div className={`grid gap-3 ${compact ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-4"}`} data-testid="legacy-awards">{items.map(([k, Icon, label, unit]) => <div key={k} className="rounded-2xl border border-white/10 bg-ink-950/60 p-4"><div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-fsl-gold"><Icon className="h-3.5 w-3.5" /> {label}</div><div className="mt-1 font-display font-extrabold uppercase text-lg leading-tight truncate">{awards[k].name}</div><div className="text-xs text-fsl-slate truncate">{awards[k].team}</div><div className="mt-1 num font-display font-extrabold text-2xl text-fsl-gold">{fmtV(awards[k].value)} <span className="text-xs font-sans text-fsl-slate">{unit}</span></div></div>)}</div>;
}

function SeasonCard({ a, i }) {
  return (
    <article className="relative overflow-hidden rounded-3xl border border-white/10 bg-navy-800 animate-rise" style={{ animationDelay: `${i * 80}ms` }} data-testid={`legacy-season-${a.tournament.slug}`}>
      <div className="absolute inset-0 grain opacity-40 pointer-events-none" /><div className="absolute -right-16 -top-16 h-56 w-56 rounded-full blur-3xl" style={{ background: `${a.tournament.visual?.primary || "#0B57D9"}55` }} />
      <div className="relative p-6 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><Kicker>{a.season_label}</Kicker><h2 className="mt-1 text-3xl sm:text-4xl font-extrabold uppercase leading-[0.9]">{a.tournament.name}</h2>{a.tournament.payoff && <p className="text-sm text-fsl-slate mt-1">{a.tournament.payoff}</p>}</div>
          <div className="flex gap-3 text-center">{[["Gare", a.totals?.matches], ["Gol", a.totals?.goals], ["Società", a.totals?.clubs]].map(([l, v]) => <div key={l} className="rounded-xl bg-ink-950/60 border border-white/10 px-3 py-2 min-w-[64px]"><div className="num font-display font-extrabold text-2xl text-fsl-gold leading-none">{v ?? 0}</div><div className="text-[9px] uppercase tracking-wider text-fsl-slate mt-1">{l}</div></div>)}</div>
        </div>
        <div className="mt-6 grid md:grid-cols-2 gap-3">
          {a.competitions.map((c) => (
            <div key={c.competition_id} className="rounded-2xl border border-fsl-gold/25 bg-ink-950/60 p-4" data-testid={`legacy-champion-${c.competition_id}`}>
              <div className="text-[10px] uppercase tracking-wider text-fsl-slate">{c.name}</div>
              {c.champion ? <ClubLink r={c.champion} className="mt-2 flex items-center gap-3"><Crest r={c.champion} size="h-12 w-12" /><div className="min-w-0"><div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-fsl-gold"><Trophy className="h-3 w-3" /> Campione</div><div className="font-display font-extrabold uppercase text-xl leading-none truncate">{c.champion.name}</div></div></ClubLink> : <p className="text-sm text-fsl-slate mt-2">Nessun campione registrato</p>}
              {(c.promoted.length > 0 || c.relegated.length > 0) && <div className="mt-3 flex flex-wrap gap-1.5">{c.promoted.map((r) => <span key={r.team_id} className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-fsl-success/15 text-fsl-success text-[10px] font-bold"><TrendingUp className="h-3 w-3" /> {r.name}</span>)}{c.relegated.map((r) => <span key={r.team_id} className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-fsl-danger/15 text-fsl-danger text-[10px] font-bold"><TrendingDown className="h-3 w-3" /> {r.name}</span>)}</div>}
            </div>
          ))}
        </div>
        <div className="mt-5"><AwardsRow awards={a.awards} /></div>
        <Link to={`/albo-doro/${a.tournament.slug}`} className="mt-5 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-fsl-gold hover:underline" data-testid={`legacy-open-${a.tournament.slug}`}>Classifiche finali e premi <ArrowUpRight className="h-3.5 w-3.5" /></Link>
      </div>
    </article>
  );
}

export function HallOfFame() {
  const [items, setItems] = useState(null);
  useEffect(() => { api.get("/public/legacy").then((r) => setItems(r.data)).catch(() => setItems([])); }, []);
  if (!items) return <LoadingState full />;
  return (
    <section className="mx-auto max-w-[1488px] px-6 py-12" data-testid="hall-of-fame">
      <Kicker className="mb-3">FSL Legacy</Kicker>
      <h1 className="text-5xl sm:text-6xl font-extrabold leading-[0.9] uppercase">Albo <span className="text-fsl-gold">d'oro</span></h1>
      <p className="mt-3 text-fsl-slate max-w-xl">Campioni, promozioni, premi individuali e classifiche finali di ogni stagione. La storia della Serie A del futuro, società per società.</p>
      {items.length === 0 ? <div className="mt-10"><EmptyState icon={Trophy} title="Nessuna stagione archiviata" description="L'albo d'oro si popola alla chiusura di ogni stagione." /></div> : <div className="mt-10 space-y-8">{items.map((a, i) => <SeasonCard key={a.id} a={a} i={i} />)}</div>}
    </section>
  );
}

export function SeasonArchive() {
  const params = useParams();
  const slug = params.archiveSlug;
  const [a, setA] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { api.get(`/public/legacy/${slug}`).then((r) => setA(r.data)).catch(setErr); }, [slug]);
  if (err) return <div className="p-10"><ErrorState message={apiError(err)} /></div>;
  if (!a) return <LoadingState full />;
  return (
    <section className="mx-auto max-w-[1200px] px-6 py-10 space-y-10" data-testid="season-archive">
      <div><Link to="/albo-doro" className="inline-flex items-center gap-1 text-xs text-fsl-slate hover:text-fsl-white" data-testid="season-archive-back"><ArrowLeft className="h-3.5 w-3.5" /> Albo d'oro</Link><Kicker className="mt-4">{a.season_label}</Kicker><h1 className="mt-1 text-4xl sm:text-6xl font-extrabold uppercase leading-[0.9]">{a.tournament.name}</h1></div>
      <AwardsRow awards={a.awards} />
      {a.competitions.map((c) => (
        <div key={c.competition_id} data-testid={`season-archive-comp-${c.competition_id}`}>
          <div className="flex items-end justify-between gap-3 mb-3"><h2 className="font-display font-extrabold uppercase text-2xl sm:text-3xl flex items-center gap-2"><Medal className="h-6 w-6 text-fsl-gold" /> {c.name}</h2>{c.champion && <span className="text-xs text-fsl-gold font-bold uppercase tracking-wider">Campione: {c.champion.name}</span>}</div>
          <div className="fsl-card overflow-hidden"><table className="w-full table-dark"><thead><tr><th className="w-8">#</th><th>Squadra</th><th className="text-right">PG</th><th className="text-right hidden sm:table-cell">V</th><th className="text-right hidden sm:table-cell">N</th><th className="text-right hidden sm:table-cell">P</th><th className="text-right hidden md:table-cell">GF</th><th className="text-right hidden md:table-cell">GS</th><th className="text-right">DR</th><th className="text-right">PT</th></tr></thead><tbody>{c.final_standings.map((r) => { const prom = c.promoted.some((x) => x.team_id === r.team_id), rel = c.relegated.some((x) => x.team_id === r.team_id); return <tr key={r.team_id} className={r.pos === 1 ? "bg-fsl-gold/[0.08]" : prom ? "bg-fsl-success/[0.05]" : rel ? "bg-fsl-danger/[0.05]" : ""}><td className="num text-fsl-slate">{r.pos}</td><td><ClubLink r={r} className="flex items-center gap-2 font-semibold"><Crest r={r} size="h-6 w-6" />{r.name}{r.pos === 1 && <Trophy className="h-3.5 w-3.5 text-fsl-gold" />}{prom && <TrendingUp className="h-3.5 w-3.5 text-fsl-success" />}{rel && <TrendingDown className="h-3.5 w-3.5 text-fsl-danger" />}</ClubLink></td><td className="num text-right">{r.PG}</td><td className="num text-right hidden sm:table-cell">{r.V}</td><td className="num text-right hidden sm:table-cell">{r.N}</td><td className="num text-right hidden sm:table-cell">{r.P}</td><td className="num text-right hidden md:table-cell">{r.GF}</td><td className="num text-right hidden md:table-cell">{r.GS}</td><td className="num text-right">{r.DR > 0 ? `+${r.DR}` : r.DR}</td><td className="num text-right font-extrabold text-fsl-gold">{r.PT}</td></tr>; })}</tbody></table></div>
        </div>
      ))}
      {a.awards?.top11?.length > 0 && <div data-testid="season-archive-top11"><h2 className="font-display font-extrabold uppercase text-2xl mb-3 flex items-center gap-2"><Star className="h-5 w-5 text-fsl-gold" /> Più presenze in Top 11</h2><div className="fsl-card divide-y divide-white/[0.06]">{a.awards.top11.map((p, i) => <div key={i} className="h-12 px-4 flex items-center gap-3 text-sm"><span className="num text-fsl-slate w-5">{i + 1}</span><span className="flex-1 truncate font-semibold">{p.name} <span className="text-fsl-slate font-normal">· {p.team}</span></span><span className="num font-display font-extrabold text-xl text-fsl-gold">{p.count}</span></div>)}</div></div>}
    </section>
  );
}

export function HonoursStrip({ h, compact = false }) {
  const items = [["Stagioni", h.seasons, Shield], ["Titoli", h.titles, Trophy], ["Podi", h.podiums, Medal], ["Promozioni", h.promotions, TrendingUp], ["Retrocessioni", h.relegations, TrendingDown]];
  return <div className={`grid gap-2 ${compact ? "grid-cols-5" : "grid-cols-2 sm:grid-cols-5"}`} data-testid="club-honours">{items.map(([l, v, Icon]) => <div key={l} className="rounded-xl bg-ink-950/60 border border-white/10 px-3 py-2 text-center"><Icon className="h-4 w-4 mx-auto text-fsl-gold" /><div className="num font-display font-extrabold text-2xl leading-none mt-1">{v}</div><div className="text-[9px] uppercase tracking-wider text-fsl-slate mt-1">{l}</div></div>)}</div>;
}

export function ClubHistory() {
  const { orgClubId } = useParams();
  const [h, setH] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { api.get(`/public/legacy/clubs/${orgClubId}`).then((r) => setH(r.data)).catch(setErr); }, [orgClubId]);
  if (err) return <div className="p-10"><ErrorState message={apiError(err)} /></div>;
  if (!h) return <LoadingState full />;
  const c = h.club;
  return (
    <section className="mx-auto max-w-[1100px] px-6 py-10 space-y-8" data-testid="club-history">
      <Link to="/albo-doro" className="inline-flex items-center gap-1 text-xs text-fsl-slate hover:text-fsl-white"><ArrowLeft className="h-3.5 w-3.5" /> Albo d'oro</Link>
      <div className="relative overflow-hidden rounded-3xl border border-white/10 p-6 sm:p-10" style={{ background: `linear-gradient(120deg, ${c.colors?.primary || "#0B57D9"} 0%, #041E32 70%)` }}>
        <div className="absolute inset-0 grain opacity-40" />
        <div className="relative flex flex-wrap items-center gap-5"><Crest r={c} size="h-20 w-20" /><div><Kicker>Storia della società{c.city ? ` · ${c.city}` : ""}</Kicker><h1 className="mt-1 text-4xl sm:text-6xl font-extrabold uppercase leading-[0.9]" data-testid="club-history-name">{c.name}</h1></div></div>
        <div className="relative mt-6"><HonoursStrip h={h.honours} /></div>
      </div>
      <div className="fsl-card overflow-hidden" data-testid="club-history-seasons"><table className="w-full table-dark"><thead><tr><th>Stagione</th><th>Torneo · Competizione</th><th>Squadra</th><th className="text-right">Pos.</th><th className="text-right hidden sm:table-cell">PT</th><th className="text-right hidden sm:table-cell">DR</th><th>Esito</th></tr></thead><tbody>{h.seasons.map((s, i) => <tr key={i}><td className="num whitespace-nowrap">{s.season_label}</td><td><Link to={`/albo-doro/${s.tournament.slug}`} className="hover:text-fsl-gold">{s.tournament.name}</Link><span className="text-fsl-slate"> · {s.competition}</span></td><td className="font-semibold">{s.team}</td><td className="num text-right font-extrabold">{s.pos}<span className="text-fsl-slate font-normal">/{s.teams}</span></td><td className="num text-right hidden sm:table-cell">{s.PT}</td><td className="num text-right hidden sm:table-cell">{s.DR > 0 ? `+${s.DR}` : s.DR}</td><td>{s.champion ? <span className="inline-flex items-center gap-1 text-fsl-gold font-bold text-xs"><Trophy className="h-3.5 w-3.5" /> Campione</span> : s.promoted ? <span className="inline-flex items-center gap-1 text-fsl-success font-bold text-xs"><TrendingUp className="h-3.5 w-3.5" /> Promossa</span> : s.relegated ? <span className="inline-flex items-center gap-1 text-fsl-danger font-bold text-xs"><TrendingDown className="h-3.5 w-3.5" /> Retrocessa</span> : s.pos <= 3 ? <span className="inline-flex items-center gap-1 text-fsl-slate text-xs"><Medal className="h-3.5 w-3.5" /> Podio</span> : <span className="text-fsl-slate text-xs">—</span>}</td></tr>)}</tbody></table></div>
    </section>
  );
}
