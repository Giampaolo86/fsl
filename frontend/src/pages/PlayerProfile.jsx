import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { ArrowLeft, BookOpen, Camera, Check, Heart, ImagePlus, Loader2, Newspaper, Pencil, Quote, Ruler, Weight, X } from "lucide-react";
import { PostCard } from "@/components/fsl/Article";
import { BadgeChips } from "@/components/fsl/BadgeChips";
import { FavButton } from "@/components/fsl/FavButton";
import { PlayerProfileEditor, FOOT_LABEL } from "@/components/fsl/PlayerProfileEditor";
import { PlayerPostcard } from "@/components/fsl/PlayerPostcard";
import { buyProduct } from "@/pages/DigitalProduct";
import { Badges, EventIcons } from "@/components/fsl/Ratings";
import { ShopItemCard } from "@/components/fsl/Shop";
import { ErrorState, LoadingState } from "@/components/fsl/States";
import { useAuth } from "@/context/AuthContext";
import { api, apiError } from "@/lib/api";
import { ROLE_TONE, fmtVote } from "@/lib/fanta";
import { fmtDate } from "@/lib/format";
import { mediaUrl } from "@/lib/upload";
import { toast } from "sonner";

export const profileLink = (pathname, pid) => {
  const a = pathname.match(/^\/admin\/t\/([^/]+)/);
  if (a) return `/admin/t/${a[1]}/giocatori/${pid}`;
  if (pathname.startsWith("/societa")) return `/societa/giocatori/${pid}`;
  const t = pathname.match(/^\/tornei\/([^/]+)/);
  return t ? `/tornei/${t[1]}/giocatori/${pid}` : null;
};

function Stat({ label, value, testId }) {
  return <div className="fsl-card p-4" data-testid={testId}><div className="font-display font-extrabold text-3xl num leading-none">{value}</div><div className="text-[10px] uppercase tracking-wider text-fsl-slate mt-1">{label}</div></div>;
}

export default function PlayerProfile({ mode = "public" }) {
  const { slug, tournamentId, playerId } = useParams();
  const { user } = useAuth();
  const location = useLocation();
  const [card, setCard] = useState(null);
  const [error, setError] = useState(null);
  const [tid, setTid] = useState(mode === "admin" ? tournamentId : mode === "club" ? user?.memberships?.find((m) => m.role === "club_manager")?.tournament_id : null);
  const [edit, setEdit] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [buyingAlbum, setBuyingAlbum] = useState(false);
  const buyAlbum = async () => { setBuyingAlbum(true); try { await buyProduct(slug || card?.tournament?.slug || "", "album", playerId); } catch (e) { toast.error(apiError(e)); setBuyingAlbum(false); } };
  const uploadPhoto = async (file) => {
    if (!file) return; setUploading(true);
    const fd = new FormData(); fd.append("file", file);
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
  if (error) return <div className="p-10"><ErrorState message={apiError(error)} /></div>;
  if (!card) return <LoadingState full />;
  const p = card.profile || {}, t = card.totals || {};
  const backTo = mode === "admin" ? `/admin/t/${tid}/rose` : mode === "club" ? "/societa/rose" : `/tornei/${slug}`;
  const matchTo = (mid) => (mode === "admin" ? `/admin/t/${tid}/partite/${mid}` : mode === "club" ? `/societa/partite/${mid}` : `/tornei/${slug}/partite/${mid}`);
  const buy = async (it) => { try { const r = await api.post("/payments/checkout", { item_id: it.id, origin_url: window.location.origin }); window.location.href = r.data.checkout_url; } catch (e) { toast.error(apiError(e)); } };
  const facts = [[Ruler, "Altezza", p.height_cm ? `${p.height_cm} cm` : null], [Weight, "Peso", p.weight_kg ? `${p.weight_kg} kg` : null], [null, "Piede", FOOT_LABEL[p.foot]], [null, "Soprannome", p.nickname], [null, "Idolo", p.idol], [Heart, "Squadra del cuore", p.favorite_team]].filter((x) => x[2]);
  return (
    <div className={mode === "public" ? "" : "space-y-2"} data-testid="player-profile">
      <section className="relative overflow-hidden rounded-none md:rounded-2xl bg-navy-800 border-b md:border border-white/10">
        <div className="absolute inset-0 grain opacity-30 pointer-events-none" />
        <div className="relative mx-auto max-w-[1200px] px-6 py-10 flex flex-col md:flex-row md:items-end gap-6">
          <Link to={backTo} className="absolute top-4 left-6 text-xs text-fsl-slate hover:text-fsl-white inline-flex items-center gap-1" data-testid="player-profile-back"><ArrowLeft className="h-3.5 w-3.5" /> Indietro</Link>
          <div className="relative shrink-0">
            {card.photo_url ? <img src={mediaUrl(card.photo_url)} alt="" className="h-36 w-36 rounded-2xl object-cover border-2 border-fsl-gold/60 shadow-elev" data-testid="player-profile-photo" /> : <span className={`h-36 w-36 rounded-2xl inline-flex items-center justify-center font-display font-extrabold text-3xl uppercase ${ROLE_TONE[card.role_code] || "bg-navy-700"}`}>{card.role_code || "—"}</span>}
            {card.can_edit && <label className="absolute -bottom-2 -right-2 h-10 w-10 rounded-full bg-fsl-gold text-ink-950 inline-flex items-center justify-center cursor-pointer shadow-elev hover:scale-105 transition-transform" title="Carica foto (ritaglio quadrato automatico)"><input type="file" accept="image/*" className="hidden" onChange={(e) => uploadPhoto(e.target.files[0])} disabled={uploading} data-testid="player-photo-input" />{uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}</label>}
          </div>
          <div className="flex-1 min-w-0">
            <div className="fsl-kicker">{card.team}{card.role ? ` · ${card.role}` : ""}</div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[0.9] uppercase mt-1" data-testid="player-profile-name"><span className="num text-fsl-gold mr-3">{card.shirt_number ?? ""}</span>{card.name}{p.nickname && <span className="block text-2xl text-fsl-gold normal-case font-display">«{p.nickname}»</span>}</h1>
            {p.quote && <p className="mt-4 text-lg md:text-xl font-display font-bold uppercase text-fsl-white/90 flex gap-2 max-w-2xl" data-testid="player-profile-quote"><Quote className="h-5 w-5 text-fsl-gold shrink-0" />{p.quote}</p>}
            <div className="mt-4 flex flex-wrap gap-2 items-center">
              {card.public_ok && <FavButton kind="players" id={card.player_id} label="Segui giocatore" small />}
              {card.can_edit && <button className="btn-gold h-9" onClick={() => setEdit(true)} data-testid="player-profile-edit"><Pencil className="h-4 w-4" /> Modifica «Mi presento»</button>}
              {card.can_edit === "guardian" && <span className="text-xs text-fsl-gold">Sei abbinato come genitore/tutore</span>}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1200px] px-6 py-8 space-y-10">
        {card.photo_pending_url && (
          <div className="fsl-card-gold p-4 flex flex-wrap items-center gap-4" data-testid="player-photo-pending">
            <img src={mediaUrl(card.photo_pending_url)} alt="" className="h-20 w-20 rounded-xl object-cover border border-fsl-gold/60" />
            <div className="flex-1 min-w-[200px]"><div className="font-semibold">Nuova foto in attesa di approvazione</div><p className="text-xs text-fsl-slate">{card.can_edit === "guardian" ? "La società o l'organizzazione la verificherà prima di pubblicarla." : "Caricata dal genitore/tutore: verifica che sia adatta e approva per pubblicarla."}</p></div>
            {(card.can_edit === "staff" || card.can_edit === "club") && <div className="flex gap-2"><button className="btn-gold h-9" onClick={() => reviewPhoto(true)} data-testid="player-photo-approve"><Check className="h-4 w-4" /> Approva</button><button className="btn-ghost h-9" onClick={() => reviewPhoto(false)} data-testid="player-photo-reject"><X className="h-4 w-4" /> Rifiuta</button></div>}
          </div>
        )}
        {(card.public_ok || card.can_edit) && <section><h2 className="fsl-section-title mb-3">La mia cartolina</h2><PlayerPostcard card={card} colors={card.club?.colors} /></section>}
        {(card.public_ok || card.can_edit) && (
          <section className="relative overflow-hidden rounded-2xl border border-fsl-gold/30 bg-navy-800 p-6 md:p-8 grid md:grid-cols-[1fr_auto] items-center gap-6" data-testid="album-offer">
            <div className="absolute inset-0 grain opacity-40 pointer-events-none" />
            <div className="relative"><div className="fsl-kicker flex items-center gap-2"><BookOpen className="h-4 w-4 text-fsl-gold" /> Album stagione</div><h2 className="mt-1 text-3xl sm:text-4xl font-extrabold uppercase leading-[0.95]">Tutta la stagione di {card.name.split(" ")[0]} in un album</h2><p className="mt-2 text-sm text-fsl-slate max-w-xl">Cartolina, badge conquistati, interviste, le foto più belle e ogni partita giocata: un ricordo digitale che si aggiorna fino all'ultima giornata, stampabile in PDF.</p></div>
            <div className="relative flex flex-col items-stretch gap-2 min-w-[200px]"><div className="font-display font-extrabold text-4xl text-fsl-gold num text-center">2,49 €</div><button className="btn-gold" disabled={buyingAlbum} onClick={buyAlbum} data-testid="album-buy">{buyingAlbum ? "Reindirizzamento…" : "Acquista l'album"}</button><span className="text-[10px] text-fsl-slate text-center">Pagamento sicuro Stripe · link personale</span></div>
          </section>
        )}
        {(facts.length > 0 || p.testimonials?.length > 0) && (
          <section className="grid lg:grid-cols-[1fr_1.2fr] gap-6" data-testid="player-profile-presentation">
            <div>
              <h2 className="fsl-section-title mb-3">Mi presento</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{facts.map(([Icon, l, v]) => <div key={l} className="fsl-card p-4"><div className="text-[10px] uppercase tracking-wider text-fsl-slate flex items-center gap-1">{Icon && <Icon className="h-3 w-3 text-fsl-gold" />}{l}</div><div className="font-display font-bold text-xl mt-1 truncate">{v}</div></div>)}</div>
              {facts.length === 0 && <p className="text-sm text-fsl-slate">Nessun dato inserito.</p>}
            </div>
            {p.testimonials?.length > 0 && <div><h2 className="fsl-section-title mb-3">Dicono di me</h2><div className="space-y-3">{p.testimonials.map((x, i) => <blockquote key={i} className="bg-ink-950 rounded-xl border border-white/10 border-l-4 border-l-fsl-gold p-4"><p className="text-base font-display font-bold uppercase leading-tight">«{x.text}»</p>{x.author && <footer className="text-xs text-fsl-slate mt-2">— {x.author}</footer>}</blockquote>)}</div></div>}
          </section>
        )}
        {facts.length === 0 && !p.testimonials?.length && card.can_edit && <div className="fsl-card-gold p-5 text-sm flex flex-wrap items-center gap-3" data-testid="player-profile-empty-presentation"><span>La sezione «Mi presento» è ancora vuota: altezza, piede preferito, citazione, dicono di me…</span><button className="btn-gold h-9" onClick={() => setEdit(true)}>Compila ora</button></div>}

        <section>
          <h2 className="fsl-section-title mb-3">Statistiche · gare ufficiali</h2>
          <div className="grid grid-cols-3 md:grid-cols-7 gap-3">{[["Presenze", t.presences || 0], ["Gol", t.goal || 0], ["Assist", t.assist || 0], ["Media voto", fmtVote(card.avg_vote)], ["Media fanta", fmtVote(card.avg_fanta)], ["MVP", t.mvp || 0], ["Top 11", card.top11_count || 0]].map(([l, v]) => <Stat key={l} label={l} value={v} />)}</div>
          <div className="mt-4"><div className="fsl-label mb-1.5">Badge ({card.badges?.length || 0})</div><BadgeChips list={card.badges || []} max={20} small={false} /></div>
        </section>

        <section className="grid lg:grid-cols-[1.4fr_1fr] gap-6">
          <div data-testid="player-profile-media">
            <h2 className="fsl-section-title mb-3 flex items-center gap-2"><Newspaper className="h-5 w-5 text-fsl-gold" /> News, interviste e gallery</h2>
            {card.media?.posts?.length ? <div className="grid sm:grid-cols-2 gap-3">{card.media.posts.map((po) => <PostCard key={po.id} p={po} to={mode === "public" ? `/tornei/${slug}/news/${po.slug}` : undefined} />)}</div> : <p className="text-sm text-fsl-slate">Nessun contenuto taggato: la redazione può collegare articoli, interviste e gallery a questo giocatore.</p>}
            <h2 className="fsl-section-title mb-3 mt-8 flex items-center gap-2"><Camera className="h-5 w-5 text-fsl-gold" /> Foto e video</h2>
            {card.media?.shop?.length ? <div className="grid sm:grid-cols-2 gap-3">{card.media.shop.map((it) => <ShopItemCard key={it.id} it={it} onBuy={buy} />)}</div> : <p className="text-sm text-fsl-slate">Nessuna foto o video taggato.</p>}
          </div>
          <div>
            <h2 className="fsl-section-title mb-3">Le sue partite</h2>
            <div className="fsl-card divide-y divide-white/[0.06]" data-testid="player-profile-history">
              {card.history.length === 0 && <p className="p-4 text-xs text-fsl-slate">Nessuna presenza in gare ufficiali.</p>}
              {card.history.map((h) => <Link key={h.match_id} to={matchTo(h.match_id)} className="h-12 px-3 flex items-center gap-2 text-xs hover:bg-white/[0.04]"><span className="text-fsl-slate num w-16 shrink-0">{fmtDate(h.kickoff_at)}</span><span className="flex-1 min-w-0 truncate">vs {h.opponent} <span className="text-fsl-slate num">{h.score}</span></span><div className="w-[100px] overflow-x-auto no-scrollbar flex gap-1"><EventIcons ev={h.events} compact /><Badges list={h.badges} /></div><span className="num font-display font-extrabold text-base text-fsl-blue-light w-8 text-right">{fmtVote(h.fanta)}</span></Link>)}
            </div>
          </div>
        </section>
      </div>
      {edit && <PlayerProfileEditor open onClose={() => setEdit(false)} tournamentId={tid} card={card} onSaved={load} />}
    </div>
  );
}
