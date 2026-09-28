import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Baby, Download, Flag, Heart, Trophy, Users, Sparkles, Newspaper } from "lucide-react";
import { ClubCrest } from "@/components/fsl/ClubCrest";
import { FavButton } from "@/components/fsl/FavButton";
import { LinkChildButton } from "@/components/fsl/AccountTools";
import { PushSettings } from "@/components/fsl/PushSettings";
import { LoadingState } from "@/components/fsl/States";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { mediaUrl } from "@/lib/upload";

function NextMatch({ m, label = "Prossima partita" }) {
  if (!m) return <p className="text-xs text-fsl-slate">Nessuna gara in programma.</p>;
  const played = m.score?.home != null && ["official", "rectified"].includes(m.status);
  return (
    <Link to={`/tornei/${m.tournament_slug}/partite/${m.id}`} className="block rounded-lg border border-white/10 bg-navy-900/60 p-3 hover:border-fsl-gold/60 transition-colors" data-testid={`shortcut-match-${m.id}`}>
      <div className="text-[10px] uppercase tracking-wider text-fsl-gold">{label} · {m.round_name}</div>
      <div className="mt-1 flex items-center gap-2 text-sm font-semibold"><ClubCrest club={m.home} size={22} /><span className="truncate">{m.home.short_name || m.home.name}</span><span className="num font-display text-lg px-1">{played ? `${m.score.home}-${m.score.away}` : "vs"}</span><span className="truncate">{m.away.short_name || m.away.name}</span><ClubCrest club={m.away} size={22} /></div>
      <div className="mt-1 text-xs text-fsl-slate num">{fmtDate(m.kickoff_at, { time: true })}{m.field_name ? ` · ${m.field_name}` : ""}</div>
    </Link>
  );
}

const when = (iso) => { try { const d = new Date(iso); return d.toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "2-digit" }) + (iso?.length > 10 ? ` · ${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}` : ""); } catch { return ""; } };
const Side = ({ s }) => <span className="inline-flex items-center gap-1.5 min-w-0"><span className="h-5 w-5 rounded-full shrink-0 inline-flex items-center justify-center text-[8px] font-display font-extrabold overflow-hidden" style={{ background: s.colors?.primary || "#0B57D9" }}>{s.crest_url ? <img src={mediaUrl(s.crest_url)} alt="" className="h-full w-full object-contain bg-white/95" /> : (s.short_name || s.name || "?").slice(0, 3).toUpperCase()}</span><span className="truncate font-display font-bold uppercase">{s.name}</span></span>;
const MatchLine = ({ m }) => <div className="flex items-center gap-2 text-sm"><div className="flex-1 min-w-0"><Side s={m.home} /></div>{m.status === "official" || m.status === "rectified" ? <span className="num font-display font-extrabold text-lg px-2 rounded bg-ink-950 border border-white/10">{m.score?.home}–{m.score?.away}</span> : <span className="text-[10px] text-fsl-gold font-bold uppercase whitespace-nowrap">{when(m.kickoff_at)}</span>}<div className="flex-1 min-w-0 flex justify-end text-right"><Side s={m.away} /></div></div>;

function MyFeed({ feed }) {
  const icon = { result: Trophy, weekly: Newspaper, top11: Sparkles };
  return (
    <section data-testid="fan-feed">
      <h2 className="fsl-section-title mb-3 flex items-center gap-2"><Sparkles className="h-5 w-5 text-fsl-gold" /> Il mio feed</h2>
      <div className="grid lg:grid-cols-[1fr_1.2fr] gap-6">
        <div className="space-y-2" data-testid="fan-feed-upcoming"><div className="fsl-kicker mb-2">Prossime partite</div>{feed.upcoming.length === 0 ? <p className="text-sm text-fsl-slate">Nessuna gara in programma.</p> : feed.upcoming.map((it) => <Link key={it.match.id} to={it.link} className="fsl-card p-3 block hover:border-fsl-gold/50 transition-colors"><div className="text-[10px] text-fsl-slate uppercase tracking-wider mb-1">{it.match.tournament_name}{it.match.field_name ? ` · ${it.match.field_name}` : ""}</div><MatchLine m={it.match} /></Link>)}</div>
        <div className="space-y-2" data-testid="fan-feed-timeline"><div className="fsl-kicker mb-2">Ultime novità</div>{feed.timeline.map((it, i) => { const Icon = icon[it.type] || Trophy; return (
          <Link key={i} to={it.link} className="fsl-card p-3 block hover:border-fsl-gold/50 transition-colors" data-testid={`fan-feed-item-${it.type}`}>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-fsl-gold mb-1"><Icon className="h-3.5 w-3.5" /> {it.type === "result" ? "Risultato" : it.type === "weekly" ? "FSL Weekly" : "Top 11"} <span className="text-fsl-slate ml-auto normal-case tracking-normal">{when(it.date)}</span></div>
            {it.type === "result" ? <MatchLine m={it.match} /> : <><div className="font-display font-extrabold uppercase leading-tight">{it.title}</div><div className="text-xs text-fsl-slate">{it.subtitle}</div>{it.excerpt && <p className="text-xs text-fsl-white/80 mt-1 line-clamp-2">{it.excerpt}</p>}{it.picks?.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{it.picks.map((p, j) => <span key={j} className={`h-6 px-2 rounded-full text-[10px] font-bold inline-flex items-center gap-1 ${p.mine ? "bg-fsl-gold text-ink-950" : "bg-white/10"}`}>{p.name} · {Number(p.fanta).toFixed(1).replace(".", ",")}</span>)}</div>}</>}
          </Link>); })}</div>
      </div>
    </section>
  );
}

export default function FanAccount() {
  const { user } = useAuth();
  const [sc, setSc] = useState(null);
  const [purchases, setPurchases] = useState([]);
  const [reports, setReports] = useState([]);
  const [children, setChildren] = useState([]);
  const navigate = useNavigate();
  const [feed, setFeed] = useState(null);
  useEffect(() => { api.get("/me/feed").then((r) => setFeed(r.data)).catch(() => setFeed({ upcoming: [], timeline: [], following: 0 })); }, []);
  useEffect(() => { api.get("/me/shortcuts").then((r) => setSc(r.data)).catch(() => setSc({ tournaments: [], teams: [], players: [] })); api.get("/me/purchases").then((r) => setPurchases(r.data)).catch(() => {}); api.get("/me/reports").then((r) => setReports(r.data)).catch(() => {}); api.get("/me/children").then((r) => setChildren(r.data)).catch(() => {}); }, [user?.favorites]);
  if (!sc) return <LoadingState full />;
  const empty = !sc.tournaments.length && !sc.teams.length && !sc.players.length;
  return (
    <div className="text-fsl-white">
      <div className="mx-auto max-w-[1200px] px-6 py-8 space-y-8" data-testid="fan-account">
        <div><div className="fsl-kicker">Area genitori e tifosi</div><h1 className="text-4xl sm:text-5xl font-extrabold leading-[0.95]">Ciao {user.full_name.split(" ")[0]}, i tuoi preferiti</h1><p className="mt-2 text-sm text-fsl-slate max-w-2xl">Scorciatoie immediate alle prossime partite di tornei, squadre e giocatori che segui. Naviga liberamente il portale e aggiungi preferiti con il cuore ♥ da tornei, società e schede giocatore.</p><div className="mt-4 flex flex-wrap gap-2"><LinkChildButton onLinked={(d) => { api.get("/me/children").then((r) => setChildren(r.data)).catch(() => {}); if (d.tournament_slug) navigate(`/tornei/${d.tournament_slug}/giocatori/${d.player_id}`); }} /><Link to="/" className="btn-ghost" data-testid="fan-explore"><Trophy className="h-4 w-4" /> Esplora i tornei</Link></div></div>
        {feed && (feed.upcoming.length > 0 || feed.timeline.length > 0) && <MyFeed feed={feed} />}
        <PushSettings />
        {children.length > 0 && <section data-testid="fan-children"><h2 className="fsl-section-title mb-3 flex items-center gap-2"><Baby className="h-5 w-5 text-fsl-gold" /> I miei bambini</h2><p className="text-xs text-fsl-slate mb-3">Abbinati dalla società alla tua email: puoi compilare la loro scheda «Mi presento».</p><div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">{children.map((c) => <Link key={c.id} to={`/tornei/${c.tournament_slug}/giocatori/${c.id}`} className="fsl-card p-4 flex items-center gap-3 hover:border-fsl-gold/60 transition-colors" data-testid={`fan-child-${c.id}`}>{c.photo_url ? <img src={mediaUrl(c.photo_url)} alt="" className="h-14 w-14 rounded-xl object-cover border border-fsl-gold/50" /> : <span className="h-14 w-14 rounded-xl bg-navy-700 inline-flex items-center justify-center font-display font-extrabold text-xl">{c.name[0]}</span>}<div className="min-w-0 flex-1"><div className="font-display font-bold uppercase truncate"><span className="num text-fsl-gold mr-1">{c.shirt_number ?? ""}</span>{c.name}</div><div className="text-xs text-fsl-slate truncate">{c.team} · {c.tournament_name}</div><div className="text-[10px] uppercase text-fsl-gold mt-1">Apri e compila la scheda →</div></div><ClubCrest club={c.club} size={32} /></Link>)}</div></section>}
        {empty && children.length === 0 && <div className="fsl-card-gold p-6 text-center space-y-3" data-testid="fan-empty"><Heart className="h-8 w-8 mx-auto text-fsl-gold" /><p className="text-sm">Non segui ancora nulla. Apri un torneo, una società o la scheda di un giocatore e tocca «Segui».</p><Link to="/" className="btn-ghost">Vai ai tornei</Link></div>}
        {sc.teams.length > 0 && <section data-testid="fan-teams"><h2 className="fsl-section-title mb-3 flex items-center gap-2"><Users className="h-5 w-5 text-fsl-gold" /> Squadre</h2><div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">{sc.teams.map((t) => <div key={t.id} className="fsl-card p-4 space-y-3"><div className="flex items-center gap-3"><ClubCrest club={t.club} size={40} /><div className="min-w-0 flex-1"><Link to={`/tornei/${t.tournament_slug}/squadre/${t.club?.slug}`} className="font-display font-bold uppercase hover:text-fsl-gold block truncate">{t.club?.name}</Link><div className="text-xs text-fsl-slate">{t.name}</div></div><FavButton kind="teams" id={t.id} small /></div><NextMatch m={t.next_match} />{t.last_match && <NextMatch m={t.last_match} label="Ultimo risultato" />}</div>)}</div></section>}
        {sc.players.length > 0 && <section data-testid="fan-players"><h2 className="fsl-section-title mb-3">Giocatori</h2><div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">{sc.players.map((p) => <div key={p.id} className="fsl-card p-4 space-y-3"><div className="flex items-center gap-3">{p.photo_url ? <img src={mediaUrl(p.photo_url)} alt="" className="h-11 w-11 rounded-full object-cover border border-fsl-gold/50" /> : <span className="h-11 w-11 rounded-full bg-navy-700 inline-flex items-center justify-center font-bold">{p.name[0]}</span>}<div className="min-w-0 flex-1"><div className="font-semibold truncate">{p.name}</div><div className="text-xs text-fsl-slate">{p.team}</div></div><FavButton kind="players" id={p.id} small /></div><NextMatch m={p.next_match} /></div>)}</div></section>}
        {sc.tournaments.length > 0 && <section data-testid="fan-tournaments"><h2 className="fsl-section-title mb-3 flex items-center gap-2"><Trophy className="h-5 w-5 text-fsl-gold" /> Tornei</h2><div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">{sc.tournaments.map((t) => <div key={t.slug} className="fsl-card p-4 space-y-3"><div className="flex items-center gap-3"><div className="min-w-0 flex-1"><Link to={`/tornei/${t.slug}`} className="font-display font-bold uppercase hover:text-fsl-gold block truncate">{t.name}</Link><div className="text-xs text-fsl-slate">{t.season}</div></div><FavButton kind="tournaments" id={t.slug} small /></div><NextMatch m={t.next_match} label="Prossima gara del torneo" /></div>)}</div></section>}
        <div className="grid md:grid-cols-2 gap-6">
          <section data-testid="fan-purchases"><h2 className="fsl-section-title mb-3 flex items-center gap-2"><Download className="h-5 w-5 text-fsl-gold" /> I miei acquisti</h2><div className="fsl-card divide-y divide-white/[0.06]">{purchases.length === 0 && <p className="p-4 text-sm text-fsl-slate">Nessun acquisto: foto e video delle gare sono nel Match Center.</p>}{purchases.map((x) => <div key={x.id} className="h-14 px-4 flex items-center gap-3 text-sm"><span className="text-[10px] uppercase text-fsl-gold w-10">{x.kind}</span><span className="flex-1 truncate">{x.title}</span><span className="num text-xs text-fsl-slate">{fmtDate(x.created_at)}</span>{x.open_url ? <Link className="btn-gold h-8 px-3 text-xs" to={x.open_url} data-testid={`purchase-open-${x.id}`}>Apri</Link> : <a className="btn-gold h-8 px-3 text-xs" href={mediaUrl(x.download_url)} data-testid={`purchase-download-${x.id}`}>Scarica</a>}</div>)}</div></section>
          <section data-testid="fan-reports"><h2 className="fsl-section-title mb-3 flex items-center gap-2"><Flag className="h-5 w-5 text-fsl-gold" /> Le mie segnalazioni</h2><div className="fsl-card divide-y divide-white/[0.06]">{reports.length === 0 && <p className="p-4 text-sm text-fsl-slate">Nessuna segnalazione. Puoi segnalare un errore dal Match Center di ogni gara.</p>}{reports.map((r) => <div key={r.id} className="px-4 py-3 text-sm"><div className="flex items-center justify-between"><span className="font-semibold truncate">{r.subject}</span><span className="text-[10px] uppercase text-fsl-gold">{r.status}</span></div>{r.resolution && <p className="text-xs text-fsl-slate mt-1">{r.resolution}</p>}</div>)}</div></section>
        </div>
      </div>
    </div>
  );
}
