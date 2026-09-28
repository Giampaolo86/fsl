import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Camera, Loader2, Lock, Mic2, Newspaper, Quote, ShoppingBag, Video } from "lucide-react";
import { toast } from "sonner";
import { ClubCrest } from "@/components/fsl/ClubCrest";
import { KIND_LABEL } from "@/components/fsl/Article";
import { fmtPrice } from "@/components/fsl/Shop";
import { api, apiError } from "@/lib/api";
import { useCart } from "@/context/CartContext";
import { fmtDate } from "@/lib/format";
import { mediaUrl } from "@/lib/upload";

export function HomeHeading({ kicker, title, right, icon: Icon }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div>
        <div className="fsl-kicker flex items-center gap-2">{Icon && <Icon className="h-4 w-4 text-fsl-gold" aria-hidden="true" />}{kicker}</div>
        <h2 className="text-4xl sm:text-5xl font-extrabold uppercase leading-[0.9] mt-1">{title}</h2>
      </div>
      {right}
    </div>
  );
}

const fallbackCover = (seed) => `/brand/covers/cover-${([...String(seed || "")].reduce((a, ch) => a + ch.charCodeAt(0), 7) % 6) + 1}.jpg`;

function Cover({ src, kind, seed, className = "" }) {
  return (
    <div className="relative h-full w-full">
      <img src={mediaUrl(src) || fallbackCover(seed)} alt="" loading="lazy" className={`h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 ${src ? "" : "opacity-60"} ${className}`} />
      {!src && <span className="absolute left-3 top-3 fsl-kicker text-[10px] px-2 h-6 rounded-full bg-ink-950/70 inline-flex items-center">{KIND_LABEL[kind] || "News"}</span>}
    </div>
  );
}

export function FeaturedNews({ slug, posts }) {
  const [lead, ...rest] = posts;
  return (
    <section className="mx-auto max-w-[1488px] px-6 mt-20" data-testid="home-featured-news">
      <HomeHeading icon={Newspaper} kicker="Il racconto del torneo" title="Blog e news" right={<Link to={`/tornei/${slug}/news`} className="btn-ghost" data-testid="home-news-all">Tutte le news <ArrowRight className="h-4 w-4" /></Link>} />
      {!lead ? (
        <div className="fsl-card p-10 text-center" data-testid="home-news-empty"><Newspaper className="h-8 w-8 mx-auto text-fsl-gold" /><p className="mt-3 text-sm text-fsl-slate">La redazione FSL è al lavoro: cronache, gallery e match story arriveranno dopo la prima giornata.</p></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <Link to={`/tornei/${slug}/news/${lead.slug}`} className="group lg:col-span-8 relative overflow-hidden rounded-2xl border border-white/10 min-h-[420px] flex items-end" data-testid="home-featured-post">
            <div className="absolute inset-0"><Cover src={lead.cover_url} kind={lead.kind} seed={lead.slug} /></div>
            <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/60 to-transparent" />
            <div className="relative p-8 md:p-10 max-w-2xl">
              <div className="flex items-center gap-3 text-xs"><span className="h-6 px-2 rounded-full bg-fsl-gold text-ink-950 font-bold uppercase tracking-wider inline-flex items-center">In evidenza</span><span className="fsl-kicker">{KIND_LABEL[lead.kind]}</span><span className="num text-fsl-slate">{fmtDate(lead.publish_at || lead.created_at)}</span></div>
              <h3 className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-extrabold leading-[0.95] group-hover:text-fsl-gold transition-colors">{lead.title}</h3>
              {lead.excerpt && <p className="mt-3 text-sm md:text-base text-fsl-white/85 line-clamp-3">{lead.excerpt}</p>}
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-fsl-gold">Leggi l'articolo <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span>
            </div>
          </Link>
          <div className="lg:col-span-4 flex flex-col gap-4">
            {rest.slice(0, 4).map((p) => (
              <Link key={p.id} to={`/tornei/${slug}/news/${p.slug}`} className="group fsl-card flex gap-4 p-3 hover:border-fsl-gold/50 transition-colors" data-testid={`home-post-${p.slug}`}>
                <div className="h-24 w-28 shrink-0 rounded-lg overflow-hidden"><Cover src={p.cover_url} kind={p.kind} seed={p.slug} /></div>
                <div className="min-w-0 flex-1 flex flex-col justify-center">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-fsl-slate"><span className="text-fsl-gold font-bold">{KIND_LABEL[p.kind]}</span><span className="num">{fmtDate(p.publish_at || p.created_at)}</span></div>
                  <h4 className="mt-1 text-lg font-extrabold leading-tight line-clamp-2 group-hover:text-fsl-gold transition-colors">{p.title}</h4>
                  {p.clubs?.[0] && <span className="mt-1 inline-flex items-center gap-1 text-xs text-fsl-slate"><ClubCrest club={p.clubs[0]} size={14} />{p.clubs[0].short_name || p.clubs[0].name}</span>}
                </div>
              </Link>
            ))}
            {rest.length === 0 && <div className="fsl-card p-6 text-sm text-fsl-slate">Altre notizie in arrivo nelle prossime giornate.</div>}
          </div>
        </div>
      )}
    </section>
  );
}

export function InterviewsBlock({ slug, items }) {
  return (
    <section className="mt-20 bg-navy-800/60 border-y border-white/[0.06] py-16" data-testid="home-interviews">
      <div className="mx-auto max-w-[1488px] px-6">
        <HomeHeading icon={Mic2} kicker="Le voci del campo" title="Interviste" right={<Link to={`/tornei/${slug}/news?kind=interview`} className="btn-ghost" data-testid="home-interviews-all">Tutte le interviste <ArrowRight className="h-4 w-4" /></Link>} />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((p, i) => (
            <Link key={p.id} to={`/tornei/${slug}/news/${p.slug}`} className="group relative bg-ink-950 rounded-2xl border border-white/10 border-l-4 border-l-fsl-gold p-7 flex flex-col gap-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-black/30 hover:border-l-[10px]" style={{ animationDelay: `${i * 80}ms` }} data-testid={`home-interview-${p.slug}`}>
              <Quote className="h-8 w-8 text-fsl-gold/70" aria-hidden="true" />
              <p className="text-lg md:text-xl font-display font-bold uppercase leading-tight line-clamp-4 group-hover:text-fsl-gold transition-colors">«{p.excerpt || p.title}»</p>
              <div className="mt-auto flex items-center gap-3 pt-4 border-t border-white/10">
                {p.cover_url ? <img src={mediaUrl(p.cover_url)} alt="" className="h-12 w-12 rounded-full object-cover border-2 border-fsl-gold/60" /> : <span className="h-12 w-12 rounded-full bg-navy-700 inline-flex items-center justify-center"><Mic2 className="h-5 w-5 text-fsl-gold" /></span>}
                <div className="min-w-0"><div className="text-sm font-semibold truncate">{p.title}</div><div className="text-xs text-fsl-slate flex items-center gap-1">{p.clubs?.[0] && <><ClubCrest club={p.clubs[0]} size={12} />{p.clubs[0].short_name || p.clubs[0].name} · </>}<span className="num">{fmtDate(p.publish_at || p.created_at)}</span></div></div>
              </div>
            </Link>
          ))}
          {items.length === 0 && (
            <div className="md:col-span-2 lg:col-span-3 bg-ink-950 rounded-2xl border border-white/10 border-l-4 border-l-fsl-gold p-8 flex flex-col md:flex-row md:items-center gap-6" data-testid="home-interviews-empty">
              <Quote className="h-10 w-10 text-fsl-gold/70 shrink-0" />
              <div><p className="text-xl md:text-2xl font-display font-bold uppercase leading-tight">«Il calcio dei bambini si racconta con le loro parole»</p><p className="mt-2 text-sm text-fsl-slate">Allenatori, dirigenti e giovani protagonisti: le interviste della redazione FSL compariranno qui a partire dalla prima giornata.</p></div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export function ShopShowcase({ slug, items }) {
  const [busy, setBusy] = useState(null);
  const cart = useCart();
  const buy = (it) => cart.add({ id: it.id, title: it.title, price: it.price, kind: it.kind, image_url: it.preview_url, scope: slug });
  return (
    <section className="mx-auto max-w-[1488px] px-6 mt-20" data-testid="home-shop">
      <HomeHeading icon={Camera} kicker="Ricordi da portare a casa" title="Foto e video delle gare" right={<div className="text-right"><div className="font-display font-bold uppercase tracking-wider text-fsl-gold text-lg">Video 0,99 € · Foto 0,49 €</div><div className="text-xs text-fsl-slate">Originali in alta qualità, pagamento sicuro Stripe</div></div>} />
      {items.length === 0 ? (
        <div className="relative overflow-hidden rounded-2xl border border-fsl-gold/30 bg-navy-800 p-8 md:p-12 grid md:grid-cols-[1fr_auto] items-center gap-8" data-testid="home-shop-empty">
          <div className="absolute inset-0 grain opacity-40 pointer-events-none" />
          <div className="relative"><div className="fsl-kicker">Fotografi e videomaker FSL a bordo campo</div><h3 className="mt-2 text-3xl sm:text-4xl font-extrabold uppercase leading-[0.95]">Il gol di tuo figlio, in alta qualità</h3><p className="mt-3 text-sm md:text-base text-fsl-slate max-w-xl">Dopo ogni giornata carichiamo le foto professionali e i video delle gare. Segui la tua squadra e ricevi un avviso appena sono disponibili.</p></div>
          <div className="relative flex flex-col gap-3">{[[Video, "Video della gara", "0,99 €"], [Camera, "Foto professionale", "0,49 €"]].map(([Icon, l, pr]) => <div key={l} className="h-14 px-5 rounded-xl bg-ink-950 border border-white/10 flex items-center gap-4"><Icon className="h-5 w-5 text-fsl-gold" /><span className="text-sm font-semibold">{l}</span><span className="ml-auto num font-display font-extrabold text-2xl text-fsl-gold">{pr}</span></div>)}<Link to={`/tornei/${slug}/partite`} className="btn-gold" data-testid="home-shop-cta">Vai alle partite <ArrowRight className="h-4 w-4" /></Link></div>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
          {items.map((it) => (
            <div key={it.id} className="group fsl-card overflow-hidden flex flex-col transition-transform duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-black/30" data-testid={`home-shop-item-${it.id}`}>
              <Link to={`/tornei/${slug}/partite/${it.match_id}`} className="relative aspect-[4/3] bg-navy-700/60 overflow-hidden block">
                {it.preview_url ? <img src={mediaUrl(it.preview_url)} alt="" loading="lazy" className="h-full w-full object-cover blur-[3px] scale-105 transition-all duration-300 group-hover:blur-none group-hover:scale-100" /> : <div className="h-full w-full flex items-center justify-center"><Video className="h-12 w-12 text-fsl-slate" /></div>}
                <div className="absolute inset-0 flex items-center justify-center"><span className="h-11 w-11 rounded-full bg-ink-950/80 inline-flex items-center justify-center"><Lock className="h-4 w-4 text-fsl-gold" /></span></div>
                <span className="absolute top-2 left-2 h-6 px-2 rounded-full bg-ink-950/80 text-[10px] font-bold uppercase inline-flex items-center gap-1">{it.kind === "video" ? <Video className="h-3 w-3" /> : <Camera className="h-3 w-3" />}{it.kind === "video" ? "Video" : "Foto"}</span>
              </Link>
              <div className="p-3 flex flex-col gap-2 flex-1">
                <div className="min-w-0"><div className="font-semibold truncate text-sm">{it.title}</div><div className="text-xs text-fsl-slate truncate">{it.match_label}{it.kickoff_at ? ` · ${fmtDate(it.kickoff_at)}` : ""}</div></div>
                <button className="btn-gold h-10 w-full mt-auto" disabled={busy === it.id} onClick={() => buy(it)} data-testid={`home-shop-buy-${it.id}`}>{busy === it.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingBag className="h-4 w-4" />} Aggiungi · {fmtPrice(it.price)}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
