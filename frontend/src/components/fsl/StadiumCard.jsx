import { Link } from "react-router-dom";
import { GOLD, ROLE_ABBR, fmt1, loadImg, splitName } from "@/components/fsl/FifaCard";
import { mediaUrl } from "@/lib/upload";

const CLIP = "polygon(7% 0,93% 0,100% 5%,100% 95%,93% 100%,7% 100%,0 95%,0 5%)";
const SIZE_W = { xs: 84, sm: 112, md: 150, lg: 220 };
const sizeFor = (w) => { const u = w / 150; return { w, role: Math.max(6, 9 * u), rating: 30 * u, first: Math.max(6, 9 * u), last: Math.max(9, 15 * u), club: Math.max(6, 8 * u), crest: Math.max(12, 18 * u) }; };
const GOLD_EDGE = "linear-gradient(160deg,#FFE9A8 0%,#F4AE2B 40%,#B8741A 70%,#FFD97A 100%)";
const SILVER_EDGE = "linear-gradient(160deg,#F1F4F8 0%,#B9C4D1 40%,#7E8C9C 70%,#E5EBF2 100%)";

function Crest({ p, size }) {
  const initials = (p.club_short || p.club || p.team || "?").slice(0, 3).toUpperCase();
  return <span className="inline-flex items-center justify-center rounded-full overflow-hidden shrink-0 bg-white/95" style={{ width: size, height: size }}>{p.crest_url ? <img src={mediaUrl(p.crest_url)} alt="" className="h-full w-full object-contain p-[1px]" draggable={false} /> : <span className="font-display font-extrabold" style={{ fontSize: size * 0.42, color: p.colors?.primary || "#0B57D9" }}>{initials}</span>}</span>;
}

export function StadiumCard({ player: p, size = "md", width, offRole = false, label, onClick, to, overlay, disabled, testId, className = "" }) {
  const s = sizeFor(width || SIZE_W[size]), W = s.w, H = Math.round(W * 1.17);
  const [first, last] = splitName(p?.name || "");
  const Tag = to ? Link : onClick ? "button" : "div";
  const interactive = (to || onClick) && !disabled;
  return (
    <Tag to={to || undefined} type={!to && onClick ? "button" : undefined} onClick={onClick} disabled={disabled} className={`group relative block shrink-0 text-left ${interactive ? "cursor-pointer hover:-translate-y-1 hover:scale-[1.03] transition-transform duration-300" : ""} ${className}`} style={{ width: W, height: H, filter: p?.mvp ? "drop-shadow(0 0 18px rgba(244,174,43,0.55))" : "drop-shadow(0 14px 22px rgba(0,0,0,0.6))" }} data-testid={testId} title={to && p ? `Apri la scheda di ${p.name}` : undefined}>
      <div className="absolute inset-0" style={{ clipPath: CLIP, background: offRole ? SILVER_EDGE : GOLD_EDGE }} />
      <div className="absolute inset-[3px] overflow-hidden" style={{ clipPath: CLIP, background: "linear-gradient(180deg,#12283D 0%,#0A1A2B 55%,#061220 100%)" }}>
        <div className="absolute inset-x-0 top-0" style={{ height: "64%" }}>
          {p?.photo_url ? <img src={mediaUrl(p.photo_url)} alt="" className="absolute inset-0 h-full w-full object-cover object-top" draggable={false} /> : <div className="absolute inset-0 flex items-end justify-center" style={{ background: "radial-gradient(80% 60% at 60% 30%,rgba(23,120,255,0.25),transparent)" }}><span className="font-display font-extrabold text-white/15 leading-none" style={{ fontSize: W * 0.55 }}>{p ? (p.shirt_number ?? "?") : "?"}</span></div>}
          <div className="absolute inset-0" style={{ background: "linear-gradient(180deg,rgba(6,18,32,0.15) 0%,rgba(6,18,32,0) 35%,rgba(6,18,32,0.35) 70%,#0A1A2B 100%)" }} />
          <div className="absolute inset-0" style={{ background: "linear-gradient(90deg,rgba(6,18,32,0.85) 0%,rgba(6,18,32,0.2) 45%,transparent 70%)" }} />
        </div>
        <div className="absolute leading-none" style={{ left: W * 0.09, top: W * 0.08 }}>
          <div className="font-sans font-bold tracking-[0.18em] text-white/85" style={{ fontSize: s.role }}>{p ? (ROLE_ABBR[p.role] || (p.role || "").slice(0, 3).toUpperCase()) : (label || "").slice(0, 3).toUpperCase()}</div>
          <div className="num font-display font-extrabold mt-0.5" style={{ fontSize: s.rating, color: GOLD, textShadow: "0 2px 8px rgba(0,0,0,0.6)" }}>{p ? fmt1(p.fanta) : "—"}</div>
        </div>
        {p?.mvp && <div className="absolute right-[6%] flex items-center gap-1 rounded-sm px-1.5 font-sans font-extrabold tracking-wider text-ink-950" style={{ top: "54%", fontSize: s.role + 1, background: GOLD_EDGE, height: s.role * 2 }}><svg viewBox="0 0 24 16" style={{ width: s.role * 1.4, height: s.role }} fill="currentColor"><path d="M2 14h20l-1-9-5 4-4-7-4 7-5-4z" /></svg>MVP</div>}
        <div className="absolute inset-x-0 bottom-0 text-center px-[6%]" style={{ height: "38%" }}>
          <div className="font-sans font-semibold uppercase tracking-wider text-white/80 truncate" style={{ fontSize: s.first, marginTop: s.first * 0.7, minHeight: s.first }}>{first}</div>
          <div className="font-display font-extrabold uppercase text-white truncate leading-none" style={{ fontSize: s.last }}>{p ? last || first : "Slot vuoto"}</div>
          {p && <div className="mt-1 flex items-center justify-center gap-1 text-white/85 font-sans font-semibold uppercase tracking-wide truncate" style={{ fontSize: s.club }}><Crest p={p} size={s.crest} /><span className="truncate">{p.club || p.team}</span></div>}
          {!p && <div className="text-white/50 font-sans" style={{ fontSize: s.club }}>{label}</div>}
        </div>
      </div>
      {offRole && <span className="absolute -top-2 right-2 h-4 px-1.5 rounded-full bg-fsl-warning text-ink-950 text-[8px] font-bold uppercase" title="Ruolo reale, inserito per completare il modulo">Jolly</span>}
      {overlay}
    </Tag>
  );
}

const F = (w, s, fam = '"Barlow Condensed", "Arial Narrow", sans-serif') => `${w} ${s}px ${fam}`;
const fitText = (ctx, t, max) => { let s = t || ""; while (ctx.measureText(s).width > max && s.length > 2) s = `${s.slice(0, -2)}…`; return s; };
const octagon = (ctx, x, y, w, h, c) => { ctx.beginPath(); ctx.moveTo(x + c, y); ctx.lineTo(x + w - c, y); ctx.lineTo(x + w, y + c); ctx.lineTo(x + w, y + h - c); ctx.lineTo(x + w - c, y + h); ctx.lineTo(x + c, y + h); ctx.lineTo(x, y + h - c); ctx.lineTo(x, y + c); ctx.closePath(); };
const goldGrad = (ctx, x, y, w, h, silver = false) => { const g = ctx.createLinearGradient(x, y, x + w, y + h); (silver ? [[0, "#F1F4F8"], [0.4, "#B9C4D1"], [0.7, "#7E8C9C"], [1, "#E5EBF2"]] : [[0, "#FFE9A8"], [0.4, "#F4AE2B"], [0.7, "#B8741A"], [1, "#FFD97A"]]).forEach(([o, c]) => g.addColorStop(o, c)); return g; };

export async function drawStadiumCard(ctx, { x, y, w }, p, { offRole = false, label = "", img = null } = {}) {
  const h = Math.round(w * 1.17), u = w / 150, c = 10 * u;
  const [first, last] = splitName(p?.name || "");
  ctx.save();
  ctx.shadowColor = p?.mvp ? "rgba(244,174,43,0.6)" : "rgba(0,0,0,0.6)"; ctx.shadowBlur = (p?.mvp ? 30 : 22) * u; ctx.shadowOffsetY = p?.mvp ? 0 : 12 * u;
  octagon(ctx, x, y, w, h, c); ctx.fillStyle = goldGrad(ctx, x, y, w, h, offRole); ctx.fill();
  ctx.restore(); ctx.save();
  octagon(ctx, x + 3 * u, y + 3 * u, w - 6 * u, h - 6 * u, c - 2 * u); ctx.clip();
  const bg = ctx.createLinearGradient(0, y, 0, y + h); bg.addColorStop(0, "#12283D"); bg.addColorStop(0.55, "#0A1A2B"); bg.addColorStop(1, "#061220"); ctx.fillStyle = bg; ctx.fillRect(x, y, w, h);
  const ph = h * 0.64;
  if (img) { const r = Math.max(w / img.width, ph / img.height); const dw = img.width * r, dh = img.height * r; ctx.drawImage(img, x + (w - dw) / 2, y, dw, dh); }
  else { const gl = ctx.createRadialGradient(x + w * 0.6, y + ph * 0.3, 0, x + w * 0.6, y + ph * 0.3, w * 0.7); gl.addColorStop(0, "rgba(23,120,255,0.3)"); gl.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = gl; ctx.fillRect(x, y, w, ph); ctx.fillStyle = "rgba(255,255,255,0.14)"; ctx.font = F(800, 82 * u); ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.fillText(String(p ? (p.shirt_number ?? "?") : "?"), x + w / 2, y + ph - 6 * u); }
  const fade = ctx.createLinearGradient(0, y, 0, y + ph); fade.addColorStop(0, "rgba(6,18,32,0.15)"); fade.addColorStop(0.35, "rgba(6,18,32,0)"); fade.addColorStop(0.7, "rgba(6,18,32,0.35)"); fade.addColorStop(1, "#0A1A2B"); ctx.fillStyle = fade; ctx.fillRect(x, y, w, ph);
  const side = ctx.createLinearGradient(x, 0, x + w, 0); side.addColorStop(0, "rgba(6,18,32,0.85)"); side.addColorStop(0.45, "rgba(6,18,32,0.2)"); side.addColorStop(0.7, "rgba(6,18,32,0)"); ctx.fillStyle = side; ctx.fillRect(x, y, w, ph);
  ctx.textBaseline = "top"; ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.font = "700 9px Inter, Arial, sans-serif".replace("9px", `${9 * u}px`); ctx.fillText((p ? (ROLE_ABBR[p.role] || (p.role || "").slice(0, 3)) : label.slice(0, 3)).toUpperCase().split("").join(" "), x + 13 * u, y + 12 * u);
  ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 8 * u; ctx.fillStyle = GOLD; ctx.font = F(800, 32 * u); ctx.fillText(p ? fmt1(p.fanta) : "—", x + 12 * u, y + 24 * u); ctx.shadowBlur = 0;
  if (p?.mvp) { const bw = 40 * u, bh = 16 * u, bx = x + w - bw - 9 * u, by = y + h * 0.55; ctx.fillStyle = goldGrad(ctx, bx, by, bw, bh); ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 2 * u); ctx.fill(); ctx.fillStyle = "#03131F"; ctx.font = `800 ${9.5 * u}px Inter, Arial, sans-serif`; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText("MVP", bx + 14 * u, by + bh / 2 + 0.5 * u); ctx.beginPath(); const cx0 = bx + 4 * u, cy0 = by + bh / 2 + 3 * u, s = 4.2 * u; ctx.moveTo(cx0, cy0); ctx.lineTo(cx0 + s * 2, cy0); ctx.lineTo(cx0 + s * 1.8, cy0 - s * 1.4); ctx.lineTo(cx0 + s * 1.3, cy0 - s * 0.6); ctx.lineTo(cx0 + s, cy0 - s * 1.7); ctx.lineTo(cx0 + s * 0.7, cy0 - s * 0.6); ctx.lineTo(cx0 + s * 0.2, cy0 - s * 1.4); ctx.closePath(); ctx.fill(); ctx.textBaseline = "top"; }
  const ny = y + h * 0.66; ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.8)"; ctx.font = `600 ${9 * u}px Inter, Arial, sans-serif`; ctx.fillText(fitText(ctx, first.toUpperCase(), w * 0.84), x + w / 2, ny);
  ctx.fillStyle = "#fff"; ctx.font = F(800, 16 * u); ctx.fillText(fitText(ctx, (p ? last || first : "Slot vuoto").toUpperCase(), w * 0.86), x + w / 2, ny + 11 * u);
  if (p) {
    const club = (p.club || p.team || "").toUpperCase(); ctx.font = `600 ${8 * u}px Inter, Arial, sans-serif`; const cs = 18 * u; const tw = Math.min(ctx.measureText(club).width, w * 0.62); const total = cs + 5 * u + tw; const sx = x + w / 2 - total / 2; const cy = ny + 34 * u;
    ctx.save(); ctx.beginPath(); ctx.arc(sx + cs / 2, cy + cs / 2, cs / 2, 0, Math.PI * 2); ctx.clip(); ctx.fillStyle = "rgba(255,255,255,0.95)"; ctx.fillRect(sx, cy, cs, cs);
    const crest = await loadImg(p.crest_url); if (crest) ctx.drawImage(crest, sx + cs * 0.08, cy + cs * 0.08, cs * 0.84, cs * 0.84); else { ctx.fillStyle = p.colors?.primary || "#0B57D9"; ctx.font = F(800, 8 * u); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText((p.club_short || club).slice(0, 3), sx + cs / 2, cy + cs / 2 + 0.5 * u); }
    ctx.restore(); ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillStyle = "rgba(255,255,255,0.88)"; ctx.font = `600 ${8 * u}px Inter, Arial, sans-serif`; ctx.fillText(fitText(ctx, club, w * 0.62), sx + cs + 5 * u, cy + cs / 2);
  } else { ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.font = `500 ${8 * u}px Inter, Arial, sans-serif`; ctx.fillText(label, x + w / 2, ny + 36 * u); }
  ctx.restore();
  if (offRole) { ctx.save(); ctx.fillStyle = "#E0A106"; ctx.beginPath(); ctx.roundRect(x + w - 36 * u, y - 6 * u, 36 * u, 12 * u, 6 * u); ctx.fill(); ctx.fillStyle = "#03131F"; ctx.font = `700 ${7.5 * u}px Inter, Arial, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillText("JOLLY", x + w - 18 * u, y - 3.5 * u); ctx.restore(); }
  return h;
}
