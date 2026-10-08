import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ShopStrip } from "@/components/fsl/ShopStrip";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";
import { Award, BarChart3, Bus, CalendarDays, Camera, Clock, Globe, Image as ImageIcon, Instagram, Mail, MapPin, Medal, MessageCircle, Newspaper, Pencil, Phone, Shield, ShieldCheck, Sparkles, Star, Target, Trophy, Users, Zap } from "lucide-react";
import { ClubCrest } from "@/components/fsl/ClubCrest";
import { FavButton } from "@/components/fsl/FavButton";
import { PlayerCardDialog } from "@/components/fsl/PlayerCard";
import { BadgePills, GoldPill, HandClaim, HeroStage, HonourCard, MediaCard, MediaStrip, OvrBox, Panel, ResultDot, SectionHead, Signature, StatTile, TagPill } from "@/components/fsl/ProfileKit";
import { ErrorState, LoadingState } from "@/components/fsl/States";
import { ROLE_CODE, ROLE_TONE } from "@/lib/fanta";
import { api, apiError } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { mediaUrl } from "@/lib/upload";
import { toast } from "sonner";
import { TeamCardDialog } from "@/components/fsl/TeamCardDialog";

const ord = (n) => (n ? `${n}°` : "—");
const timeOf = (iso) => { try { return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };

export function MatchesTable({ recent, upcoming, teamIds, slug, maxUpcoming = 3 }) {
  const rows = [...upcoming.slice(0, maxUpcoming).map((m) => ({ ...m, _up: true })), ...recent];
  return (
    <div className="overflow-x-auto -mx-2">
      <table className="w-full text-xs min-w-[440px]">
        <thead><tr className="text-[9px] uppercase tracking-[0.18em] text-fsl-slate"><th className="text-left font-bold px-2 py-2">Data</th><th className="text-left font-bold px-2 py-2">Avversario</th><th className="text-center font-bold px-2 py-2">Risultato</th><th className="text-right font-bold px-2 py-2">Competizione</th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={4} className="px-2 py-4 text-fsl-slate">Nessuna gara disputata.</td></tr>}
          {rows.map((m) => {
            const mine = teamIds.has(m.home.id) ? "home" : "away", opp = mine === "home" ? m.away : m.home;
            const gf = m.score?.[mine], ga = m.score?.[mine === "home" ? "away" : "home"];
            const r = m._up ? null : gf > ga ? "W" : gf < ga ? "L" : "D";
            return (
              <tr key={m.id} className="border-t border-white/[0.06] hover:bg-white/[0.04]">
                <td className="px-2 py-2.5 num text-fsl-slate whitespace-nowrap"><Link to={`/tornei/${slug}/partite/${m.id}`}>{fmtDate(m.kickoff_at)}</Link></td>
                <td className="px-2 py-2.5"><Link to={`/tornei/${slug}/squadre/${opp.club?.slug || ""}`} className="inline-flex items-center gap-2 min-w-0"><ClubCrest club={opp.club} size={22} /><span className="truncate font-semibold">{opp.club?.name || opp.name}</span><span className="text-[9px] text-fsl-slate uppercase">{mine === "home" ? "casa" : "trasf."}</span></Link></td>
                <td className="px-2 py-2.5 text-center whitespace-nowrap">{m._up ? <span className="inline-flex h-6 items-center rounded-md border border-fsl-gold/60 px-2 text-[10px] font-bold uppercase text-fsl-gold num">{timeOf(m.kickoff_at)}</span> : <span className="inline-flex items-center gap-1.5"><ResultDot r={r} /><span className="num font-bold">{gf} - {ga}</span></span>}</td>
                <td className="px-2 py-2.5 text-right text-fsl-slate truncate max-w-[140px]">{m.competition_name || m.round_name}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function PublicClubHome() {
  const { slug, clubSlug } = useParams();
  const cart = useCart();
  const { user } = useAuth();
  const isStaff = !!user && (user.is_super_admin || ["director", "secretary"].includes(user.role));
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [openPlayer, setOpenPlayer] = useState(null);
  const [teamCard, setTeamCard] = useState(null);
  const fetchCard = useCallback((pid) => api.get(`/public/tournaments/${slug}/players/${pid}`), [slug]);
  useEffect(() => { setD(null); api.get(`/public/tournaments/${slug}/clubs/${clubSlug}`).then((r) => setD(r.data)).catch(setError); }, [slug, clubSlug]);
  if (error) return <div className="p-10"><ErrorState message={apiError(error)} /></div>;
  if (!d) return <LoadingState full />;
  const c = d.club, p = c.profile || {}, secondary = c.colors?.secondary || "#F4AE2B";
  const contacts = [["phone", Phone, p.phone, `tel:${p.phone}`], ["whatsapp", MessageCircle, p.whatsapp, `https://wa.me/${(p.whatsapp || "").replace(/\D/g, "")}`], ["email", Mail, p.email, `mailto:${p.email}`], ["website", Globe, p.website, p.website], ["instagram", Instagram, p.instagram, `https://instagram.com/${(p.instagram || "").replace("@", "")}`]].filter((x) => x[2]);
  const buy = (it) => cart.add({ id: it.id, title: it.title, price: it.price, kind: it.kind, image_url: it.preview_url, scope: slug });
  const teamIds = new Set(d.teams.map((t) => t.id));
  const st = d.standings || [], main = st[0];
  const sum = (k) => st.reduce((a, x) => a + (x[k] || 0), 0);
  const h = d.history || {}, honours = h.honours || {}, seasons = h.seasons || [];
  const [first, ...rest] = c.name.split(" "); const last = rest.join(" ");
  const stats = [[Shield, c.founded_year || d.kpis.founded_year || "—", "Fondazione"], [Users, d.kpis.players, "Tesserati"], [Users, d.kpis.teams, "Squadre"], [Trophy, d.kpis.tournaments, "Tornei FSL"], [BarChart3, sum("PT"), "Punti"], [Star, sum("V"), "Vittorie"], [Target, sum("GF"), "Gol fatti"], [Medal, honours.titles || 0, "Titoli"]];
  const palmares = [...seasons.filter((s) => s.champion).map((s) => ({ code: "campione", label: `Campione ${s.competition}`, scope: "career" })), ...seasons.filter((s) => s.promoted).map((s) => ({ code: "promosso", label: `Promossa · ${s.season_label}`, scope: "season" })), ...seasons.filter((s) => !s.champion && s.pos && s.pos <= 3).map((s) => ({ code: "podio", label: `${s.pos}° posto · ${s.competition}`, scope: "season" })), ...st.filter((x) => x.pos === 1).map((x) => ({ code: "top11", label: `In testa · ${x.competition}`, scope: "match" }))];
  const services = p.services || [];
  const tagline = [c.city, `${d.kpis.teams} squadr${d.kpis.teams === 1 ? "a" : "e"} FSL`, main ? `${ord(main.pos)} in ${main.competition.split("·").pop().trim()}` : null].filter(Boolean);
  return (
    <div className="bg-ink-950" data-testid="club-home">
      <HeroStage testId="club-hero">
        <div className="mx-auto max-w-[1488px] px-6 pt-8 pb-10 lg:pb-14">
          <div className="grid lg:grid-cols-[1.1fr_minmax(260px,0.9fr)_auto] gap-6 lg:gap-8 items-center">
            <div className="relative z-10 min-w-0">
              <GoldPill testId="club-home-kicker">{d.tournament.name}</GoldPill>
              <h1 className="mt-4 font-display font-extrabold uppercase leading-[0.85] text-5xl sm:text-6xl lg:text-7xl" data-testid="club-home-name" style={{ textShadow: "0 8px 24px rgba(0,0,0,0.6)" }}><span className="block text-white">{first}</span>{last && <span className="block" style={{ background: "linear-gradient(180deg,#FFF0B8 0%,#F4AE2B 55%,#C8811A 100%)", WebkitBackgroundClip: "text", color: "transparent" }}>{last}</span>}</h1>
              {c.motto && <Signature className="mt-4 !rotate-0 !text-2xl sm:!text-3xl" testId="club-home-motto"><span style={{ color: secondary }}>«{c.motto}»</span></Signature>}
              <p className="mt-4 text-sm sm:text-base text-white/85 font-medium" data-testid="club-tagline">{tagline.join(" · ")}</p>
              <div className="mt-5 flex flex-wrap gap-2">{d.teams.map((tm) => <FavButton key={tm.id} kind="teams" id={tm.id} label={`Segui ${tm.name}`} small />)}{isStaff && <Link to={`/admin/t/${d.tournament.id}/societa/${c.id}`} className="h-8 px-3 rounded-full bg-fsl-gold text-ink-950 text-xs font-bold inline-flex items-center gap-1.5 hover:brightness-110" data-testid="club-home-admin-edit"><Pencil className="h-3.5 w-3.5" /> Modifica homepage</Link>}</div>
            </div>
            <div className="relative flex justify-center min-h-[280px] items-center">
              <span className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 num font-display font-extrabold text-[200px] sm:text-[260px] leading-none text-white/[0.07] select-none pointer-events-none" aria-hidden>{c.founded_year || (c.short_name || c.name).slice(0, 3).toUpperCase()}</span>
              <div className="relative drop-shadow-[0_24px_40px_rgba(0,0,0,0.7)]" data-testid={c.cover_is_default ? "club-cover-default" : "club-cover-own"}><ClubCrest club={c} size={220} /></div>
            </div>
            <div className="flex lg:flex-col items-center lg:items-end justify-between gap-6">
              <HandClaim />
              <OvrBox kicker="Classifica" value={main ? ord(main.pos) : "—"} label={main ? `${main.PT} punti · ${main.competition.split("·").pop().trim()}` : "Classifica"} testId="club-standing-box" />
            </div>
          </div>
        </div>
      </HeroStage>

      <div className="mx-auto max-w-[1488px] px-6 py-8 space-y-10">
        <section data-testid="club-stats">
          <SectionHead icon={BarChart3} title="La società in numeri" />
          <div className="grid grid-cols-4 lg:grid-cols-8 gap-3">{stats.map(([Icon, v, l]) => <StatTile key={l} icon={Icon} value={v} label={l} testId={`club-stat-${l.toLowerCase().replace(/\s+/g, "-")}`} />)}</div>
        </section>

        <section data-testid="club-groups-public">
          <SectionHead icon={Users} title="I nostri gruppi" count={(d.groups || []).length} />
          {(d.groups || []).length === 0 ? <p className="text-sm text-fsl-slate">Nessun gruppo iscritto a questo torneo.</p> : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {d.groups.map((g) => (
                <Link key={g.id} to={g.status === "pending" ? "#" : `/tornei/${slug}/squadre/${clubSlug}/gruppi/${g.id}`} onClick={(e) => g.status === "pending" && e.preventDefault()} className={`fsl-card p-4 flex items-start gap-3 transition-colors ${g.status === "pending" ? "border-dashed border-fsl-warning/40 cursor-default" : "hover:border-fsl-gold/60"}`} data-testid={`club-group-public-${g.id}`}>
                  <div className="font-display font-extrabold text-3xl num text-fsl-gold leading-none">{g.category}</div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate">{g.name}</div>
                    <div className="text-xs text-fsl-slate truncate">{[g.birth_year && `Anno ${g.birth_year}`, g.level].filter(Boolean).join(" · ") || "—"}</div>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-bold uppercase">
                      {g.status === "pending" ? <span className="h-5 px-2 rounded bg-fsl-warning/20 text-fsl-warning border border-fsl-warning/40 inline-flex items-center">In attesa di invito</span>
                        : g.competition_name ? <span className="h-5 px-2 rounded bg-fsl-gold text-ink-950 inline-flex items-center">{g.competition_name}</span>
                        : <span className="h-5 px-2 rounded border border-white/15 text-fsl-slate inline-flex items-center">Iscritto · girone da assegnare</span>}
                      {g.players_count > 0 && <span className="h-5 px-2 rounded bg-white/10 text-fsl-white inline-flex items-center num">{g.players_count} giocatori</span>}
                    </div>
                    {g.status !== "pending" && <div className="mt-2 text-[11px] text-fsl-gold">Rosa e calendario →</div>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>


        <section data-testid="club-palmares">
          <SectionHead icon={Award} title="Palmarès e riconoscimenti" count={palmares.length} to={h.org_club_id ? `/albo-doro/societa/${h.org_club_id}` : undefined} linkLabel="Albo d'oro" />
          {palmares.length ? <BadgePills list={palmares} max={12} /> : <p className="text-sm text-fsl-slate">La storia della società si scrive stagione dopo stagione: i riconoscimenti compariranno qui.</p>}
        </section>

        <div className="grid xl:grid-cols-[1.45fr_1fr] gap-8 items-start">
          <section data-testid="club-home-posts">
            <SectionHead icon={Newspaper} title="News, interviste e gallery" to={`/tornei/${slug}/news`} />
            {d.posts.length ? <div className="grid sm:grid-cols-3 gap-4">{d.posts.slice(0, 3).map((po) => <MediaCard key={po.id} p={po} to={`/tornei/${slug}/news/${po.slug}`} />)}</div> : <p className="text-sm text-fsl-slate">Nessun contenuto pubblicato dalla società.</p>}
          </section>
          <Panel icon={CalendarDays} title="Le nostre partite" to={`/tornei/${slug}/partite`} testId="club-home-matches">
            <MatchesTable recent={d.recent_matches} upcoming={d.upcoming_matches} teamIds={teamIds} slug={slug} />
          </Panel>
        </div>

        <section data-testid="club-home-shop">
          <SectionHead icon={Camera} title="Foto e video" to={d.shop.length ? `/tornei/${slug}` : undefined} linkLabel="Vedi tutti" />
          {d.shop.length ? <MediaStrip items={d.shop} onBuy={buy} /> : <p className="text-sm text-fsl-slate">Le foto professionali e i video delle gare compariranno qui.</p>}
        </section>
        <ShopStrip slug={slug} placement="club" clubId={d.club?.id} title="Negozio FSL · prodotti per la società" />

        <div className="grid lg:grid-cols-[1.2fr_0.8fr_1fr] gap-6 items-start">
          <Panel icon={ShieldCheck} title="Chi siamo" testId="club-home-about">
            {c.description ? <p className="text-sm leading-relaxed text-white/90 whitespace-pre-line">{c.description}</p> : <p className="text-sm text-fsl-slate">Presentazione in aggiornamento.</p>}
            <div className="mt-4 grid sm:grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border border-white/10 bg-ink-950/60 p-3" data-testid="club-home-venue"><div className="text-[9px] uppercase tracking-wider text-fsl-slate flex items-center gap-1"><MapPin className="h-3 w-3 text-fsl-gold" /> Sede</div><div className="font-semibold mt-1">{d.venue?.name || p.address || "In aggiornamento"}</div>{(p.address || d.venue?.address) && <div className="text-xs text-fsl-slate">{p.address || d.venue.address}</div>}{d.venue?.maps_url && <a href={d.venue.maps_url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[11px] text-fsl-gold hover:underline" data-testid="club-home-venue-maps">Apri in Google Maps ↗</a>}{(p.hours_office || p.hours_field) && <div className="mt-2 text-[11px] text-fsl-slate flex items-start gap-1"><Clock className="h-3 w-3 mt-0.5 text-fsl-gold" /><span className="whitespace-pre-line">{[p.hours_office && `Segreteria: ${p.hours_office}`, p.hours_field && `Campo: ${p.hours_field}`].filter(Boolean).join("\n")}</span></div>}{p.directions && <div className="mt-2 text-[11px] text-fsl-slate flex gap-1"><Bus className="h-3 w-3 mt-0.5 text-fsl-gold shrink-0" /><span className="whitespace-pre-line">{p.directions}</span></div>}</div>
              <div className="rounded-lg border border-white/10 bg-ink-950/60 p-3" data-testid="club-home-contacts"><div className="text-[9px] uppercase tracking-wider text-fsl-slate flex items-center gap-1"><Phone className="h-3 w-3 text-fsl-gold" /> Contatti</div>{contacts.length === 0 && <div className="text-xs text-fsl-slate mt-1" data-testid="club-home-contacts-private">{c.private_visible ? "In aggiornamento." : "Recapiti riservati: per contattare la società rivolgiti all'organizzazione FSL."}</div>}<ul className="mt-1 space-y-1 text-xs">{contacts.map(([k, Icon, v, href]) => <li key={k}><a href={href} target={k === "phone" || k === "email" ? undefined : "_blank"} rel="noreferrer" className="flex items-center gap-2 hover:text-fsl-gold"><Icon className="h-3.5 w-3.5 text-fsl-gold" /><span className="truncate">{v}</span></a></li>)}</ul>{p.email && <a href={`mailto:${p.email}`} className="btn-gold h-8 w-full mt-3 text-xs" data-testid="club-home-write"><Mail className="h-3.5 w-3.5" /> Scrivici</a>}</div>
            </div>
            {p.manager?.name && <div className="mt-3 flex items-center gap-3 rounded-lg border border-white/10 bg-ink-950/60 p-3" data-testid="club-home-manager">{p.manager.photo_url ? <img src={mediaUrl(p.manager.photo_url)} alt="" className="h-12 w-12 rounded-full object-cover border-2" style={{ borderColor: secondary }} /> : <span className="h-12 w-12 rounded-full bg-navy-700 inline-flex items-center justify-center font-display font-bold text-lg">{p.manager.name[0]}</span>}<div className="min-w-0"><div className="text-[9px] uppercase tracking-wider text-fsl-slate">Responsabile</div><div className="font-display font-bold" style={{ color: secondary }}>{p.manager.name}</div><div className="text-[11px] text-fsl-slate">{p.manager.role}{p.manager.phone ? ` · ${p.manager.phone}` : ""}</div></div></div>}
          </Panel>
          <Panel icon={Zap} title="Punti di forza" testId="club-home-strengths">
            {services.length ? <div className="flex flex-wrap gap-2">{services.map((s) => <TagPill key={s} icon={[Sparkles, Zap, Users, Star, Shield, Target][Math.abs([...s].reduce((a, ch) => a + ch.charCodeAt(0), 0)) % 6]}>{s}</TagPill>)}</div> : <div className="flex flex-wrap gap-2"><TagPill icon={Users}>Settore giovanile</TagPill><TagPill icon={Star}>Spirito FSL</TagPill>{main?.pos === 1 && <TagPill icon={Trophy}>Capolista</TagPill>}</div>}
          </Panel>
          <Panel icon={Trophy} title="Ultimi riconoscimenti" to={h.org_club_id ? `/albo-doro/societa/${h.org_club_id}` : undefined} testId="club-home-history">
            {seasons.length ? <div className="grid grid-cols-3 gap-2">{seasons.slice(0, 3).map((s, i) => <HonourCard key={i} icon={s.champion ? Trophy : s.promoted ? Star : Medal} title={s.champion ? "Campione" : s.promoted ? "Promossa" : `${s.pos}° posto`} subtitle={s.competition} date={s.season_label} />)}</div> : <p className="text-sm text-fsl-slate">I riconoscimenti compaiono alla chiusura di ogni stagione FSL.</p>}
          </Panel>
        </div>

        <section data-testid="club-home-rosters">
          <SectionHead icon={Users} title="Le nostre squadre" />
          <p className="text-xs text-fsl-slate -mt-2 mb-4">Una rosa per ogni torneo a cui la società è iscritta. Nomi e foto compaiono solo con il consenso della famiglia.</p>
          <div className="grid lg:grid-cols-2 gap-4">
            {d.rosters.map((r) => (
              <div key={r.team.id} className="rounded-2xl border border-white/10 bg-navy-800/80 overflow-hidden" data-testid={`club-roster-${r.team.id}`}>
                <div className="h-12 px-4 flex items-center gap-3 border-b border-fsl-gold/30 bg-ink-950/60"><Trophy className="h-4 w-4 text-fsl-gold" /><span className="font-display font-bold uppercase">{r.team.name}</span><span className="text-xs text-fsl-slate truncate">{r.competition}</span><span className="ml-auto num text-xs text-fsl-slate">{r.count} tesserati</span><button className="btn-gold h-8 px-3 text-xs shrink-0" onClick={() => setTeamCard(r.team)} data-testid={`team-card-open-${r.team.id}`}><ImageIcon className="h-3.5 w-3.5" /> Cartolina · {`${Number(d.prices?.team_card ?? 2.49).toFixed(2).replace(".", ",")} €`}</button></div>
                <div className="grid grid-cols-2 sm:grid-cols-3 divide-x divide-y divide-white/[0.06]">
                  {r.players.map((pl, i) => (
                    <button key={i} type="button" disabled={!pl.id} onClick={() => pl.id && setOpenPlayer(pl.id)} className="h-16 px-3 flex items-center gap-2 text-left enabled:hover:bg-white/[0.04] disabled:cursor-default" data-testid={pl.id ? `club-player-${pl.id}` : undefined}>
                      {pl.photo_url ? <img src={mediaUrl(pl.photo_url)} alt="" className="h-10 w-10 rounded-full object-cover border border-fsl-gold/50 shrink-0" /> : <span className={`h-10 w-10 rounded-full inline-flex items-center justify-center text-[10px] font-bold uppercase shrink-0 ${ROLE_TONE[ROLE_CODE[pl.role]] || "bg-navy-700"}`}>{ROLE_CODE[pl.role] || "—"}</span>}
                      <span className="min-w-0 flex-1 flex items-center gap-2"><span className="block text-sm font-semibold truncate"><span className="num text-fsl-gold mr-1">{pl.shirt_number ?? ""}</span>{pl.name}</span>{pl.badges.length > 0 && <span className="ml-auto shrink-0 inline-flex items-center gap-1 h-6 px-2 rounded-full border border-fsl-gold/50 text-fsl-gold text-[10px] font-bold num" title={`${pl.badges.length} badge`} data-testid={pl.id ? `club-player-badges-${pl.id}` : undefined}><Award className="h-3 w-3" />{pl.badges.length}</span>}</span>
                    </button>
                  ))}
                  {r.players.length === 0 && <p className="col-span-3 p-4 text-xs text-fsl-slate">Rosa non ancora pubblicata.</p>}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">{d.other_tournaments.map((o) => <Link key={o.slug} to={`/tornei/${o.slug}/squadre/${clubSlug}`} className="h-8 px-3 rounded-full border border-fsl-gold/40 text-fsl-gold inline-flex items-center gap-1 hover:bg-fsl-gold/10"><Trophy className="h-3.5 w-3.5" /> Rosa {o.name} · {o.season}</Link>)}{c.org_club_id && <Link to={`/club/${c.org_club_id}`} className="h-8 px-3 rounded-full border border-white/20 text-white inline-flex items-center gap-1 hover:bg-white/10" data-testid="club-home-entity-link"><Shield className="h-3.5 w-3.5" /> Scheda società: tutti i tornei e i gruppi</Link>}</div>
        </section>

        <section data-testid="club-home-gallery">
          <SectionHead icon={Camera} title="La società in immagini" />
          {c.gallery_is_default && <span className="block -mt-2 mb-3 text-[10px] uppercase tracking-wider text-fsl-slate" data-testid="club-gallery-default-note">Immagini FSL · in attesa delle foto della società</span>}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {c.gallery.slice(0, 4).map((u, i) => <div key={u + i} className={`group relative overflow-hidden rounded-xl border border-white/10 ${i === 0 ? "col-span-2 row-span-2 aspect-square md:aspect-auto" : "aspect-square"}`} data-testid={`club-gallery-${i}`}><img src={mediaUrl(u)} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" /></div>)}
          </div>
        </section>
      </div>
      <PlayerCardDialog playerId={openPlayer} onClose={() => setOpenPlayer(null)} fetcher={fetchCard} />
      {teamCard && <TeamCardDialog slug={slug} team={teamCard} onClose={() => setTeamCard(null)} />}
    </div>
  );
}
