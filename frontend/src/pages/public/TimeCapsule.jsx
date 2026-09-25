import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Award, BookOpen, Camera, Crown, Star, Target } from "lucide-react";
import { Kicker } from "@/components/fsl/HomeHub";
import { FifaCard, fmt1 } from "@/components/fsl/FifaCard";
import { StadiumCard } from "@/components/fsl/StadiumCard";
import { ErrorState, LoadingState } from "@/components/fsl/States";
import { api, apiError } from "@/lib/api";
import { mediaUrl } from "@/lib/upload";

const when = (iso) => { try { return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "short" }); } catch { return ""; } };

function Chapter({ n, title, subtitle, icon: Icon, children, testId }) {
  return (
    <section className="relative rounded-3xl border border-white/10 bg-navy-800 p-6 sm:p-8 animate-rise" style={{ animationDelay: `${n * 90}ms` }} data-testid={testId}>
      <div className="absolute inset-0 grain opacity-30 pointer-events-none rounded-3xl" />
      <div className="relative flex items-start gap-4 mb-5"><span className="h-12 w-12 shrink-0 rounded-2xl bg-fsl-gold/15 border border-fsl-gold/40 inline-flex items-center justify-center font-display font-extrabold text-xl text-fsl-gold num">{String(n).padStart(2, "0")}</span><div><h2 className="font-display font-extrabold uppercase text-2xl sm:text-3xl leading-none flex items-center gap-2">{Icon && <Icon className="h-6 w-6 text-fsl-gold" />} {title}</h2><p className="text-sm text-fsl-slate mt-1">{subtitle}</p></div></div>
      <div className="relative">{children}</div>
    </section>
  );
}

export default function TimeCapsule() {
  const { slug, playerId } = useParams();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { api.get(`/public/tournaments/${slug}/players/${playerId}/capsule`).then((r) => setD(r.data)).catch(setErr); }, [slug, playerId]);
  if (err) return <div className="p-10"><ErrorState message={apiError(err)} /></div>;
  if (!d) return <LoadingState full />;
  const c = d.card, t = c.totals || {}, ch = Object.fromEntries(d.chapters.map((x) => [x.key, x]));
  return (
    <div className="mx-auto max-w-[1100px] px-6 py-10 space-y-8" data-testid="time-capsule">
      <Link to={`/tornei/${slug}/giocatori/${playerId}`} className="inline-flex items-center gap-1 text-xs text-fsl-slate hover:text-fsl-white" data-testid="capsule-back"><ArrowLeft className="h-3.5 w-3.5" /> Scheda giocatore</Link>
      <header className="relative overflow-hidden rounded-3xl border border-fsl-gold/30 p-6 sm:p-10" style={{ background: `linear-gradient(120deg, ${c.club?.colors?.primary || "#0B57D9"} 0%, #041E32 65%)` }} data-testid="capsule-cover">
        <div className="absolute inset-0 grain opacity-40" />
        <div className="relative grid md:grid-cols-[auto_1fr] gap-8 items-center">
          <FifaCard player={{ name: c.name, photo_url: c.photo_url, role: c.role, fanta: c.avg_fanta, team: c.team, shirt_number: c.shirt_number, goals: t.goal || 0, assists: t.assist || 0, vote: c.avg_vote, mvp: (t.mvp || 0) > 0 }} variant="gold" size="lg" />
          <div><Kicker>FSL Time Capsule · {d.tournament.season_label}</Kicker><h1 className="mt-2 text-4xl sm:text-6xl font-extrabold uppercase leading-[0.9]" data-testid="capsule-name">{c.name}</h1><p className="mt-2 text-fsl-white/85">{ch.cover.subtitle} · {c.team}</p><p className="mt-4 text-sm text-fsl-slate max-w-lg">L'album digitale della stagione: numeri ufficiali, partite, momenti Top 11, badge e foto. Si aggiorna da solo dopo ogni tabellino ufficiale.</p>{d.preview && <span className="mt-4 inline-flex h-7 items-center rounded-full border border-fsl-gold/60 px-3 text-[10px] font-bold uppercase tracking-wider text-fsl-gold" data-testid="capsule-preview-badge">Anteprima · versione stampabile in arrivo</span>}</div>
        </div>
      </header>

      <Chapter n={1} title={ch.numbers.title} subtitle={ch.numbers.subtitle} icon={Target} testId="capsule-numbers">
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">{[["Presenze", t.presences || 0], ["Gol", t.goal || 0], ["Assist", t.assist || 0], ["Media voto", fmt1(c.avg_vote)], ["Media fanta", fmt1(c.avg_fanta)], ["MVP", t.mvp || 0]].map(([l, v]) => <div key={l} className="rounded-2xl bg-ink-950/60 border border-white/10 px-3 py-4 text-center"><div className="num font-display font-extrabold text-3xl text-fsl-gold leading-none">{v}</div><div className="text-[10px] uppercase tracking-wider text-fsl-slate mt-1">{l}</div></div>)}</div>
        {d.best_match && <div className="mt-4 rounded-2xl border border-fsl-gold/30 bg-fsl-gold/5 p-4 flex flex-wrap items-center gap-3 text-sm" data-testid="capsule-best"><Star className="h-5 w-5 text-fsl-gold" /><span className="font-display font-extrabold uppercase">La partita della stagione</span><span className="text-fsl-slate">vs {d.best_match.opponent} · {d.best_match.score}</span><span className="ml-auto num font-display font-extrabold text-2xl text-fsl-gold">{fmt1(d.best_match.fanta)}</span></div>}
      </Chapter>

      <Chapter n={2} title={ch.matches.title} subtitle={ch.matches.subtitle} icon={BookOpen} testId="capsule-matches">
        {d.history.length === 0 ? <p className="text-sm text-fsl-slate">Nessuna gara ufficiale ancora.</p> : <ol className="relative border-l border-fsl-gold/30 ml-3 space-y-3">{d.history.map((h) => <li key={h.match_id} className="ml-5 relative"><span className="absolute -left-[27px] top-2 h-3 w-3 rounded-full bg-fsl-gold" /><Link to={`/tornei/${slug}/partite/${h.match_id}`} className="fsl-card p-3 flex items-center gap-3 hover:border-fsl-gold/50 transition-colors"><div className="text-[10px] text-fsl-slate num w-14">{when(h.kickoff_at)}</div><div className="flex-1 min-w-0"><div className="font-display font-bold uppercase truncate">vs {h.opponent}</div><div className="text-xs text-fsl-slate">{h.round_name} · {h.score}{h.events?.goal ? ` · ${h.events.goal} gol` : ""}{h.events?.assist ? ` · ${h.events.assist} assist` : ""}</div></div>{h.badges?.includes("mvp") && <span className="h-6 px-2 rounded-full bg-fsl-gold text-ink-950 text-[10px] font-bold inline-flex items-center">MVP</span>}<div className="text-right"><div className="num font-display font-extrabold text-xl text-fsl-gold leading-none">{fmt1(h.fanta)}</div><div className="text-[9px] uppercase text-fsl-slate">voto {fmt1(h.vote)}</div></div></Link></li>)}</ol>}
      </Chapter>

      <Chapter n={3} title={ch.top11.title} subtitle={ch.top11.subtitle} icon={Crown} testId="capsule-top11">
        {d.top11.length === 0 ? <p className="text-sm text-fsl-slate">La prossima Top 11 ti aspetta: continua così!</p> : <div className="flex flex-wrap gap-4">{d.top11.map((x, i) => <div key={i} className="text-center"><StadiumCard player={{ name: c.name, photo_url: c.photo_url, role: c.role, fanta: x.fanta, team: c.team, club: c.club?.name, crest_url: c.club?.crest_url, colors: c.club?.colors, shirt_number: c.shirt_number }} size="sm" /><div className="mt-2 text-[10px] uppercase tracking-wider text-fsl-gold">Giornata {x.match_day}</div><div className="text-[10px] text-fsl-slate">{x.competition}</div></div>)}</div>}
      </Chapter>

      <Chapter n={4} title={ch.badges.title} subtitle={ch.badges.subtitle} icon={Award} testId="capsule-badges">
        {d.badges.length === 0 ? <p className="text-sm text-fsl-slate">Nessun badge ancora.</p> : <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">{d.badges.map((b) => <div key={b.id} className="fsl-card p-3 flex items-center gap-3"><span className="h-10 w-10 rounded-full bg-fsl-gold/15 border border-fsl-gold/40 inline-flex items-center justify-center"><Award className="h-5 w-5 text-fsl-gold" /></span><div className="min-w-0"><div className="font-semibold truncate">{b.label}</div><div className="text-[10px] text-fsl-slate uppercase">{b.scope === "match" ? "Partita" : b.scope === "season" ? "Stagione" : "Carriera"}{b.match_day ? ` · Giornata ${b.match_day}` : ""}</div></div></div>)}</div>}
      </Chapter>

      <Chapter n={5} title={ch.gallery.title} subtitle={ch.gallery.subtitle} icon={Camera} testId="capsule-gallery">
        {d.photos.length === 0 ? <p className="text-sm text-fsl-slate">Le foto ufficiali della società compariranno qui.</p> : <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{d.photos.slice(0, 12).map((ph, i) => <figure key={i} className="aspect-square overflow-hidden rounded-xl border border-white/10"><img src={mediaUrl(ph.url)} alt={ph.caption || ""} className="h-full w-full object-cover" loading="lazy" /></figure>)}</div>}
      </Chapter>
      <p className="text-xs text-fsl-slate">{d.product.note}</p>
    </div>
  );
}
