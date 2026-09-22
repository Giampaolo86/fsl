import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Award, BookOpen, Camera, Mic2, Printer } from "lucide-react";
import { BadgeChips } from "@/components/fsl/BadgeChips";
import { PlayerPostcard } from "@/components/fsl/PlayerPostcard";
import { ErrorState, LoadingState } from "@/components/fsl/States";
import { TeamCard } from "@/components/fsl/TeamCard";
import { api, apiError } from "@/lib/api";
import { fmtVote } from "@/lib/fanta";
import { fmtDate } from "@/lib/format";
import { mediaUrl } from "@/lib/upload";

export async function buyProduct(slug, kind, refId) {
  const it = (await api.post(`/public/tournaments/${slug}/products`, { kind, ref_id: refId })).data;
  const r = await api.post("/payments/checkout", { item_id: it.id, origin_url: window.location.origin });
  window.location.href = r.data.checkout_url;
}

function Album({ d, slug }) {
  const c = d.card, t = c.totals || {}, p = c.profile || {};
  return (
    <div className="space-y-12 print:space-y-8" data-testid="season-album">
      <section className="grid lg:grid-cols-[minmax(0,320px)_1fr] gap-8 items-start">
        <PlayerPostcard card={c} colors={c.club?.colors} />
        <div>
          <div className="fsl-kicker">{d.tournament.name} · {d.tournament.season_label}</div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[0.9] uppercase mt-1" data-testid="album-title">Album stagione<br /><span className="text-fsl-gold">{c.name}</span></h1>
          <p className="mt-3 text-sm text-fsl-slate">{c.team} · {c.role}{p.nickname ? ` · «${p.nickname}»` : ""}</p>
          {p.quote && <p className="mt-4 text-xl font-display font-bold uppercase">«{p.quote}»</p>}
          <div className="mt-6 grid grid-cols-3 sm:grid-cols-6 gap-3">{[["Presenze", t.presences || 0], ["Gol", t.goal || 0], ["Assist", t.assist || 0], ["Media voto", fmtVote(c.avg_vote)], ["Media fanta", fmtVote(c.avg_fanta)], ["MVP", t.mvp || 0]].map(([l, v]) => <div key={l} className="fsl-card p-3"><div className="font-display font-extrabold text-2xl num leading-none">{v}</div><div className="text-[10px] uppercase tracking-wider text-fsl-slate mt-1">{l}</div></div>)}</div>
        </div>
      </section>
      <section data-testid="album-badges"><h2 className="fsl-section-title mb-3 flex items-center gap-2"><Award className="h-5 w-5 text-fsl-gold" /> I badge della stagione ({c.badges?.length || 0})</h2>{c.badges?.length ? <div className="fsl-card divide-y divide-white/[0.06]">{c.badges.map((b, i) => <div key={i} className="h-11 px-4 flex items-center gap-3 text-sm"><BadgeChips list={[b]} max={1} small={false} /><span className="text-fsl-slate text-xs flex-1 truncate">{b.note || b.scope_label || ""}</span><span className="num text-xs text-fsl-slate">{fmtDate(b.earned_at)}</span></div>)}</div> : <p className="text-sm text-fsl-slate">Nessun badge ancora conquistato.</p>}</section>
      {d.interviews.length > 0 && <section data-testid="album-interviews"><h2 className="fsl-section-title mb-3 flex items-center gap-2"><Mic2 className="h-5 w-5 text-fsl-gold" /> Le interviste</h2><div className="grid md:grid-cols-2 gap-4">{d.interviews.map((po) => <article key={po.id} className="bg-ink-950 rounded-2xl border border-white/10 border-l-4 border-l-fsl-gold p-6"><div className="text-xs text-fsl-slate num">{fmtDate(po.publish_at)}</div><h3 className="text-2xl font-extrabold uppercase leading-tight mt-1">{po.title}</h3>{po.excerpt && <p className="mt-2 text-sm text-fsl-white/85">{po.excerpt}</p>}{po.body && <p className="mt-3 text-sm text-fsl-slate whitespace-pre-line line-clamp-[12]">{po.body}</p>}</article>)}</div></section>}
      <section data-testid="album-photos"><h2 className="fsl-section-title mb-3 flex items-center gap-2"><Camera className="h-5 w-5 text-fsl-gold" /> Le foto più belle ({d.photos.length})</h2>{d.photos.length ? <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">{d.photos.map((ph, i) => <figure key={i} className="overflow-hidden rounded-xl border border-white/10 break-inside-avoid"><img src={mediaUrl(ph.url)} alt="" className="w-full aspect-square object-cover" loading="lazy" /><figcaption className="px-2 py-1.5 text-[11px] text-fsl-slate truncate">{ph.caption}</figcaption></figure>)}</div> : <p className="text-sm text-fsl-slate">Le foto arrivano dai contenuti taggati dalla redazione (gallery, news, interviste).</p>}</section>
      <section data-testid="album-history"><h2 className="fsl-section-title mb-3 flex items-center gap-2"><BookOpen className="h-5 w-5 text-fsl-gold" /> La stagione partita per partita</h2><div className="fsl-card divide-y divide-white/[0.06]">{c.history.length === 0 && <p className="p-4 text-xs text-fsl-slate">Nessuna presenza in gare ufficiali.</p>}{c.history.map((h) => <Link key={h.match_id} to={`/tornei/${slug}/partite/${h.match_id}`} className="h-12 px-4 flex items-center gap-3 text-sm hover:bg-white/[0.04]"><span className="num text-xs text-fsl-slate w-16">{fmtDate(h.kickoff_at)}</span><span className="flex-1 truncate">vs {h.opponent} <span className="text-fsl-slate num">{h.score}</span></span><span className="num font-display font-extrabold text-fsl-blue-light">{fmtVote(h.fanta)}</span></Link>)}</div></section>
    </div>
  );
}

export default function DigitalProduct() {
  const { slug, token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { api.get(`/payments/product/${token}`).then((r) => setData(r.data)).catch(setError); }, [token]);
  if (error) return <div className="p-10"><ErrorState message={apiError(error)} /></div>;
  if (!data) return <LoadingState full />;
  return (
    <div className="mx-auto max-w-[1200px] px-6 py-8" data-testid="digital-product">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6 print:hidden">
        <Link to={`/tornei/${slug}`} className="text-xs text-fsl-slate hover:text-fsl-white inline-flex items-center gap-1" data-testid="product-back"><ArrowLeft className="h-3.5 w-3.5" /> {data.data.tournament?.name}</Link>
        <div className="flex items-center gap-2"><span className="h-7 px-3 rounded-full bg-fsl-success text-ink-950 text-[11px] font-bold uppercase inline-flex items-center" data-testid="product-paid">Acquistato</span>{data.kind === "album" && <button className="btn-ghost h-9" onClick={() => window.print()} data-testid="album-print"><Printer className="h-4 w-4" /> Stampa / PDF</button>}</div>
      </div>
      {data.kind === "team_card" ? <><h1 className="text-4xl sm:text-5xl font-extrabold uppercase leading-[0.9] mb-6" data-testid="product-title">{data.title}</h1><TeamCard data={data.data} /></> : <Album d={data.data} slug={slug} />}
    </div>
  );
}
