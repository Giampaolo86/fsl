import { mediaUrl } from "@/lib/upload";

export const GOLD = "#F4AE2B", NAVY = "#041E32", INK = "#03131F", WHITE = "#F5F7FA", SLATE = "#A8BACB";
export const ROLE_ABBR = { Portiere: "POR", Difensore: "DIF", Centrocampista: "CEN", Esterno: "EST", Attaccante: "ATT" };
export const fmt1 = (v) => (v == null ? "—" : Number(v).toFixed(1).replace(".", ","));
export const splitName = (name = "") => { const parts = name.trim().split(/\s+/); return parts.length > 1 ? [parts[0], parts.slice(1).join(" ")] : ["", parts[0] || ""]; };
const IMG_CACHE = new Map();
export const loadImg = (src) => { if (!src) return Promise.resolve(null); if (!IMG_CACHE.has(src)) IMG_CACHE.set(src, new Promise((res) => { const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => res(im); im.onerror = () => { IMG_CACHE.delete(src); res(null); }; im.src = mediaUrl(src); })); return IMG_CACHE.get(src); };
export const preload = (srcs) => Promise.all(srcs.filter(Boolean).map(loadImg));

const VARIANTS = {
  gold: { bg: "linear-gradient(160deg,#FBE5A3 0%,#F4AE2B 30%,#C8811A 62%,#F1C55C 100%)", ink: "#2A1A05", sub: "rgba(42,26,5,0.7)", line: "rgba(42,26,5,0.25)", edge: "rgba(255,240,200,0.9)" },
  special: { bg: "linear-gradient(160deg,#1C2B3A 0%,#03131F 45%,#0B2A45 100%)", ink: "#F9DE8F", sub: "rgba(249,222,143,0.75)", line: "rgba(244,174,43,0.35)", edge: "#F4AE2B" },
  silver: { bg: "linear-gradient(160deg,#F1F4F8 0%,#B9C4D1 35%,#7E8C9C 65%,#D6DEE7 100%)", ink: "#101B27", sub: "rgba(16,27,39,0.7)", line: "rgba(16,27,39,0.25)", edge: "rgba(255,255,255,0.9)" },
};
const SIZES = { sm: { w: 104, rating: 26, pos: 9, first: 8, last: 12, team: 8, photo: 52, stat: 8 }, md: { w: 150, rating: 38, pos: 11, first: 10, last: 17, team: 9, photo: 78, stat: 9 }, lg: { w: 220, rating: 56, pos: 14, first: 13, last: 24, team: 12, photo: 118, stat: 11 } };
const CLIP = "polygon(0 0,100% 0,100% 86%,84% 100%,16% 100%,0 86%)";

export function FifaCard({ player: p, variant = "gold", size = "md", offRole = false, label, onClick, disabled, testId, className = "" }) {
  const v = VARIANTS[offRole ? "silver" : variant], s = SIZES[size];
  const [first, last] = splitName(p?.name || "");
  const W = s.w, H = Math.round(W * 1.42);
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} onClick={onClick} disabled={disabled} className={`group relative shrink-0 text-left ${onClick && !disabled ? "cursor-pointer hover:-translate-y-1 hover:scale-[1.03] transition-transform duration-300" : ""} ${className}`} style={{ width: W, height: H }} data-testid={testId}>
      <div className="absolute inset-0 rounded-t-[14%]" style={{ clipPath: CLIP, background: v.edge, filter: "drop-shadow(0 18px 24px rgba(0,0,0,0.55))" }} />
      <div className="absolute inset-[3px] rounded-t-[14%] overflow-hidden" style={{ clipPath: CLIP, background: v.bg }}>
        <div className="absolute inset-0 grain" />
        <div className="absolute -top-1/3 -left-1/4 h-2/3 w-3/4 rotate-[-20deg] rounded-full" style={{ background: "radial-gradient(closest-side,rgba(255,255,255,0.35),transparent)" }} />
        {variant === "special" && !offRole && <div className="absolute inset-0 opacity-60" style={{ background: "conic-gradient(from 210deg at 70% 20%,transparent 0deg,rgba(244,174,43,0.18) 40deg,transparent 80deg,rgba(23,120,255,0.15) 140deg,transparent 180deg)" }} />}
        <div className="absolute left-[9%] top-[7%] leading-none font-display font-extrabold" style={{ color: v.ink }}>
          <div className="num" style={{ fontSize: s.rating, letterSpacing: "-0.03em" }}>{p ? fmt1(p.fanta) : "—"}</div>
          <div className="font-sans font-bold tracking-widest mt-0.5" style={{ fontSize: s.pos, color: v.sub }}>{p ? (ROLE_ABBR[p.role] || (p.role || "").slice(0, 3).toUpperCase()) : label || "—"}</div>
          {p?.shirt_number != null && <div className="font-sans font-bold mt-1 num" style={{ fontSize: s.pos, color: v.sub }}>N. {p.shirt_number}</div>}
        </div>
        <div className="absolute right-[7%] top-[9%] rounded-full overflow-hidden flex items-center justify-center" style={{ width: s.photo, height: s.photo, background: variant === "special" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.12)", boxShadow: `inset 0 0 0 2px ${v.line}` }}>
          {p?.photo_url ? <img src={mediaUrl(p.photo_url)} alt="" className="h-full w-full object-cover" draggable={false} /> : <span className="font-display font-extrabold" style={{ color: v.ink, fontSize: s.photo * 0.45 }}>{p ? (p.shirt_number ?? (last[0] || "?")) : "?"}</span>}
        </div>
        <div className="absolute inset-x-[8%] top-[56%] h-px" style={{ background: v.line }} />
        <div className="absolute inset-x-[7%] top-[58%] text-center leading-none">
          <div className="font-sans font-semibold uppercase tracking-wider truncate" style={{ fontSize: s.first, color: v.sub, minHeight: s.first }}>{first}</div>
          <div className="font-display font-extrabold uppercase truncate" style={{ fontSize: s.last, color: v.ink, letterSpacing: "0.01em" }}>{p ? last || first : "Slot vuoto"}</div>
          <div className="font-sans truncate mt-1" style={{ fontSize: s.team, color: v.sub }}>{p?.team || label || ""}</div>
        </div>
        {p && <div className="absolute inset-x-[10%] bottom-[9%] flex justify-between font-sans font-bold num" style={{ fontSize: s.stat, color: v.ink }}>
          <span>GOL <b style={{ color: v.ink }}>{p.goals ?? 0}</b></span><span>AST <b>{p.assists ?? 0}</b></span><span>VOTO <b>{fmt1(p.vote)}</b></span>
        </div>}
        {p?.mvp && <div className="absolute left-1/2 -translate-x-1/2 top-[48%] h-4 px-2 rounded-full text-[8px] font-bold tracking-wider" style={{ background: variant === "special" ? GOLD : INK, color: variant === "special" ? INK : GOLD }}>MVP</div>}
      </div>
      {offRole && <span className="absolute -top-2 right-1 h-4 px-1.5 rounded-full bg-fsl-warning text-ink-950 text-[8px] font-bold uppercase" title="Ruolo reale, inserito per completare il modulo">Jolly</span>}
    </Tag>
  );
}

const shield = (ctx, x, y, w, h, r) => {
  const cut = h * 0.14, ix = w * 0.16;
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - cut); ctx.lineTo(x + w - ix, y + h); ctx.lineTo(x + ix, y + h); ctx.lineTo(x, y + h - cut); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
};
const CANVAS_VARIANTS = {
  gold: { stops: [[0, "#FBE5A3"], [0.3, "#F4AE2B"], [0.62, "#C8811A"], [1, "#F1C55C"]], ink: "#2A1A05", sub: "rgba(42,26,5,0.72)", line: "rgba(42,26,5,0.25)", edge: "rgba(255,240,200,0.95)" },
  special: { stops: [[0, "#1C2B3A"], [0.45, "#03131F"], [1, "#0B2A45"]], ink: "#F9DE8F", sub: "rgba(249,222,143,0.78)", line: "rgba(244,174,43,0.35)", edge: "#F4AE2B" },
  silver: { stops: [[0, "#F1F4F8"], [0.35, "#B9C4D1"], [0.65, "#7E8C9C"], [1, "#D6DEE7"]], ink: "#101B27", sub: "rgba(16,27,39,0.72)", line: "rgba(16,27,39,0.25)", edge: "rgba(255,255,255,0.95)" },
};
const F = (w, s, fam = '"Barlow Condensed", "Arial Narrow", sans-serif') => `${w} ${s}px ${fam}`;
const fitText = (ctx, t, max) => { let s = t || ""; while (ctx.measureText(s).width > max && s.length > 2) s = `${s.slice(0, -2)}…`; return s; };

export function drawFifaCard(ctx, { x, y, w }, p, { variant = "gold", offRole = false, img = null, label = "" } = {}) {
  const h = Math.round(w * 1.42), v = CANVAS_VARIANTS[offRole ? "silver" : variant], u = w / 150;
  const [first, last] = splitName(p?.name || "");
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.55)"; ctx.shadowBlur = 24 * u; ctx.shadowOffsetY = 14 * u;
  shield(ctx, x, y, w, h, 18 * u); ctx.fillStyle = v.edge; ctx.fill();
  ctx.restore(); ctx.save();
  shield(ctx, x + 3 * u, y + 3 * u, w - 6 * u, h - 6 * u, 16 * u); ctx.clip();
  const g = ctx.createLinearGradient(x, y, x + w, y + h); v.stops.forEach(([o, c]) => g.addColorStop(o, c)); ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  const hl = ctx.createRadialGradient(x + w * 0.2, y + h * 0.05, 0, x + w * 0.2, y + h * 0.05, w * 0.7); hl.addColorStop(0, "rgba(255,255,255,0.35)"); hl.addColorStop(1, "rgba(255,255,255,0)"); ctx.fillStyle = hl; ctx.fillRect(x, y, w, h);
  if (variant === "special" && !offRole) { const sh = ctx.createLinearGradient(x, y, x + w, y + h); sh.addColorStop(0, "rgba(244,174,43,0)"); sh.addColorStop(0.45, "rgba(244,174,43,0.16)"); sh.addColorStop(0.5, "rgba(23,120,255,0.12)"); sh.addColorStop(1, "rgba(244,174,43,0)"); ctx.fillStyle = sh; ctx.fillRect(x, y, w, h); }
  ctx.textBaseline = "top"; ctx.textAlign = "left";
  ctx.fillStyle = v.ink; ctx.font = F(800, 40 * u); ctx.fillText(p ? fmt1(p.fanta) : "—", x + 13 * u, y + 14 * u);
  ctx.fillStyle = v.sub; ctx.font = F(700, 11 * u, "Inter, Arial, sans-serif"); ctx.fillText(p ? (ROLE_ABBR[p.role] || (p.role || "").slice(0, 3).toUpperCase()) : label.toUpperCase(), x + 14 * u, y + 58 * u);
  if (p?.shirt_number != null) ctx.fillText(`N. ${p.shirt_number}`, x + 14 * u, y + 73 * u);
  const ps = 78 * u, px = x + w - ps - 11 * u, py = y + 19 * u;
  ctx.save(); ctx.beginPath(); ctx.arc(px + ps / 2, py + ps / 2, ps / 2, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = variant === "special" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.12)"; ctx.fillRect(px, py, ps, ps);
  if (img) ctx.drawImage(img, px, py, ps, ps); else { ctx.fillStyle = v.ink; ctx.font = F(800, 34 * u); ctx.textAlign = "center"; ctx.fillText(String(p ? (p.shirt_number ?? (last[0] || "?")) : "?"), px + ps / 2, py + ps / 2 - 18 * u); }
  ctx.restore(); ctx.strokeStyle = v.line; ctx.lineWidth = 2 * u; ctx.beginPath(); ctx.arc(px + ps / 2, py + ps / 2, ps / 2, 0, Math.PI * 2); ctx.stroke();
  if (p?.mvp) { ctx.fillStyle = variant === "special" ? GOLD : INK; ctx.beginPath(); ctx.roundRect(x + w / 2 - 17 * u, y + h * 0.47, 34 * u, 13 * u, 7 * u); ctx.fill(); ctx.fillStyle = variant === "special" ? INK : GOLD; ctx.font = F(700, 8 * u, "Inter, Arial, sans-serif"); ctx.textAlign = "center"; ctx.fillText("MVP", x + w / 2, y + h * 0.47 + 3 * u); }
  ctx.fillStyle = v.line; ctx.fillRect(x + w * 0.08, y + h * 0.56, w * 0.84, 1.2 * u);
  ctx.textAlign = "center";
  ctx.fillStyle = v.sub; ctx.font = F(600, 10 * u, "Inter, Arial, sans-serif"); ctx.fillText(fitText(ctx, first.toUpperCase(), w * 0.84), x + w / 2, y + h * 0.585);
  ctx.fillStyle = v.ink; ctx.font = F(800, 18 * u); ctx.fillText(fitText(ctx, (p ? last || first : "Slot vuoto").toUpperCase(), w * 0.86), x + w / 2, y + h * 0.585 + 13 * u);
  ctx.fillStyle = v.sub; ctx.font = F(500, 9.5 * u, "Inter, Arial, sans-serif"); ctx.fillText(fitText(ctx, p?.team || label, w * 0.84), x + w / 2, y + h * 0.585 + 35 * u);
  if (p) {
    ctx.font = F(700, 9 * u, "Inter, Arial, sans-serif"); ctx.fillStyle = v.ink; const by = y + h * 0.845;
    ctx.textAlign = "left"; ctx.fillText(`GOL ${p.goals ?? 0}`, x + w * 0.11, by);
    ctx.textAlign = "center"; ctx.fillText(`AST ${p.assists ?? 0}`, x + w / 2, by);
    ctx.textAlign = "right"; ctx.fillText(`VOTO ${fmt1(p.vote)}`, x + w * 0.89, by);
  }
  ctx.restore();
  if (offRole) { ctx.save(); ctx.fillStyle = "#E0A106"; ctx.beginPath(); ctx.roundRect(x + w - 34 * u, y - 6 * u, 34 * u, 12 * u, 6 * u); ctx.fill(); ctx.fillStyle = INK; ctx.font = F(700, 7.5 * u, "Inter, Arial, sans-serif"); ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillText("JOLLY", x + w - 17 * u, y - 3.5 * u); ctx.restore(); }
  return h;
}

export const loadFonts = () => (document.fonts?.load ? Promise.all([document.fonts.load('800 40px "Barlow Condensed"'), document.fonts.load('700 40px "Barlow Condensed"'), document.fonts.load("600 12px Inter"), document.fonts.load('700 30px Caveat')]).catch(() => null) : Promise.resolve());
