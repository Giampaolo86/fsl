import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Baby, Download, Flag, Heart, Trophy, Users } from "lucide-react";
import { ClubCrest } from "@/components/fsl/ClubCrest";
import { FavButton } from "@/components/fsl/FavButton";
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

export default function FanAccount() {
  const { user } = useAuth();
  const [sc, setSc] = useState(null);
  const [purchases, setPurchases] = useState([]);
  const [reports, setReports] = useState([]);
  const [children, setChildren] = useState([]);
  useEffect(() => { api.get("/me/shortcuts").then((r) => setSc(r.data)).catch(() => setSc({ tournaments: [], teams: [], players: [] })); api.get("/me/purchases").then((r) => setPurchases(r.data)).catch(() => {}); api.get("/me/reports").then((r) => setReports(r.data)).catch(() => {}); api.get("/me/children").then((r) => setChildren(r.data)).catch(() => {}); }, [user?.favorites]);
  if (!sc) return <LoadingState full />;
  const empty = !sc.tournaments.length && !sc.teams.length && !sc.players.length;
  return (
    <div className="text-fsl-white">
      <div className="mx-auto max-w-[1200px] px-6 py-8 space-y-8" data-testid="fan-account">
        <div><div className="fsl-kicker">Area genitori e tifosi</div><h1 className="text-4xl sm:text-5xl font-extrabold leading-[0.95]">Ciao {user.full_name.split(" ")[0]}, i tuoi preferiti</h1><p className="mt-2 text-sm text-fsl-slate max-w-2xl">Scorciatoie immediate alle prossime partite di tornei, squadre e giocatori che segui. Naviga liberamente il portale e aggiungi preferiti con il cuore ♥ da tornei, società e schede giocatore.</p><div className="mt-4 flex flex-wrap gap-2"><Link to="/" className="btn-gold" data-testid="fan-explore"><Trophy className="h-4 w-4" /> Esplora i tornei</Link></div></div>
        {children.length > 0 && <section data-testid="fan-children"><h2 className="fsl-section-title mb-3 flex items-center gap-2"><Baby className="h-5 w-5 text-fsl-gold" /> I miei bambini</h2><p className="text-xs text-fsl-slate mb-3">Abbinati dalla società alla tua email: puoi compilare la loro scheda «Mi presento».</p><div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">{children.map((c) => <Link key={c.id} to={`/tornei/${c.tournament_slug}/giocatori/${c.id}`} className="fsl-card p-4 flex items-center gap-3 hover:border-fsl-gold/60 transition-colors" data-testid={`fan-child-${c.id}`}>{c.photo_url ? <img src={mediaUrl(c.photo_url)} alt="" className="h-14 w-14 rounded-xl object-cover border border-fsl-gold/50" /> : <span className="h-14 w-14 rounded-xl bg-navy-700 inline-flex items-center justify-center font-display font-extrabold text-xl">{c.name[0]}</span>}<div className="min-w-0 flex-1"><div className="font-display font-bold uppercase truncate"><span className="num text-fsl-gold mr-1">{c.shirt_number ?? ""}</span>{c.name}</div><div className="text-xs text-fsl-slate truncate">{c.team} · {c.tournament_name}</div><div className="text-[10px] uppercase text-fsl-gold mt-1">Apri e compila la scheda →</div></div><ClubCrest club={c.club} size={32} /></Link>)}</div></section>}
        {empty && children.length === 0 && <div className="fsl-card-gold p-6 text-center space-y-3" data-testid="fan-empty"><Heart className="h-8 w-8 mx-auto text-fsl-gold" /><p className="text-sm">Non segui ancora nulla. Apri un torneo, una società o la scheda di un giocatore e tocca «Segui».</p><Link to="/" className="btn-ghost">Vai ai tornei</Link></div>}
        {sc.teams.length > 0 && <section data-testid="fan-teams"><h2 className="fsl-section-title mb-3 flex items-center gap-2"><Users className="h-5 w-5 text-fsl-gold" /> Squadre</h2><div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">{sc.teams.map((t) => <div key={t.id} className="fsl-card p-4 space-y-3"><div className="flex items-center gap-3"><ClubCrest club={t.club} size={40} /><div className="min-w-0 flex-1"><Link to={`/tornei/${t.tournament_slug}/squadre/${t.club?.slug}`} className="font-display font-bold uppercase hover:text-fsl-gold block truncate">{t.club?.name}</Link><div className="text-xs text-fsl-slate">{t.name}</div></div><FavButton kind="teams" id={t.id} small /></div><NextMatch m={t.next_match} />{t.last_match && <NextMatch m={t.last_match} label="Ultimo risultato" />}</div>)}</div></section>}
        {sc.players.length > 0 && <section data-testid="fan-players"><h2 className="fsl-section-title mb-3">Giocatori</h2><div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">{sc.players.map((p) => <div key={p.id} className="fsl-card p-4 space-y-3"><div className="flex items-center gap-3">{p.photo_url ? <img src={mediaUrl(p.photo_url)} alt="" className="h-11 w-11 rounded-full object-cover border border-fsl-gold/50" /> : <span className="h-11 w-11 rounded-full bg-navy-700 inline-flex items-center justify-center font-bold">{p.name[0]}</span>}<div className="min-w-0 flex-1"><div className="font-semibold truncate">{p.name}</div><div className="text-xs text-fsl-slate">{p.team}</div></div><FavButton kind="players" id={p.id} small /></div><NextMatch m={p.next_match} /></div>)}</div></section>}
        {sc.tournaments.length > 0 && <section data-testid="fan-tournaments"><h2 className="fsl-section-title mb-3 flex items-center gap-2"><Trophy className="h-5 w-5 text-fsl-gold" /> Tornei</h2><div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">{sc.tournaments.map((t) => <div key={t.slug} className="fsl-card p-4 space-y-3"><div className="flex items-center gap-3"><div className="min-w-0 flex-1"><Link to={`/tornei/${t.slug}`} className="font-display font-bold uppercase hover:text-fsl-gold block truncate">{t.name}</Link><div className="text-xs text-fsl-slate">{t.season}</div></div><FavButton kind="tournaments" id={t.slug} small /></div><NextMatch m={t.next_match} label="Prossima gara del torneo" /></div>)}</div></section>}
        <div className="grid md:grid-cols-2 gap-6">
          <section data-testid="fan-purchases"><h2 className="fsl-section-title mb-3 flex items-center gap-2"><Download className="h-5 w-5 text-fsl-gold" /> I miei acquisti</h2><div className="fsl-card divide-y divide-white/[0.06]">{purchases.length === 0 && <p className="p-4 text-sm text-fsl-slate">Nessun acquisto: foto e video delle gare sono nel Match Center.</p>}{purchases.map((x) => <div key={x.id} className="h-14 px-4 flex items-center gap-3 text-sm"><span className="text-[10px] uppercase text-fsl-gold w-10">{x.kind}</span><span className="flex-1 truncate">{x.title}</span><span className="num text-xs text-fsl-slate">{fmtDate(x.created_at)}</span><a className="btn-gold h-8 px-3 text-xs" href={mediaUrl(x.download_url)} data-testid={`purchase-download-${x.id}`}>Scarica</a></div>)}</div></section>
          <section data-testid="fan-reports"><h2 className="fsl-section-title mb-3 flex items-center gap-2"><Flag className="h-5 w-5 text-fsl-gold" /> Le mie segnalazioni</h2><div className="fsl-card divide-y divide-white/[0.06]">{reports.length === 0 && <p className="p-4 text-sm text-fsl-slate">Nessuna segnalazione. Puoi segnalare un errore dal Match Center di ogni gara.</p>}{reports.map((r) => <div key={r.id} className="px-4 py-3 text-sm"><div className="flex items-center justify-between"><span className="font-semibold truncate">{r.subject}</span><span className="text-[10px] uppercase text-fsl-gold">{r.status}</span></div>{r.resolution && <p className="text-xs text-fsl-slate mt-1">{r.resolution}</p>}</div>)}</div></section>
        </div>
      </div>
    </div>
  );
}
