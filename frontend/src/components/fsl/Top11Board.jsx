import { useEffect, useRef, useState } from "react";
import { Download, Repeat, Trophy } from "lucide-react";
import { ClubCrest } from "@/components/fsl/ClubCrest";
import { GOLD, INK, loadFonts, loadImg, preload } from "@/components/fsl/FifaCard";
import { StadiumCard, drawStadiumCard } from "@/components/fsl/StadiumCard";

const ROWS = { P: 4, D: 3, C: 2, A: 1 };
const GROUP_LABEL = { P: "Portiere", D: "Difensore", C: "Centrocampo", A: "Attacco" };
const rowsOf = (doc) => [1, 2, 3, 4].map((r) => doc.lineup.filter((s) => ROWS[s.slot_group] === r));
export const STADIUM = "/brand/studio/stadium.jpg";

export function Pitch({ children, className = "", testId }) {
  return (
    <div className={`relative overflow-hidden bg-ink-950 ${className}`} data-testid={testId}>
      <img src={STADIUM} alt="" className="absolute inset-0 h-full w-full object-cover object-bottom" draggable={false} />
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg,rgba(3,19,31,0.55) 0%,rgba(3,19,31,0.15) 30%,rgba(3,19,31,0.1) 70%,rgba(3,19,31,0.9) 100%)" }} />
      <div className="absolute inset-0 grain opacity-50" />
      {children}
    </div>
  );
}

export function Top11Header({ doc, competition, compact }) {
  return (
    <div className="relative pt-6 px-5 text-center">
      <div className="inline-flex items-center gap-3 text-left"><img src="/brand/logo.png" alt="FSL" className={`${compact ? "h-9 w-9" : "h-12 w-12 sm:h-14 sm:w-14"} object-contain drop-shadow-[0_6px_16px_rgba(0,0,0,0.7)]`} /><div><div className={`font-display font-extrabold uppercase leading-none text-fsl-white ${compact ? "text-base" : "text-lg sm:text-2xl"}`}>Future Stars League</div><div className={`font-sans font-semibold tracking-[0.28em] uppercase text-fsl-gold ${compact ? "text-[8px]" : "text-[9px] sm:text-[11px]"}`}>La Serie A del futuro</div></div></div>
      <div className={`mt-2 font-display font-extrabold uppercase leading-[0.82] ${compact ? "text-5xl" : "text-6xl sm:text-8xl"}`} style={{ background: "linear-gradient(180deg,#FFF0B8 0%,#F4AE2B 50%,#C8811A 100%)", WebkitBackgroundClip: "text", color: "transparent", filter: "drop-shadow(0 6px 14px rgba(0,0,0,0.6))" }}>Top 11</div>
      <div className={`font-display font-extrabold uppercase leading-[0.85] text-fsl-white ${compact ? "text-3xl" : "text-4xl sm:text-6xl"}`} style={{ textShadow: "0 6px 18px rgba(0,0,0,0.7)" }}>Settimanale</div>
      <div className="mt-2 flex items-center justify-center gap-3"><span className="h-px w-10 bg-fsl-gold/70" /><span className={`font-sans tracking-[0.3em] uppercase text-fsl-white/85 ${compact ? "text-[8px]" : "text-[10px] sm:text-xs"}`}>{competition?.name || "I migliori della settimana"}</span><span className="h-px w-10 bg-fsl-gold/70" /></div>
      <span className={`mt-3 inline-flex h-7 items-center rounded-md border border-fsl-gold/80 bg-ink-950/70 px-4 font-sans font-bold tracking-[0.25em] uppercase text-fsl-gold ${compact ? "text-[9px]" : "text-[10px] sm:text-xs"}`}>Giornata {doc.match_day}</span>
      {!compact && <div className="absolute right-4 sm:right-8 top-16 sm:top-24 rotate-[-10deg] text-right text-fsl-gold leading-[0.95] text-xl sm:text-3xl" style={{ fontFamily: "Caveat, cursive", textShadow: "0 4px 12px rgba(0,0,0,0.7)" }}>Il futuro<br />scende<br />in campo</div>}
    </div>
  );
}

function useWidth(ref) {
  const [w, setW] = useState(0);
  useEffect(() => { if (!ref.current) return; const ro = new ResizeObserver(([e]) => setW(e.contentRect.width)); ro.observe(ref.current); return () => ro.disconnect(); }, [ref]);
  return w;
}

export function Top11Board({ doc, competition, tournamentName, editable = false, onPick, linkTo, compact = false }) {
  const rows = rowsOf(doc);
  const ref = useRef(null);
  const bw = useWidth(ref);
  const gap = bw < 480 ? 8 : compact ? 10 : 20;
  const cardW = bw ? Math.max(78, Math.min(compact ? 112 : 150, Math.floor((bw - 16 - gap * 3) / 4))) : compact ? 112 : 150;
  const isMobile = bw > 0 && bw < 480;
  const replaceBtn = (s) => editable && onPick ? <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onPick(s); }} className="absolute -bottom-2 left-1/2 -translate-x-1/2 inline-flex h-5 items-center gap-1 rounded-full bg-fsl-blue px-2 text-[8px] font-bold uppercase tracking-wider text-white shadow-md hover:bg-fsl-gold hover:text-ink-950 transition-colors" title="Sostituisci giocatore" data-testid={`top11-replace-${s.slot}`}><Repeat className="h-2.5 w-2.5" /> Sostituisci</button> : null;
  return (
    <Pitch className="rounded-3xl border border-white/10 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)]" testId="top11-board">
      <Top11Header doc={doc} competition={competition} compact={compact || isMobile} />
      <div ref={ref} className={`relative px-2 sm:px-3 ${compact || isMobile ? "pt-6 pb-4 space-y-3" : "pt-10 sm:pt-12 pb-8 space-y-4 sm:space-y-6"}`} data-testid="top11-board-rows">
        {rows.map((row, i) => (
          <div key={i} className="flex justify-center" style={{ gap }}>
            {row.map((s, j) => <div key={s.slot} className="animate-rise" style={{ animationDelay: `${(i * 4 + j) * 60}ms` }}><StadiumCard player={s.player} width={cardW} offRole={s.off_role} label={GROUP_LABEL[s.slot_group]} to={s.player && linkTo ? linkTo(s.player) : undefined} onClick={!s.player && editable ? () => onPick?.(s) : undefined} overlay={replaceBtn(s)} testId={`top11-slot-${s.slot}`} /></div>)}
          </div>
        ))}
      </div>
      <div className={`relative mx-3 mb-3 flex items-center justify-between gap-3 rounded-xl border border-fsl-gold/40 bg-ink-950/80 backdrop-blur px-4 ${compact || isMobile ? "h-10 text-[9px]" : "h-12 sm:h-14 text-[10px] sm:text-xs"} font-sans font-semibold tracking-[0.18em] uppercase text-fsl-white/90`}>
        <span className="inline-flex items-center gap-2 truncate"><Trophy className="h-4 w-4 text-fsl-gold shrink-0" /><span className="truncate">{doc.sponsor ? <>Presented by <b className="text-fsl-gold">{doc.sponsor}</b></> : <>Scopri tornei, classifiche e highlights su <b className="text-fsl-gold">Future Stars League</b></>}</span></span>
        <span className="num text-fsl-slate shrink-0">{doc.formation}</span>
      </div>
    </Pitch>
  );
}

export async function drawStadium(ctx, W, H) {
  const im = await loadImg(STADIUM);
  ctx.fillStyle = INK; ctx.fillRect(0, 0, W, H);
  if (im) { const r = Math.max(W / im.width, H / im.height); const dw = im.width * r, dh = im.height * r; ctx.drawImage(im, (W - dw) / 2, H - dh, dw, dh); }
  const v = ctx.createLinearGradient(0, 0, 0, H); v.addColorStop(0, "rgba(3,19,31,0.6)"); v.addColorStop(0.3, "rgba(3,19,31,0.15)"); v.addColorStop(0.7, "rgba(3,19,31,0.1)"); v.addColorStop(1, "rgba(3,19,31,0.92)"); ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
}

export async function drawPosterHeader(ctx, W, { gold, white, sub, pill, hand = ["Il futuro", "scende", "in campo"], y0 = 50, scale = 1 }) {
  const s = scale;
  ctx.textBaseline = "top";
  const logo = await loadImg("/brand/logo.png");
  ctx.font = `800 ${40 * s}px "Barlow Condensed", "Arial Narrow", sans-serif`; const tw = ctx.measureText("FUTURE STARS LEAGUE").width; const lw = 96 * s; const x0 = W / 2 - (lw + 18 * s + tw) / 2;
  if (logo) ctx.drawImage(logo, x0, y0, lw, lw);
  ctx.textAlign = "left"; ctx.fillStyle = "#fff"; ctx.shadowColor = "rgba(0,0,0,0.7)"; ctx.shadowBlur = 14 * s; ctx.fillText("FUTURE STARS LEAGUE", x0 + lw + 18 * s, y0 + 14 * s);
  ctx.fillStyle = GOLD; ctx.font = `700 ${18 * s}px Inter, Arial, sans-serif`; ctx.fillText("L A   S E R I E   A   D E L   F U T U R O", x0 + lw + 18 * s, y0 + 62 * s);
  ctx.textAlign = "center";
  const g = ctx.createLinearGradient(0, y0 + 110 * s, 0, y0 + 260 * s); g.addColorStop(0, "#FFF0B8"); g.addColorStop(0.5, "#F4AE2B"); g.addColorStop(1, "#C8811A");
  ctx.fillStyle = g; ctx.font = `800 ${(gold.length > 7 ? 150 : 190) * s}px "Barlow Condensed", "Arial Narrow", sans-serif`; ctx.fillText(gold, W / 2, y0 + (gold.length > 7 ? 120 : 96) * s);
  ctx.fillStyle = "#fff"; ctx.font = `800 ${140 * s}px "Barlow Condensed", "Arial Narrow", sans-serif`; ctx.fillText(white, W / 2, y0 + 262 * s);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.font = `500 ${22 * s}px Inter, Arial, sans-serif`; const subT = sub.toUpperCase().split("").join(" "); ctx.fillText(subT, W / 2, y0 + 398 * s);
  const sw = ctx.measureText(subT).width; ctx.fillStyle = "rgba(244,174,43,0.8)"; ctx.fillRect(W / 2 - sw / 2 - 110 * s, y0 + 410 * s, 90 * s, 2); ctx.fillRect(W / 2 + sw / 2 + 20 * s, y0 + 410 * s, 90 * s, 2);
  if (pill) { ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.fillStyle = "rgba(3,19,31,0.75)"; ctx.beginPath(); ctx.roundRect(W / 2 - 110 * s, y0 + 438 * s, 220 * s, 46 * s, 8 * s); ctx.fill(); ctx.stroke(); ctx.fillStyle = GOLD; ctx.font = `800 ${20 * s}px Inter, Arial, sans-serif`; ctx.textBaseline = "middle"; ctx.fillText(pill.toUpperCase().split("").join(" "), W / 2, y0 + 461 * s); ctx.textBaseline = "top"; }
  ctx.save(); if (hand) { ctx.translate(W - 110 * s, y0 + 140 * s); ctx.rotate(-0.18); ctx.fillStyle = GOLD; ctx.font = `700 ${44 * s}px Caveat, cursive`; ctx.textAlign = "center"; ctx.shadowColor = "rgba(0,0,0,0.8)"; ctx.shadowBlur = 10; hand.forEach((l, i) => ctx.fillText(l, 0, i * 44 * s)); } ctx.restore();
  return y0 + (pill ? 500 : 440) * s;
}

export async function drawPosterFooter(ctx, W, H, sponsor, note = "") {
  const footH = 120, fy = H - footH - 10;
  ctx.fillStyle = "rgba(3,19,31,0.85)"; ctx.beginPath(); ctx.roundRect(40, fy, W - 80, 78, 14); ctx.fill(); ctx.strokeStyle = "rgba(244,174,43,0.6)"; ctx.lineWidth = 2; ctx.stroke();
  ctx.textBaseline = "middle"; ctx.textAlign = "left"; ctx.fillStyle = GOLD; ctx.beginPath(); ctx.arc(80, fy + 39, 14, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = INK; ctx.font = '800 16px "Barlow Condensed", sans-serif'; ctx.textAlign = "center"; ctx.fillText("FSL", 80, fy + 40); ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,0.92)"; ctx.font = "600 20px Inter, Arial, sans-serif";
  if (sponsor) {
    ctx.fillText("P R E S E N T E D   B Y", 110, fy + 39); const pw = ctx.measureText("P R E S E N T E D   B Y").width; ctx.fillStyle = GOLD; ctx.font = '800 30px "Barlow Condensed", sans-serif'; ctx.fillText(sponsor.name.toUpperCase(), 110 + pw + 16, fy + 39);
    const logoSrc = sponsor.logo || sponsor.logo_url; if (logoSrc) { const li = await loadImg(logoSrc); if (li) { const lh = 54, lw = lh * (li.width / li.height); ctx.fillStyle = "rgba(255,255,255,0.95)"; ctx.beginPath(); ctx.roundRect(W - 60 - lw - 16, fy + 39 - lh / 2 - 6, lw + 16, lh + 12, 8); ctx.fill(); ctx.drawImage(li, W - 60 - lw - 8, fy + 39 - lh / 2, lw, lh); } }
  } else {
    const a = "S C O P R I   T O R N E I ,   C L A S S I F I C H E   E   H I G H L I G H T S   S U"; ctx.fillText(a, 110, fy + 39); const aw = ctx.measureText(a).width; ctx.fillStyle = GOLD; ctx.font = '800 28px "Barlow Condensed", sans-serif'; ctx.fillText("FUTURE STARS LEAGUE", 110 + aw + 14, fy + 39);
    ctx.strokeStyle = GOLD; ctx.beginPath(); ctx.arc(W - 78, fy + 39, 16, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = GOLD; ctx.font = "700 20px Inter, Arial, sans-serif"; ctx.textAlign = "center"; ctx.fillText("›", W - 78, fy + 38);
  }
  if (note) { ctx.textAlign = "right"; ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.font = "600 16px Inter, Arial, sans-serif"; ctx.fillText(note, W - 44, fy + 98); }
  ctx.textBaseline = "top"; ctx.textAlign = "left";
  return fy;
}

export const drawTop11Header = (ctx, W, doc, competition, y0 = 50, scale = 1, opts = {}) => drawPosterHeader(ctx, W, { gold: (opts.headline || "TOP 11").toUpperCase(), white: "SETTIMANALE", sub: opts.subtitle ?? (competition?.name || "I migliori della settimana"), pill: `Giornata ${doc.match_day}`, hand: opts.hideHand ? null : undefined, y0, scale });

export async function renderTop11(ctx, W, H, doc, competition, opts = {}) {
  await loadFonts();
  await drawStadium(ctx, W, H);
  const scale = H < 1200 ? 0.5 : H > 1400 ? 1 : 0.7;
  const top = (await drawTop11Header(ctx, W, doc, competition, H > 1400 ? 70 : 36, scale, opts)) + (H > 1400 ? 40 : 12);
  const rows = rowsOf(doc);
  await preload(doc.lineup.flatMap((s) => [s.player?.photo_url, s.player?.crest_url]));
  const footH = 120, bottom = H - footH - 30, gapY = 14;
  const cardW = Math.min(220, Math.floor((bottom - top - 3 * gapY) / 4 / 1.17)), cardH = Math.round(cardW * 1.17);
  const rowGap = cardH + gapY;
  for (let r = 0; r < 4; r++) {
    const row = rows[r]; const y = top + r * rowGap; const gap = Math.min(cardW + 34, (W - 100) / row.length);
    const x0 = W / 2 - (gap * row.length) / 2 + (gap - cardW) / 2;
    for (let i = 0; i < row.length; i++) {
      const s = row[i]; const img = await loadImg(s.player?.photo_url);
      await drawStadiumCard(ctx, { x: x0 + i * gap, y, w: cardW }, s.player, { offRole: s.off_role, img, label: GROUP_LABEL[s.slot_group] });
    }
  }
  if (!opts.hideFooter) await drawPosterFooter(ctx, W, H, opts.sponsor || (doc.sponsor ? { name: doc.sponsor } : null), `${doc.formation} · FANTAVOTO UFFICIALE FSL`);
}

export async function downloadTop11(doc, competition, ratio = "4:5") {
  const W = 1080, H = ratio === "9:16" ? 1920 : ratio === "1:1" ? 1080 : 1350;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  await renderTop11(c.getContext("2d"), W, H, doc, competition);
  const a = document.createElement("a"); a.href = c.toDataURL("image/png"); a.download = `fsl-top11-g${doc.match_day}-${ratio.replace(":", "x")}.png`; a.click();
}

export function DownloadTop11({ doc, competition }) {
  return <div className="flex flex-wrap gap-2">{["4:5", "9:16", "1:1"].map((r) => <button key={r} type="button" className="btn-ghost h-9 px-3 text-xs" onClick={() => downloadTop11(doc, competition, r)} data-testid={`top11-download-${r.replace(":", "x")}`}><Download className="h-3.5 w-3.5" /> PNG {r}</button>)}</div>;
}

export { ClubCrest, INK };
