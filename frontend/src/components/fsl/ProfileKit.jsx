import { Link } from "react-router-dom";
import { Award, ChevronRight, Crown, Flame, Hand, Medal, Play, Shield, Sparkles, Star, Target, Trophy, Users, Zap } from "lucide-react";
import { KIND_LABEL } from "@/components/fsl/Article";
import { mediaUrl } from "@/lib/upload";
import { fmtDate } from "@/lib/format";

export const STADIUM_BG = "/brand/studio/stadium.jpg";
const OCT = "polygon(6% 0,94% 0,100% 12%,100% 88%,94% 100%,6% 100%,0 88%,0 12%)";

export function HeroStage({ children, className = "", testId }) {
  return (
    <section className={`relative overflow-hidden bg-ink-950 ${className}`} data-testid={testId}>
      <img src={STADIUM_BG} alt="" className="absolute inset-0 h-full w-full object-cover object-center" draggable={false} />
      <div className="absolute inset-0" style={{ background: "linear-gradient(90deg,rgba(3,19,31,0.92) 0%,rgba(3,19,31,0.55) 45%,rgba(3,19,31,0.35) 70%,rgba(3,19,31,0.85) 100%)" }} />
      <div className="absolute inset-x-0 bottom-0 h-40" style={{ background: "linear-gradient(180deg,transparent,#03131F)" }} />
      <div className="absolute inset-0 grain opacity-40 pointer-events-none" />
      <div className="relative">{children}</div>
    </section>
  );
}

export function HandClaim({ children = <>Il futuro<br />scende<br />in campo</>, className = "" }) {
  return <div className={`rotate-[-8deg] text-right text-fsl-gold leading-[0.95] text-2xl sm:text-3xl lg:text-4xl ${className}`} style={{ fontFamily: "Caveat, cursive", textShadow: "0 4px 14px rgba(0,0,0,0.7)" }}>{children}</div>;
}

export function Signature({ children, className = "", testId }) {
  return <div data-testid={testId} className={`text-fsl-gold rotate-[-10deg] text-3xl sm:text-4xl leading-none ${className}`} style={{ fontFamily: "Caveat, cursive", textShadow: "0 3px 10px rgba(0,0,0,0.7)" }}>{children}</div>;
}

export function GoldPill({ children, className = "", testId }) {
  return <span className={`inline-flex h-8 items-center rounded-lg bg-fsl-gold px-4 font-display font-extrabold uppercase tracking-wider text-ink-950 text-sm shadow-[0_6px_18px_rgba(244,174,43,0.35)] ${className}`} data-testid={testId}>{children}</span>;
}

const Laurel = ({ flip }) => <svg viewBox="0 0 24 64" className={`h-14 w-6 text-fsl-gold ${flip ? "scale-x-[-1]" : ""}`} fill="currentColor" aria-hidden>{[0, 1, 2, 3, 4, 5].map((i) => <ellipse key={i} cx={14 - i * 1.4} cy={8 + i * 9.5} rx="3.2" ry="6" transform={`rotate(${-35 + i * 4} ${14 - i * 1.4} ${8 + i * 9.5})`} />)}<path d="M18 2 C 6 14, 4 34, 8 62" stroke="currentColor" strokeWidth="1.4" fill="none" /></svg>;

export function OvrBox({ value, label = "Forma stagionale", kicker = "OVR", testId }) {
  return (
    <div className="relative w-[168px] sm:w-[190px] aspect-[0.86] shrink-0" data-testid={testId}>
      <div className="absolute inset-0" style={{ clipPath: OCT, background: "linear-gradient(160deg,#FFE9A8 0%,#F4AE2B 40%,#B8741A 70%,#FFD97A 100%)" }} />
      <div className="absolute inset-[3px] flex flex-col items-center justify-center text-center" style={{ clipPath: OCT, background: "linear-gradient(180deg,#0E2238 0%,#061220 100%)" }}>
        <div className="font-sans text-[10px] font-bold tracking-[0.3em] text-white/85">{kicker}</div>
        <div className="mt-1 flex items-center gap-1">
          <Laurel />
          <span className="num font-display font-extrabold text-6xl sm:text-7xl leading-none" style={{ background: "linear-gradient(180deg,#FFF0B8 0%,#F4AE2B 55%,#C8811A 100%)", WebkitBackgroundClip: "text", color: "transparent", filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.6))" }}>{value}</span>
          <Laurel flip />
        </div>
        <div className="mt-2 font-sans text-[9px] font-bold tracking-[0.22em] uppercase text-white/85 px-2">{label}</div>
      </div>
    </div>
  );
}

export function StatTile({ icon: Icon, value, label, testId }) {
  return (
    <div className="relative min-w-0" style={{ filter: "drop-shadow(0 0 10px rgba(244,174,43,0.35))" }} data-testid={testId}>
      <div className="absolute inset-0" style={{ clipPath: OCT, background: "linear-gradient(160deg,#FFE9A8 0%,#F4AE2B 45%,#B8741A 75%,#FFD97A 100%)" }} />
      <div className="absolute inset-[2px] flex flex-col items-center justify-center text-center py-3" style={{ clipPath: OCT, background: "linear-gradient(180deg,#0E2238 0%,#061220 100%)" }}>
        <Icon className="h-5 w-5 text-fsl-gold" />
        <div className="num font-display font-extrabold text-3xl sm:text-4xl leading-none mt-1.5 text-white">{value}</div>
        <div className="mt-1.5 font-sans text-[9px] sm:text-[10px] font-bold tracking-[0.18em] uppercase text-white/80">{label}</div>
      </div>
      <div className="invisible flex flex-col items-center py-3"><span className="h-5" /><span className="text-3xl sm:text-4xl leading-none mt-1.5">0</span><span className="text-[10px] mt-1.5">x</span></div>
    </div>
  );
}

export function SectionHead({ icon: Icon, title, count, to, linkLabel = "Vedi tutte", className = "", testId }) {
  return (
    <div className={`flex items-end justify-between gap-3 mb-4 ${className}`} data-testid={testId}>
      <h2 className="font-display font-extrabold uppercase text-xl sm:text-2xl leading-none flex items-center gap-2"><Icon className="h-5 w-5 text-fsl-gold" />{title}{count != null && <span className="text-fsl-slate text-base">({count})</span>}</h2>
      {to && <Link to={to} className="inline-flex items-center gap-1 text-xs text-fsl-white/80 hover:text-fsl-gold whitespace-nowrap">{linkLabel} <ChevronRight className="h-3.5 w-3.5 text-fsl-gold" /></Link>}
    </div>
  );
}

const BADGE_ICON = [["mvp", Trophy], ["top11", Star], ["portiere", Hand], ["muro", Shield], ["clean", Shield], ["squadra", Users], ["esordio", Sparkles], ["bomber", Target], ["tripletta", Flame], ["doppietta", Flame], ["campione", Crown], ["fuoriclasse", Zap], ["elite", Zap], ["assist", Medal]];
const TONES = ["border-fsl-gold text-fsl-gold bg-fsl-gold/10", "border-[#6E7BFF] text-[#AEB5FF] bg-[#6E7BFF]/10", "border-fsl-gold text-fsl-gold bg-fsl-gold/10", "border-fsl-success text-fsl-success bg-fsl-success/10", "border-fsl-blue-light text-fsl-blue-light bg-fsl-blue-light/10"];
export const badgeIcon = (b) => (BADGE_ICON.find(([k]) => `${b.code} ${b.label}`.toLowerCase().includes(k)) || [null, Award])[1];
const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

export function BadgePills({ list = [], max = 12, testId }) {
  const uniq = Object.values(list.reduce((acc, b) => { const k = b.code === "speciale" ? b.label : b.code; acc[k] = acc[k] ? { ...acc[k], n: acc[k].n + 1 } : { ...b, n: 1 }; return acc; }, {}));
  if (!uniq.length) return <p className="text-sm text-fsl-slate">Nessun badge ancora conquistato.</p>;
  return (
    <div className="flex flex-wrap gap-2" data-testid={testId}>
      {uniq.slice(0, max).map((b) => { const Icon = badgeIcon(b); const tone = TONES[hash(b.code === "speciale" ? b.label : b.code) % TONES.length]; return <span key={b.code + b.label} className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 font-display font-bold uppercase text-xs tracking-wide ${tone} shadow-[0_0_14px_rgba(244,174,43,0.12)]`}><Icon className="h-3.5 w-3.5" />{b.label}{b.n > 1 && <span className="num text-[10px] opacity-80">×{b.n}</span>}</span>; })}
      {uniq.length > max && <span className="inline-flex h-9 items-center text-xs text-fsl-slate">+{uniq.length - max}</span>}
    </div>
  );
}

export function TagPill({ icon: Icon = Zap, children }) {
  return <span className="inline-flex h-9 items-center gap-2 rounded-lg border border-fsl-gold/60 bg-ink-950/70 px-3 text-sm font-semibold text-white"><Icon className="h-4 w-4 text-fsl-gold" />{children}</span>;
}

export function MediaCard({ p, to }) {
  const Tag = to ? Link : "div";
  return (
    <Tag to={to} className="group relative overflow-hidden rounded-2xl border border-white/10 bg-navy-800 flex flex-col hover:border-fsl-gold/60 transition-colors" data-testid={`media-card-${p.slug}`}>
      <div className="relative h-40 overflow-hidden">{p.cover_url ? <img src={mediaUrl(p.cover_url)} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" /> : <img src={STADIUM_BG} alt="" className="h-full w-full object-cover opacity-60" />}<span className="absolute left-3 bottom-3 inline-flex h-6 items-center rounded-md bg-fsl-gold px-2 text-[10px] font-extrabold uppercase tracking-wider text-ink-950">{KIND_LABEL[p.kind] || p.kind}</span></div>
      <div className="p-4 flex-1 flex flex-col gap-1.5"><h3 className="font-display font-extrabold text-lg leading-tight group-hover:text-fsl-gold transition-colors line-clamp-2">{p.kind === "interview" ? `“${p.title}”` : p.title}</h3>{p.excerpt && <p className="text-xs text-fsl-slate line-clamp-3">{p.excerpt}</p>}<div className="mt-auto pt-2 text-[10px] text-fsl-slate num">{fmtDate(p.published_at)}</div></div>
    </Tag>
  );
}

export function MediaStrip({ items = [], onBuy, testId }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-[1.25fr_1fr_1fr_1fr_1fr] gap-3" data-testid={testId}>
      {items.slice(0, 5).map((it) => (
        <button key={it.id} type="button" onClick={() => onBuy?.(it)} className={`group relative overflow-hidden rounded-xl border aspect-[4/3] bg-navy-800 text-left ${it.kind === "video" ? "border-fsl-gold/70 shadow-[0_0_20px_rgba(244,174,43,0.2)]" : "border-white/10"}`} data-testid={`media-strip-${it.id}`}>
          {it.preview_url ? <img src={mediaUrl(it.preview_url)} alt="" className="absolute inset-0 h-full w-full object-cover blur-[1.5px] group-hover:blur-0 transition-[filter]" /> : <img src={STADIUM_BG} alt="" className="absolute inset-0 h-full w-full object-cover opacity-50" />}
          {it.kind === "video" && <span className="absolute inset-0 flex items-center justify-center"><span className="h-14 w-14 rounded-full border-2 border-fsl-gold bg-ink-950/70 inline-flex items-center justify-center shadow-[0_0_24px_rgba(244,174,43,0.5)]"><Play className="h-6 w-6 text-fsl-gold fill-fsl-gold" /></span></span>}
          <div className="absolute inset-x-0 bottom-0 p-2.5 bg-gradient-to-t from-ink-950 to-transparent flex items-end justify-between gap-2"><div className="min-w-0"><div className="text-[11px] font-semibold truncate">{it.title}</div><div className="text-[10px] text-fsl-gold num">{Number(it.price).toFixed(2).replace(".", ",")} €</div></div>{it.kind === "video" && <span className="shrink-0 rounded bg-ink-950/80 border border-white/20 px-1.5 py-0.5 text-[10px] num">{it.duration || "02:18"}</span>}</div>
        </button>
      ))}
    </div>
  );
}

export function HonourCard({ icon: Icon = Trophy, title, subtitle, date, testId }) {
  return (
    <div className="relative aspect-[0.92]" data-testid={testId}>
      <div className="absolute inset-0" style={{ clipPath: OCT, background: "linear-gradient(160deg,#FFE9A8 0%,#F4AE2B 45%,#B8741A 75%,#FFD97A 100%)" }} />
      <div className="absolute inset-[2px] flex flex-col items-center justify-center text-center px-2" style={{ clipPath: OCT, background: "linear-gradient(180deg,#0E2238 0%,#061220 100%)" }}>
        <Icon className="h-7 w-7 text-fsl-gold" />
        <div className="mt-2 font-display font-extrabold uppercase text-base leading-[0.95] text-white line-clamp-2">{title}</div>
        {subtitle && <div className="mt-1 font-sans text-[9px] font-bold tracking-[0.18em] uppercase text-white/75 line-clamp-1">{subtitle}</div>}
        {date && <div className="mt-2 text-[10px] text-white/60 num">{date}</div>}
      </div>
    </div>
  );
}

export const ResultDot = ({ r }) => <span className={`inline-block h-2.5 w-2.5 rounded-full ${r === "W" ? "bg-fsl-success" : r === "L" ? "bg-fsl-danger" : "bg-fsl-gold"}`} />;

export function Panel({ icon: Icon, title, to, children, className = "", testId }) {
  return (
    <section className={`rounded-2xl border border-white/10 bg-navy-800/80 p-5 ${className}`} data-testid={testId}>
      <SectionHead icon={Icon} title={title} to={to} linkLabel="Vedi tutti" className="mb-3" />
      {children}
    </section>
  );
}
