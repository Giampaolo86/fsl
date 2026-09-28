import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Activity, ArrowLeft, Award, BarChart3, BookOpen, CalendarDays, Camera, Check, Footprints, Hand, Heart, ImagePlus, Loader2, Newspaper, Pencil, Quote, Ruler, Star, Target, Trophy, User, Users, Weight, X, Zap } from "lucide-react";
import { FavButton } from "@/components/fsl/FavButton";
import { PlayerProfileEditor, FOOT_LABEL } from "@/components/fsl/PlayerProfileEditor";
import { PlayerPostcard } from "@/components/fsl/PlayerPostcard";
import { PlayerIdOffer } from "@/components/fsl/PlayerIdCard";
import { BadgePills, GoldPill, HandClaim, HeroStage, HonourCard, MediaCard, MediaStrip, OvrBox, Panel, ResultDot, SectionHead, Signature, StatTile, TagPill, badgeIcon } from "@/components/fsl/ProfileKit";
import { ClubCrest } from "@/components/fsl/ClubCrest";
import { buyProduct } from "@/pages/DigitalProduct";
import { ErrorState, LoadingState } from "@/components/fsl/States";
import { useAuth } from "@/context/AuthContext";
import { api, apiError } from "@/lib/api";
import { fmtVote } from "@/lib/fanta";
import { fmtDate } from "@/lib/format";
import { mediaUrl } from "@/lib/upload";
import { cutoutPhoto } from "@/lib/cutout";
import { useCutoutEditor } from "@/components/fsl/CutoutEditor";
import { toast } from "sonner";

export const profileLink = (pathname, pid) => {
  const a = pathname.match(/^\/admin\/t\/([^/]+)/);
  if (a) return `/admin/t/${a[1]}/giocatori/${pid}`;
  if (pathname.startsWith("/societa")) return `/societa/giocatori/${pid}`;
  const t = pathname.match(/^\/tornei\/([^/]+)/);
  return t ? `/tornei/${t[1]}/giocatori/${pid}` : null;
};

const ROLE_TAG = { Portiere: "Leader difensivo", Difensore: "Muro della difesa", Centrocampista: "Motore della squadra", Esterno: "Velocità sulla fascia", Attaccante: "Istinto del gol" };
const autoTags = (card) => { const t = card.totals || {}; const out = [card.role, ROLE_TAG[card.role]].filter(Boolean); if ((card.avg_fanta || 0) >= 7) out.push("Top performer"); else if ((t.goal || 0) >= 3) out.push("Bomber"); else if (card.top11_count) out.push("Top 11"); else out.push("Talento FSL"); return out; };
const RESULT_LABEL = { W: "Vittoria", D: "Pareggio", L: "Sconfitta" };

export default function PlayerProfile({ mode = "public" }) {
  const { slug, tournamentId, playerId } = useParams();
  const { user } = useAuth();
  const [card, setCard] = useState(null);
  const [error, setError] = useState(null);
  const [tid, setTid] = useState(mode === "admin" ? tournamentId : mode === "club" ? user?.memberships?.find((m) => m.role === "club_manager")?.tournament_id : null);
  const [edit, setEdit] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [buyingAlbum, setBuyingAlbum] = useState(false);
  const [idPreview, setIdPreview] = useState(null);
  const [buyingCard, setBuyingCard] = useState(false);
  const [refine, cutoutEditor] = useCutoutEditor();
  const buyCard = async (kind) => { setBuyingCard(true); try { await buyProduct(slug || card?.tournament?.slug || "", kind, playerId); } catch (e) { toast.error(apiError(e)); setBuyingCard(false); } };
  const buyAlbum = async () => { setBuyingAlbum(true); try { await buyProduct(slug || card?.tournament?.slug || "", "album", playerId); } catch (e) { toast.error(apiError(e)); setBuyingAlbum(false); } };
  const uploadPhoto = async (file) => {
    if (!file) return; setUploading(true);
    const fd = new FormData(); const cut = await cutoutPhoto(file, (k, pct) => k === "download" && toast.message(`Scarico il modello AI per lo scontorno… ${pct}%`, { id: "cutout-dl", duration: 1500 }));
    fd.append("file", card.can_edit === "guardian" ? cut : await refine(file, cut));
    try { const r = await api.post(`/tournaments/${tid}/players/${playerId}/photo`, fd, { headers: { "Content-Type": "multipart/form-data" } }); toast.success(r.data.pending ? "Foto inviata: sarà visibile dopo l'approvazione della società" : "Foto aggiornata"); load(); } catch (e) { toast.error(apiError(e)); } finally { setUploading(false); }
  };
  const reviewPhoto = async (approve) => { try { await api.post(`/tournaments/${tid}/players/${playerId}/photo/review`, { approve }); toast.success(approve ? "Foto approvata e pubblicata" : "Foto rifiutata"); load(); } catch (e) { toast.error(apiError(e)); } };
  const load = useCallback(async () => {
    try {
      let t = tid;
      if (mode === "public") {
        const pub = await api.get(`/public/tournaments/${slug}/players/${playerId}`);
        const home = await api.get(`/public/tournaments/${slug}`);
        t = home.data.tournament.id; setTid(t);
        if (user) { try { const auth = await api.get(`/tournaments/${t}/players/${playerId}/card`); setCard(auth.data); return; } catch { /* non autorizzato: scheda pubblica */ } }
        setCard(pub.data);
      } else {
        const r = await api.get(`/tournaments/${t}/players/${playerId}/card`);
        setCard(r.data);
      }
    } catch (e) { setError(e); }
  }, [mode, slug, playerId, tid, user]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const sl = slug || card?.tournament?.slug; if (sl && card && (card.public_ok || card.can_edit)) api.get(`/public/tournaments/${sl}/players/${playerId}/card-preview`).then((r) => setIdPreview(r.data)).catch(() => setIdPreview(null)); }, [slug, card, playerId]);
  if (error) return <div className="p-10"><ErrorState message={apiError(error)} /></div>;
  if (!card) return <LoadingState full />;
  const p = card.profile || {}, t = card.totals || {};
  const tSlug = slug || card?.tournament?.slug;
  const backTo = mode === "admin" ? `/admin/t/${tid}/rose` : mode === "club" ? "/societa/rose" : `/tornei/${slug}`;
  const matchTo = (mid) => (mode === "admin" ? `/admin/t/${tid}/partite/${mid}` : mode === "club" ? `/societa/partite/${mid}` : `/tornei/${slug}/partite/${mid}`);
  const newsTo = (po) => (mode === "public" ? `/tornei/${slug}/news/${po.slug}` : undefined);
  const buy = async (it) => { try { const r = await api.post("/payments/checkout", { item_id: it.id, origin_url: window.location.origin }); window.location.href = r.data.checkout_url; } catch (e) { toast.error(apiError(e)); } };
  const [first, ...rest] = card.name.split(" "); const last = rest.join(" ");
  const tags = p.tagline ? p.tagline.split(/\s*[·,|]\s*/).filter(Boolean) : autoTags(card);
  const strengths = p.strengths?.length ? p.strengths : [];
  const facts = [[Ruler, "Altezza", p.height_cm ? `${p.height_cm} cm` : null], [Weight, "Peso", p.weight_kg ? `${p.weight_kg} kg` : null], [Footprints, "Piede", FOOT_LABEL[p.foot]], [Star, "Soprannome", p.nickname], [Heart, "Idolo", p.idol], [Heart, "Squadra del cuore", p.favorite_team]].filter((x) => x[2]);
  const recentBadges = [...(card.badges || [])].reverse().slice(0, 3);
  const showRich = card.public_ok || card.can_edit;
  const mediaItems = (card.media?.shop || []).filter((it) => it.kind === "photo" || it.kind === "video");
  const stats = [[Users, t.presences || 0, "Presenze"], [Target, t.goal || 0, "Goal"], [Footprints, t.assist || 0, "Assist"], [Star, fmtVote(card.avg_vote), "Media voto"], [BarChart3, fmtVote(card.avg_fanta), "Media fanta"], [Hand, t.clean_sheets || 0, "Clean sheet"], [Trophy, t.mvp || 0, "MVP"], [Users, card.top11_count || 0, "Top 11"]];
  return (
    <div className="bg-ink-950 text-fsl-white" data-testid="player-profile">
      <HeroStage className={mode === "public" ? "" : "rounded-2xl border border-white/10"} testId="player-hero">
        <div className="mx-auto max-w-[1488px] px-6 pt-6 pb-10 lg:pb-14 relative">
          <Link to={backTo} className="text-xs text-fsl-white/70 hover:text-fsl-white inline-flex items-center gap-1" data-testid="player-profile-back"><ArrowLeft className="h-3.5 w-3.5" /> Indietro</Link>
          <div className="mt-4 grid lg:grid-cols-[1.1fr_minmax(280px,0.9fr)_auto] gap-6 lg:gap-8 items-center">
            <div className="relative z-10 min-w-0">
              <GoldPill testId="player-role-pill">{card.role || "Giocatore"}</GoldPill>
              <h1 className="mt-4 font-display font-extrabold uppercase leading-[0.85] text-5xl sm:text-6xl lg:text-7xl" data-testid="player-profile-name" style={{ textShadow: "0 8px 24px rgba(0,0,0,0.6)" }}><span className="block text-white">{first}</span>{last && <span className="block" style={{ background: "linear-gradient(180deg,#FFF0B8 0%,#F4AE2B 55%,#C8811A 100%)", WebkitBackgroundClip: "text", color: "transparent" }}>{last}</span>}</h1>
              <div className="mt-5 flex flex-wrap items-center gap-3 text-sm sm:text-base">
                {card.club && <span className="inline-flex items-center gap-2 font-display font-bold uppercase tracking-wide"><ClubCrest club={card.club} size={30} />{card.club.name}</span>}
                {card.category && <><span className="h-6 w-px bg-white/30" /><span className="leading-none"><span className="block text-[9px] uppercase tracking-[0.2em] text-white/70">Categoria</span><span className="font-display font-extrabold text-lg">{card.category}</span></span></>}
              </div>
              <p className="mt-4 text-sm sm:text-base text-white/85 font-medium" data-testid="player-tagline">{tags.join(" · ")}</p>
              {p.quote && <p className="mt-3 text-sm italic text-fsl-gold/90 flex gap-2 max-w-xl" data-testid="player-profile-quote"><Quote className="h-4 w-4 shrink-0" />{p.quote}</p>}
              <div className="mt-5 flex flex-wrap gap-2 items-center">
                {card.public_ok && <FavButton kind="players" id={card.player_id} label="Segui giocatore" small />}
                {card.can_edit && <button className="btn-gold h-9" onClick={() => setEdit(true)} data-testid="player-profile-edit"><Pencil className="h-4 w-4" /> Modifica profilo</button>}
                {card.can_edit === "guardian" && <span className="text-xs text-fsl-gold">Sei abbinato come genitore/tutore</span>}
              </div>
            </div>
            <div className="relative flex justify-center lg:justify-end min-h-[320px] lg:-my-10">
              <span className="absolute top-0 left-1/2 -translate-x-[70%] num font-display font-extrabold text-[260px] sm:text-[340px] leading-none select-none pointer-events-none" style={{ color: "rgba(255,255,255,0.14)", textShadow: "0 0 60px rgba(255,255,255,0.12), 0 0 2px rgba(255,255,255,0.4)" }} aria-hidden>{card.shirt_number ?? ""}</span>
              <span className="absolute left-1/2 -translate-x-1/2 bottom-6 h-40 w-[80%] rounded-full pointer-events-none" style={{ background: "radial-gradient(ellipse at center, rgba(244,174,43,0.45) 0%, rgba(244,174,43,0) 70%)", filter: "blur(18px)" }} aria-hidden />
              <div className="relative">
                {card.photo_url ? <img src={mediaUrl(card.photo_url)} alt="" className="relative h-[340px] sm:h-[420px] lg:h-[460px] w-auto max-w-[360px] object-contain object-bottom" style={{ maskImage: "linear-gradient(180deg,#000 82%,transparent 100%)", WebkitMaskImage: "linear-gradient(180deg,#000 82%,transparent 100%)", filter: "drop-shadow(0 24px 40px rgba(0,0,0,0.7)) drop-shadow(0 0 18px rgba(244,174,43,0.25))" }} data-testid="player-profile-photo" /> : <div className="relative h-72 w-72 sm:h-80 sm:w-80 rounded-[28px] border border-fsl-gold/40 bg-ink-950/60 flex items-center justify-center"><User className="h-24 w-24 text-white/20" /></div>}
                {card.can_edit && <label className="absolute bottom-3 right-3 h-11 w-11 rounded-full bg-fsl-gold text-ink-950 inline-flex items-center justify-center cursor-pointer shadow-elev hover:scale-105 transition-transform" title="Carica foto: lo sfondo viene rimosso automaticamente"><input type="file" accept="image/*" className="hidden" onChange={(e) => uploadPhoto(e.target.files[0])} disabled={uploading} data-testid="player-photo-input" />{uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}</label>}
              </div>
            </div>
            <div className="flex lg:flex-col items-center lg:items-end justify-between gap-6 lg:gap-4">
              <HandClaim />
              <Signature className="hidden lg:block text-right pr-2">{first}<br />{last}</Signature>
              <OvrBox value={card.avg_fanta == null ? "–" : Number(card.avg_fanta).toFixed(1)} testId="player-ovr" />
            </div>
          </div>
        </div>
      </HeroStage>

      <div className="mx-auto max-w-[1488px] px-6 py-8 space-y-10">
        {card.photo_pending_url && (
          <div className="fsl-card-gold p-4 flex flex-wrap items-center gap-4" data-testid="player-photo-pending">
            <img src={mediaUrl(card.photo_pending_url)} alt="" className="h-20 w-20 rounded-xl object-cover border border-fsl-gold/60" />
            <div className="flex-1 min-w-[200px]"><div className="font-semibold">Nuova foto in attesa di approvazione</div><p className="text-xs text-fsl-slate">{card.can_edit === "guardian" ? "La società o l'organizzazione la verificherà prima di pubblicarla." : "Caricata dal genitore/tutore: verifica che sia adatta e approva per pubblicarla."}</p></div>
            {(card.can_edit === "staff" || card.can_edit === "club") && <div className="flex gap-2"><button className="btn-gold h-9" onClick={() => reviewPhoto(true)} data-testid="player-photo-approve"><Check className="h-4 w-4" /> Approva</button><button className="btn-ghost h-9" onClick={() => reviewPhoto(false)} data-testid="player-photo-reject"><X className="h-4 w-4" /> Rifiuta</button></div>}
          </div>
        )}

        <section data-testid="player-stats">
          <SectionHead icon={BarChart3} title="Statistiche · Gare ufficiali" />
          <div className="grid grid-cols-4 lg:grid-cols-8 gap-3">{stats.map(([Icon, v, l]) => <StatTile key={l} icon={Icon} value={v} label={l} testId={`player-stat-${l.toLowerCase().replace(/\s+/g, "-")}`} />)}</div>
        </section>

        <section data-testid="player-badges">
          <SectionHead icon={Award} title="Badge e riconoscimenti" count={card.badges?.length || 0} />
          <BadgePills list={card.badges || []} max={14} />
        </section>

        <div className="grid xl:grid-cols-[1.45fr_1fr] gap-8 items-start">
          <section data-testid="player-profile-media">
            <SectionHead icon={Newspaper} title="News, interviste e gallery" to={mode === "public" ? `/tornei/${slug}/news` : undefined} />
            {card.media?.posts?.length ? <div className="grid sm:grid-cols-3 gap-4">{card.media.posts.slice(0, 3).map((po) => <MediaCard key={po.id} p={po} to={newsTo(po)} />)}</div> : <p className="text-sm text-fsl-slate">Nessun contenuto taggato: la redazione può collegare articoli, interviste e gallery a questo giocatore.</p>}
          </section>
          <Panel icon={CalendarDays} title="Le sue partite" to={mode === "public" ? `/tornei/${slug}/partite` : undefined} testId="player-profile-history">
            <div className="overflow-x-auto -mx-2">
              <table className="w-full text-xs min-w-[420px]">
                <thead><tr className="text-[9px] uppercase tracking-[0.18em] text-fsl-slate"><th className="text-left font-bold px-2 py-2">Data</th><th className="text-left font-bold px-2 py-2">Avversario</th><th className="text-center font-bold px-2 py-2">Risultato</th><th className="text-center font-bold px-2 py-2">Voto</th><th className="text-right font-bold px-2 py-2">Riconoscimenti</th></tr></thead>
                <tbody>
                  {card.history.length === 0 && <tr><td colSpan={5} className="px-2 py-4 text-fsl-slate">Nessuna presenza in gare ufficiali.</td></tr>}
                  {[...card.history].map((h) => (
                    <tr key={h.match_id} className="border-t border-white/[0.06] hover:bg-white/[0.04]">
                      <td className="px-2 py-2.5 num text-fsl-slate whitespace-nowrap"><Link to={matchTo(h.match_id)}>{fmtDate(h.kickoff_at)}</Link></td>
                      <td className="px-2 py-2.5"><Link to={matchTo(h.match_id)} className="inline-flex items-center gap-2 min-w-0"><ClubCrest club={{ name: h.opponent, crest_url: h.opponent_crest_url, colors: h.opponent_colors }} size={22} /><span className="truncate font-semibold">{h.opponent}</span></Link></td>
                      <td className="px-2 py-2.5 text-center whitespace-nowrap"><span className="inline-flex items-center gap-1.5" title={RESULT_LABEL[h.result]}><ResultDot r={h.result} /><span className="num font-bold">{h.score}</span></span></td>
                      <td className="px-2 py-2.5 text-center num font-display font-extrabold text-base text-white">{h.fanta == null ? "–" : Number(h.fanta).toFixed(1)}</td>
                      <td className="px-2 py-2.5 text-right"><span className="inline-flex flex-wrap justify-end gap-1">{h.badges.slice(0, 2).map((b) => <span key={b} className="inline-flex h-6 items-center gap-1 rounded-md border border-fsl-gold/70 bg-fsl-gold/10 px-1.5 text-[9px] font-extrabold uppercase text-fsl-gold">{b === "mvp" ? <Trophy className="h-3 w-3" /> : <Star className="h-3 w-3" />}{b === "muro" ? "Clean sheet" : b}</span>)}{h.badges.length === 0 && <span className="text-fsl-slate">-</span>}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        {showRich && (
          <section data-testid="player-media-strip">
            <SectionHead icon={Camera} title="Foto e video" to={mode === "public" && mediaItems.length ? `/tornei/${slug}` : undefined} linkLabel="Vedi tutti" />
            {mediaItems.length ? <MediaStrip items={mediaItems} onBuy={buy} /> : <p className="text-sm text-fsl-slate">Le foto e i video taggati compariranno qui.</p>}
          </section>
        )}

        <div className="grid lg:grid-cols-[1.2fr_0.8fr_1fr] gap-6 items-start">
          <Panel icon={User} title="Profilo del giocatore" testId="player-bio">
            {p.bio ? <p className="text-sm leading-relaxed text-white/90 whitespace-pre-line">{p.bio}</p> : <p className="text-sm text-fsl-slate">{card.can_edit ? "Racconta chi è: caratteristiche, qualità, cosa lo rende speciale in campo." : "Profilo in aggiornamento."}</p>}
            {facts.length > 0 && <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2">{facts.map(([Icon, l, v]) => <div key={l} className="rounded-lg border border-white/10 bg-ink-950/60 px-3 py-2"><div className="text-[9px] uppercase tracking-wider text-fsl-slate flex items-center gap-1"><Icon className="h-3 w-3 text-fsl-gold" />{l}</div><div className="font-display font-bold text-base truncate">{v}</div></div>)}</div>}
            {p.testimonials?.length > 0 && <div className="mt-4 space-y-2">{p.testimonials.map((x, i) => <blockquote key={i} className="rounded-lg border border-white/10 border-l-4 border-l-fsl-gold bg-ink-950/60 p-3"><p className="text-sm font-display font-bold uppercase leading-tight">«{x.text}»</p>{x.author && <footer className="text-[11px] text-fsl-slate mt-1">— {x.author}</footer>}</blockquote>)}</div>}
            {card.can_edit && <button className="mt-4 text-xs text-fsl-gold hover:underline" onClick={() => setEdit(true)} data-testid="player-profile-edit-2">Modifica profilo, punti di forza e «dicono di me» →</button>}
          </Panel>
          <Panel icon={Zap} title="Punti di forza" testId="player-strengths">
            {strengths.length ? <div className="flex flex-wrap gap-2">{strengths.map((s) => <TagPill key={s} icon={[Activity, Zap, Users, Target, Hand, Star][Math.abs([...s].reduce((a, c) => a + c.charCodeAt(0), 0)) % 6]}>{s}</TagPill>)}</div> : <div className="flex flex-wrap gap-2">{tags.slice(1).map((s) => <TagPill key={s}>{s}</TagPill>)}</div>}
          </Panel>
          <Panel icon={Trophy} title="Ultimi riconoscimenti" testId="player-honours">
            {recentBadges.length ? <div className="grid grid-cols-3 gap-2">{recentBadges.map((b, i) => <HonourCard key={i} icon={badgeIcon(b)} title={b.label.split(" — ")[0].split(" della ")[0]} subtitle={b.label.includes(" — ") ? b.label.split(" — ")[1] : b.label.includes(" della ") ? `della ${b.label.split(" della ")[1]}` : b.scope === "career" ? "Carriera" : "Stagione"} date={b.earned_at ? fmtDate(b.earned_at) : null} />)}</div> : <p className="text-sm text-fsl-slate">I riconoscimenti compaiono dopo le prime gare ufficiali.</p>}
          </Panel>
        </div>

        {showRich && (
          <section className="space-y-6" data-testid="player-products">
            <SectionHead icon={BookOpen} title="Ricordi e prodotti FSL" />
            {idPreview && <PlayerIdOffer preview={idPreview} onBuy={buyCard} busy={buyingCard} />}
            <div className="grid lg:grid-cols-2 gap-6">
              {tSlug && <Link to={`/tornei/${tSlug}/giocatori/${playerId}/capsule`} className="rounded-2xl border border-fsl-gold/40 bg-navy-800/80 p-5 flex items-center gap-4 hover:border-fsl-gold transition-colors" data-testid="player-capsule-link"><span className="h-14 w-14 rounded-2xl bg-fsl-gold/15 border border-fsl-gold/50 inline-flex items-center justify-center font-display font-extrabold text-fsl-gold text-lg">TC</span><div className="flex-1"><div className="font-display font-extrabold uppercase text-xl leading-none">FSL Time Capsule</div><div className="text-xs text-fsl-slate mt-1">L'album digitale della stagione: numeri, partite, momenti Top 11, badge e foto</div></div><span className="text-fsl-gold text-sm font-bold">Apri →</span></Link>}
              <div className="relative overflow-hidden rounded-2xl border border-fsl-gold/40 bg-navy-800/80 p-5 flex items-center gap-4" data-testid="album-offer">
                <div className="flex-1"><div className="fsl-kicker flex items-center gap-2"><BookOpen className="h-4 w-4 text-fsl-gold" /> Album stagione</div><div className="mt-1 font-display font-extrabold uppercase text-xl leading-none">Tutta la stagione di {first} in un album</div><p className="mt-1 text-xs text-fsl-slate">Cartolina, badge, interviste, foto e ogni partita: si aggiorna fino all'ultima giornata, stampabile in PDF.</p></div>
                <div className="flex flex-col items-stretch gap-1 min-w-[150px]"><div className="font-display font-extrabold text-3xl text-fsl-gold num text-center">2,49 €</div><button className="btn-gold h-9" disabled={buyingAlbum} onClick={buyAlbum} data-testid="album-buy">{buyingAlbum ? "Reindirizzamento…" : "Acquista"}</button></div>
              </div>
            </div>
            <div><h3 className="fsl-label mb-3">La cartolina</h3><PlayerPostcard card={card} colors={card.club?.colors} /></div>
          </section>
        )}
      </div>
      {edit && <PlayerProfileEditor open onClose={() => setEdit(false)} tournamentId={tid} card={card} onSaved={load} />}
      {cutoutEditor}
    </div>
  );
}
