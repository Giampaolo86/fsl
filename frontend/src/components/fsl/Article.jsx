import { Link } from "react-router-dom";
import { ClubCrest } from "@/components/fsl/ClubCrest";
import { fmtDate } from "@/lib/format";
import { mediaUrl } from "@/lib/upload";

export const KIND_LABEL = { news: "Notizia", interview: "Intervista", gallery: "Gallery", video: "Video", match_story: "Match story", badge: "Badge", weekly: "FSL Weekly" };
export const STATUS_LABEL = { draft: ["Bozza", "bg-navy-700 text-fsl-slate"], scheduled: ["Programmato", "bg-fsl-warning text-ink-950"], published: ["Pubblicato", "bg-fsl-success text-ink-950"], withdrawn: ["Ritirato", "bg-fsl-danger text-fsl-white"] };

export function PostMeta({ p, className = "" }) {
  return (
    <div className={`flex flex-wrap items-center gap-2 text-xs text-fsl-slate ${className}`}>
      <span className="fsl-kicker">{KIND_LABEL[p.kind] || p.kind}</span>
      <span className="num">{fmtDate(p.publish_at || p.published_at || p.created_at)}</span>
      {p.author_name && <span>· {p.author_name}</span>}
      {p.clubs?.map((c) => <span key={c.id} className="inline-flex items-center gap-1 h-6 px-2 rounded-full border border-white/15"><ClubCrest club={c} size={14} />{c.short_name || c.name}</span>)}
    </div>
  );
}

const inline = (text) => text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean).map((t, i) => t.startsWith("**") ? <strong key={i} className="text-fsl-white font-semibold">{t.slice(2, -2)}</strong> : t.startsWith("*") ? <em key={i}>{t.slice(1, -1)}</em> : t);
const renderPar = (par, i) => {
  const t = par.trim();
  if (/^#{1,3}\s/.test(t)) return <h3 key={i} className="font-display font-extrabold uppercase text-xl text-fsl-gold pt-2">{inline(t.replace(/^#{1,3}\s/, ""))}</h3>;
  if (/^[-•]\s/m.test(t)) return <ul key={i} className="list-disc pl-5 space-y-1">{t.split(/\n/).map((l, j) => <li key={j}>{inline(l.replace(/^[-•]\s/, ""))}</li>)}</ul>;
  return <p key={i}>{t.split(/\n/).map((l, j, arr) => <span key={j}>{inline(l)}{j < arr.length - 1 && <br />}</span>)}</p>;
};

export function Article({ p, compact = false }) {
  const images = (p.media || []).filter((m) => m.kind === "image");
  const videos = (p.media || []).filter((m) => m.kind === "video");
  return (
    <article className="space-y-5" data-testid="article">
      {p.cover_url && <img src={mediaUrl(p.cover_url)} alt="" className={`w-full ${compact ? "max-h-64" : "max-h-[520px]"} object-cover rounded-xl border border-white/10`} />}
      <PostMeta p={p} />
      <h1 className={`${compact ? "text-3xl" : "text-4xl sm:text-5xl lg:text-6xl"} font-extrabold leading-[0.95]`}>{p.title}</h1>
      {p.excerpt && <p className="text-base md:text-lg text-fsl-slate max-w-3xl">{p.excerpt}</p>}
      <div className="prose-fsl max-w-3xl space-y-4 text-base leading-relaxed">{(p.body || "").split(/\n{2,}/).filter(Boolean).map((par, i) => renderPar(par, i))}</div>
      {videos.length > 0 && <div className="grid md:grid-cols-2 gap-3" data-testid="article-videos">{videos.map((m) => <video key={m.id || m.url} controls preload="metadata" className="w-full rounded-lg border border-white/10 bg-ink-950" src={mediaUrl(m.url)} />)}</div>}
      {images.length > 0 && <div className="grid grid-cols-2 md:grid-cols-3 gap-3" data-testid="article-gallery">{images.map((m) => <img key={m.id || m.url} src={mediaUrl(m.url)} alt={m.original_filename || ""} className="w-full aspect-[4/3] object-cover rounded-lg border border-white/10" loading="lazy" />)}</div>}
    </article>
  );
}

export function PostCard({ p, to }) {
  const Tag = to ? Link : "div";
  return (
    <Tag to={to} className="fsl-card overflow-hidden flex flex-col hover:border-fsl-gold/50 transition-colors group" data-testid={`post-card-${p.slug}`}>
      {p.cover_url ? <img src={mediaUrl(p.cover_url)} alt="" className="h-40 w-full object-cover" loading="lazy" /> : <div className="h-40 w-full bg-navy-700/60 flex items-center justify-center"><span className="fsl-kicker text-2xl opacity-60">{KIND_LABEL[p.kind]}</span></div>}
      <div className="p-4 flex-1 flex flex-col gap-2">
        <PostMeta p={p} />
        <h3 className="text-xl font-extrabold leading-tight group-hover:text-fsl-gold transition-colors">{p.title}</h3>
        {p.excerpt && <p className="text-sm text-fsl-slate line-clamp-3">{p.excerpt}</p>}
      </div>
    </Tag>
  );
}
