import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Bus, CalendarDays, Clock, Globe, Instagram, Mail, MapPin, MessageCircle, Phone, ShieldCheck, Trophy, Users } from "lucide-react";
import { PostCard } from "@/components/fsl/Article";
import { BadgeChips } from "@/components/fsl/BadgeChips";
import { ClubCrest } from "@/components/fsl/ClubCrest";
import { FavButton } from "@/components/fsl/FavButton";
import { MatchCard } from "@/components/fsl/MatchCard";
import { PlayerCardDialog } from "@/components/fsl/PlayerCard";
import { ShopItemCard } from "@/components/fsl/Shop";
import { ErrorState, LoadingState } from "@/components/fsl/States";
import { ROLE_CODE, ROLE_TONE } from "@/lib/fanta";
import { api, apiError } from "@/lib/api";
import { mediaUrl } from "@/lib/upload";
import { toast } from "sonner";

const COVER = "https://images.unsplash.com/photo-1459865264687-595d652de67e?auto=format&fit=crop&w=1800&q=70";

function Block({ title, icon: Icon, children, className = "", testId }) {
  return <section className={`fsl-card p-5 ${className}`} data-testid={testId}><h2 className="fsl-kicker mb-3 flex items-center gap-2">{Icon && <Icon className="h-4 w-4 text-fsl-gold" />}{title}</h2>{children}</section>;
}

export default function PublicClubHome() {
  const { slug, clubSlug } = useParams();
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [openPlayer, setOpenPlayer] = useState(null);
  const [busy, setBusy] = useState(null);
  const fetchCard = useCallback((pid) => api.get(`/public/tournaments/${slug}/players/${pid}`), [slug]);
  useEffect(() => { setD(null); api.get(`/public/tournaments/${slug}/clubs/${clubSlug}`).then((r) => setD(r.data)).catch(setError); }, [slug, clubSlug]);
  if (error) return <div className="p-10"><ErrorState message={apiError(error)} /></div>;
  if (!d) return <LoadingState full />;
  const c = d.club, p = c.profile || {}, primary = c.colors?.primary || "#7A1E2C", secondary = c.colors?.secondary || "#F4AE2B";
  const contacts = [["phone", Phone, p.phone, `tel:${p.phone}`], ["whatsapp", MessageCircle, p.whatsapp, `https://wa.me/${(p.whatsapp || "").replace(/\D/g, "")}`], ["email", Mail, p.email, `mailto:${p.email}`], ["website", Globe, p.website, p.website], ["instagram", Instagram, p.instagram, `https://instagram.com/${(p.instagram || "").replace("@", "")}`]].filter((x) => x[2]);
  const buy = async (it) => { setBusy(it.id); try { const r = await api.post("/payments/checkout", { item_id: it.id, origin_url: window.location.origin }); window.location.href = r.data.checkout_url; } catch (e) { toast.error(apiError(e)); setBusy(null); } };
  const kpis = [[c.founded_year || d.kpis.founded_year || "—", "Anno di fondazione"], [d.kpis.players, "Tesserati"], [d.kpis.teams, "Squadre"], [d.kpis.tournaments, "Tornei FSL"]];
  return (
    <div data-testid="club-home">
      <section className="relative min-h-[420px] flex items-end overflow-hidden" style={{ background: `linear-gradient(120deg, ${primary} 0%, #041E32 70%)` }}>
        <img src={mediaUrl(c.cover_url) || COVER} alt="" className="absolute inset-0 h-full w-full object-cover opacity-45 mix-blend-luminosity" />
        <div className="absolute inset-0 bg-gradient-to-t from-navy-900 via-navy-900/40 to-transparent" />
        <div className="relative mx-auto max-w-[1488px] w-full px-6 pb-10 pt-24 flex flex-col md:flex-row md:items-end gap-6">
          <div className="shrink-0 drop-shadow-2xl"><ClubCrest club={c} size={140} /></div>
          <div className="flex-1 min-w-0">
            <div className="fsl-kicker mb-2">{d.tournament.name}</div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[0.9] uppercase" data-testid="club-home-name">{c.name}</h1>
            {c.motto && <p className="mt-3 text-base md:text-lg font-display font-bold uppercase tracking-wide" style={{ color: secondary }} data-testid="club-home-motto">{c.motto}</p>}
            <div className="mt-5 flex flex-wrap gap-6">{kpis.map(([v, l]) => <div key={l}><div className="font-display font-extrabold text-3xl num leading-none">{v}</div><div className="text-[10px] uppercase tracking-wider text-fsl-slate mt-1">{l}</div></div>)}</div>
          </div>
          <div className="flex flex-wrap gap-2 md:self-end">{d.teams.map((tm) => <FavButton key={tm.id} kind="teams" id={tm.id} label={`Segui ${tm.name}`} />)}</div>
        </div>
      </section>

      <div className="mx-auto max-w-[1488px] px-6 py-10 space-y-8">
        {c.description && <p className="text-base md:text-lg text-fsl-slate max-w-3xl">{c.description}</p>}

        <section data-testid="club-home-rosters">
          <h2 className="fsl-section-title mb-1 flex items-center gap-2"><Users className="h-5 w-5 text-fsl-gold" /> Le nostre squadre</h2>
          <p className="text-xs text-fsl-slate mb-4">Una rosa per ogni torneo a cui la società è iscritta. Nomi e foto compaiono solo con il consenso della famiglia.</p>
          <div className="grid lg:grid-cols-2 gap-4">
            {d.rosters.map((r) => (
              <div key={r.team.id} className="fsl-card overflow-hidden" data-testid={`club-roster-${r.team.id}`}>
                <div className="h-12 px-4 flex items-center gap-3 border-b border-white/10" style={{ background: `linear-gradient(90deg, ${primary}66, transparent)` }}><Trophy className="h-4 w-4 text-fsl-gold" /><span className="font-display font-bold uppercase">{r.team.name}</span><span className="text-xs text-fsl-slate truncate">{r.competition}</span><span className="ml-auto num text-xs text-fsl-slate">{r.count} tesserati</span></div>
                <div className="grid grid-cols-2 sm:grid-cols-3 divide-x divide-y divide-white/[0.06]">
                  {r.players.map((pl, i) => (
                    <button key={i} type="button" disabled={!pl.id} onClick={() => pl.id && setOpenPlayer(pl.id)} className="h-16 px-3 flex items-center gap-2 text-left enabled:hover:bg-white/[0.04] disabled:cursor-default" data-testid={pl.id ? `club-player-${pl.id}` : undefined}>
                      {pl.photo_url ? <img src={mediaUrl(pl.photo_url)} alt="" className="h-10 w-10 rounded-full object-cover border border-white/20 shrink-0" /> : <span className={`h-10 w-10 rounded-full inline-flex items-center justify-center text-[10px] font-bold uppercase shrink-0 ${ROLE_TONE[ROLE_CODE[pl.role]] || "bg-navy-700"}`}>{ROLE_CODE[pl.role] || "—"}</span>}
                      <span className="min-w-0"><span className="block text-sm font-semibold truncate"><span className="num text-fsl-gold mr-1">{pl.shirt_number ?? ""}</span>{pl.name}</span>{pl.badges.length > 0 && <span className="block"><BadgeChips list={pl.badges} max={2} /></span>}</span>
                    </button>
                  ))}
                  {r.players.length === 0 && <p className="col-span-3 p-4 text-xs text-fsl-slate">Rosa non ancora pubblicata.</p>}
                </div>
              </div>
            ))}
          </div>
          {d.other_tournaments.length > 0 && <div className="mt-3 flex flex-wrap gap-2 text-xs">{d.other_tournaments.map((o) => <Link key={o.slug} to={`/tornei/${o.slug}/squadre/${clubSlug}`} className="h-8 px-3 rounded-full border border-fsl-gold/40 text-fsl-gold inline-flex items-center gap-1 hover:bg-fsl-gold/10"><Trophy className="h-3.5 w-3.5" /> Rosa {o.name} · {o.season}</Link>)}</div>}
        </section>

        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
          <Block title="Sede della società" icon={MapPin} testId="club-home-venue">
            <div className="font-semibold">{d.venue?.name || p.address || "Sede in aggiornamento"}</div>
            {(p.address || d.venue?.address) && <div className="text-sm text-fsl-slate">{p.address || d.venue.address}</div>}
            {(p.hours_office || p.hours_field) && <div className="mt-3 grid grid-cols-2 gap-2 text-xs">{p.hours_office && <div><div className="fsl-label flex items-center gap-1"><Clock className="h-3 w-3" /> Segreteria</div><div className="text-fsl-slate whitespace-pre-line">{p.hours_office}</div></div>}{p.hours_field && <div><div className="fsl-label flex items-center gap-1"><Clock className="h-3 w-3" /> Campo</div><div className="text-fsl-slate whitespace-pre-line">{p.hours_field}</div></div>}</div>}
            {p.directions && <div className="mt-3 text-xs text-fsl-slate flex gap-2"><Bus className="h-4 w-4 shrink-0 text-fsl-gold" /><span className="whitespace-pre-line">{p.directions}</span></div>}
            {(p.services || []).length > 0 && <div className="mt-3 flex flex-wrap gap-1">{p.services.map((s) => <span key={s} className="h-6 px-2 rounded-full bg-navy-700 text-[10px] uppercase font-semibold inline-flex items-center">{s}</span>)}</div>}
          </Block>
          <Block title="Contatti" icon={Phone} testId="club-home-contacts">
            {contacts.length === 0 && <p className="text-sm text-fsl-slate">Contatti in aggiornamento.</p>}
            <ul className="space-y-2 text-sm">{contacts.map(([k, Icon, v, href]) => <li key={k}><a href={href} target={k === "phone" || k === "email" ? undefined : "_blank"} rel="noreferrer" className="flex items-center gap-2 hover:text-fsl-gold"><Icon className="h-4 w-4 text-fsl-gold" /><span className="truncate">{v}</span></a></li>)}</ul>
            {p.email && <a href={`mailto:${p.email}`} className="btn-gold w-full mt-4" data-testid="club-home-write"><Mail className="h-4 w-4" /> Scrivici</a>}
          </Block>
          <Block title="Responsabile della società" icon={ShieldCheck} testId="club-home-manager">
            {p.manager?.name ? <div className="flex items-center gap-3">{p.manager.photo_url ? <img src={mediaUrl(p.manager.photo_url)} alt="" className="h-16 w-16 rounded-full object-cover border-2" style={{ borderColor: secondary }} /> : <span className="h-16 w-16 rounded-full bg-navy-700 inline-flex items-center justify-center font-display font-bold text-xl">{p.manager.name[0]}</span>}<div><div className="font-display font-bold text-lg" style={{ color: secondary }}>{p.manager.name}</div><div className="text-xs text-fsl-slate">{p.manager.role}</div>{p.manager.phone && <a href={`tel:${p.manager.phone}`} className="block text-xs mt-1 hover:text-fsl-gold">{p.manager.phone}</a>}{p.manager.email && <a href={`mailto:${p.manager.email}`} className="block text-xs hover:text-fsl-gold">{p.manager.email}</a>}</div></div> : <p className="text-sm text-fsl-slate">Referente in aggiornamento.</p>}
          </Block>
          <Block title="Prossime partite" icon={CalendarDays} testId="club-home-upcoming">
            <div className="space-y-2">{d.upcoming_matches.slice(0, 3).map((m) => <MatchCard key={m.id} m={m} to={`/tornei/${slug}/partite/${m.id}`} compact />)}{d.upcoming_matches.length === 0 && <p className="text-sm text-fsl-slate">Nessuna gara in programma.</p>}</div>
            {d.recent_matches.length > 0 && <><div className="fsl-label mt-4 mb-2">Ultimi risultati</div><div className="space-y-2">{d.recent_matches.slice(0, 2).map((m) => <MatchCard key={m.id} m={m} to={`/tornei/${slug}/partite/${m.id}`} compact />)}</div></>}
            <Link to={`/tornei/${slug}/partite`} className="text-xs text-fsl-gold hover:underline mt-3 inline-block">Vedi calendario →</Link>
          </Block>
        </div>

        {(d.posts.length > 0 || d.shop.length > 0) && (
          <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6">
            <section data-testid="club-home-posts"><div className="flex items-end justify-between mb-3"><h2 className="fsl-section-title">Blog, interviste e gallery</h2><Link to={`/tornei/${slug}/news`} className="text-xs text-fsl-gold hover:underline">Tutte le news</Link></div>{d.posts.length === 0 ? <p className="text-sm text-fsl-slate">Nessun contenuto pubblicato dalla società.</p> : <div className="grid sm:grid-cols-2 gap-3">{d.posts.slice(0, 4).map((po) => <PostCard key={po.id} p={po} to={`/tornei/${slug}/news/${po.slug}`} />)}</div>}</section>
            <section data-testid="club-home-shop"><div className="flex items-end justify-between mb-3"><h2 className="fsl-section-title">Foto e video</h2><span className="text-xs text-fsl-slate">Foto 0,49 € · Video 0,99 €</span></div>{d.shop.length === 0 ? <p className="text-sm text-fsl-slate">Le foto professionali e i video delle gare compariranno qui.</p> : <div className="grid sm:grid-cols-2 gap-3">{d.shop.slice(0, 4).map((it) => <ShopItemCard key={it.id} it={it} onBuy={buy} busy={busy === it.id} />)}</div>}</section>
          </div>
        )}
      </div>
      <PlayerCardDialog playerId={openPlayer} onClose={() => setOpenPlayer(null)} fetcher={fetchCard} />
    </div>
  );
}
