import { useEffect, useRef, useState } from "react";
import { Download, Share2 } from "lucide-react";
import { toast } from "sonner";
import { mediaUrl } from "@/lib/upload";

const W = 1080, H = 1350;
const NAVY = "#041E32", GOLD = "#F4AE2B", WHITE = "#F5F7FA", SLATE = "#9AA8B8";
const font = (w, s, fam = '"Barlow Condensed", "Arial Narrow", sans-serif') => `${w} ${s}px ${fam}`;
const FOOT = { destro: "Destro", sinistro: "Sinistro", ambidestro: "Ambidestro" };

function wrap(ctx, text, max, maxLines = 3) {
  const words = (text || "").split(/\s+/); const lines = []; let cur = "";
  for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (ctx.measureText(t).width > max && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, -1)}…`; }
  return lines;
}

function roundRect(ctx, x, y, w, h, r, fill, stroke) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 4; ctx.stroke(); }
}

export function drawPostcard(ctx, c, img, colors) {
  const p = c.profile || {}, t = c.totals || {};
  const primary = colors?.primary || "#0B57D9", secondary = colors?.secondary || GOLD;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = NAVY; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.globalAlpha = 0.85; ctx.fillStyle = primary; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W, 0); ctx.lineTo(W, 560); ctx.lineTo(0, 700); ctx.fill(); ctx.restore();
  ctx.fillStyle = "rgba(4,30,50,0.35)"; ctx.fillRect(0, 0, W, 700);
  ctx.textBaseline = "top"; ctx.textAlign = "left";
  ctx.fillStyle = GOLD; ctx.font = font(700, 30); ctx.fillText("FUTURE STARS LEAGUE", 60, 56);
  ctx.fillStyle = WHITE; ctx.font = font(500, 24, "Inter, Arial, sans-serif"); ctx.fillText("La Serie A del futuro", 60, 96);
  ctx.textAlign = "right"; ctx.fillStyle = WHITE; ctx.font = font(700, 26); ctx.fillText((c.team || "").toUpperCase(), W - 60, 60);
  ctx.fillStyle = secondary; ctx.fillRect(W - 60 - 180, 100, 180, 8);
  // photo
  const px = 60, py = 160, ps = 520;
  ctx.save(); ctx.beginPath(); ctx.roundRect(px, py, ps, ps, 36); ctx.clip();
  if (img) ctx.drawImage(img, px, py, ps, ps); else { ctx.fillStyle = "#072B47"; ctx.fillRect(px, py, ps, ps); ctx.fillStyle = GOLD; ctx.font = font(800, 220); ctx.textAlign = "center"; ctx.fillText(c.role_code || "FSL", px + ps / 2, py + 140); }
  ctx.restore();
  roundRect(ctx, px, py, ps, ps, 36, null, GOLD);
  // number + name
  ctx.textAlign = "left"; ctx.fillStyle = GOLD; ctx.font = font(800, 260);
  if (c.shirt_number != null) ctx.fillText(String(c.shirt_number), 620, 140);
  ctx.fillStyle = WHITE; ctx.font = font(800, 72);
  const nameLines = wrap(ctx, (c.name || "").toUpperCase(), 400, 3);
  nameLines.forEach((l, i) => ctx.fillText(l, 620, 420 + i * 74));
  ctx.fillStyle = SLATE; ctx.font = font(600, 28); ctx.fillText([c.role, p.nickname ? `«${p.nickname}»` : null].filter(Boolean).join(" · ").toUpperCase(), 620, 420 + nameLines.length * 74 + 8);
  // quote
  let y = 750;
  if (p.quote) {
    ctx.fillStyle = GOLD; ctx.font = font(800, 120); ctx.fillText("“", 60, y - 40);
    ctx.fillStyle = WHITE; ctx.font = font(700, 52);
    wrap(ctx, p.quote, W - 220, 3).forEach((l, i) => ctx.fillText(l, 150, y + i * 58));
    y += Math.min(3, wrap(ctx, p.quote, W - 220, 3).length) * 58 + 40;
  }
  // facts
  const facts = [["ALTEZZA", p.height_cm ? `${p.height_cm} cm` : null], ["PIEDE", FOOT[p.foot]], ["IDOLO", p.idol], ["SQUADRA DEL CUORE", p.favorite_team]].filter((f) => f[1]);
  if (facts.length) {
    const cw = (W - 120 - (facts.length - 1) * 16) / facts.length;
    facts.forEach(([l, v], i) => { const x = 60 + i * (cw + 16); roundRect(ctx, x, y, cw, 110, 20, "rgba(255,255,255,0.06)"); ctx.fillStyle = SLATE; ctx.font = font(600, 20); ctx.fillText(l, x + 20, y + 18); ctx.fillStyle = WHITE; ctx.font = font(800, 40); let tv = String(v); while (ctx.measureText(tv).width > cw - 40 && tv.length > 3) tv = `${tv.slice(0, -2)}…`; ctx.fillText(tv, x + 20, y + 50); });
    y += 140;
  }
  // stats strip
  const stats = [["PRESENZE", t.presences || 0], ["GOL", t.goal || 0], ["ASSIST", t.assist || 0], ["MVP", t.mvp || 0]];
  const sw = (W - 120 - 48) / 4;
  stats.forEach(([l, v], i) => { const x = 60 + i * (sw + 16); roundRect(ctx, x, y, sw, 130, 20, primary); ctx.fillStyle = WHITE; ctx.font = font(800, 72); ctx.textAlign = "center"; ctx.fillText(String(v), x + sw / 2, y + 14); ctx.fillStyle = "rgba(255,255,255,0.8)"; ctx.font = font(600, 20); ctx.fillText(l, x + sw / 2, y + 96); });
  ctx.textAlign = "left"; y += 160;
  // badges
  const badges = (c.badges || []).slice(0, 4);
  if (badges.length && y < H - 200) {
    ctx.fillStyle = GOLD; ctx.font = font(700, 24); ctx.fillText(`BADGE CONQUISTATI · ${c.badges.length}`, 60, y); y += 40;
    let x = 60;
    badges.forEach((b) => { ctx.font = font(700, 26); const label = (b.label || b.kind || "").toUpperCase(); const bw = ctx.measureText(label).width + 56; if (x + bw > W - 60) return; roundRect(ctx, x, y, bw, 52, 26, "rgba(244,174,43,0.15)", "rgba(244,174,43,0.6)"); ctx.fillStyle = GOLD; ctx.fillText(label, x + 28, y + 12); x += bw + 12; });
  }
  ctx.fillStyle = "rgba(255,255,255,0.08)"; ctx.fillRect(0, H - 110, W, 110);
  ctx.fillStyle = GOLD; ctx.font = font(800, 36); ctx.fillText("FUTURE STARS LEAGUE", 60, H - 78);
  ctx.textAlign = "right"; ctx.fillStyle = SLATE; ctx.font = font(500, 24, "Inter, Arial, sans-serif"); ctx.fillText("Cartolina giocatore · futurestarsleague", W - 60, H - 72);
  ctx.textAlign = "left";
}

export function PlayerPostcard({ card, colors }) {
  const canvas = useRef(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!card || !canvas.current) return;
    const ctx = canvas.current.getContext("2d");
    const withPhoto = () => new Promise((res) => { if (!card.photo_url) return res(null); const img = new Image(); img.crossOrigin = "anonymous"; img.onload = () => res(img); img.onerror = () => res(null); img.src = mediaUrl(card.photo_url); });
    const fonts = document.fonts?.load ? Promise.all([document.fonts.load('800 100px "Barlow Condensed"'), document.fonts.load('500 20px Inter')]).catch(() => null) : Promise.resolve();
    Promise.all([fonts, withPhoto()]).then(([, img]) => { drawPostcard(ctx, card, img, colors); setReady(true); });
  }, [card, colors]);
  const blob = () => new Promise((res) => canvas.current.toBlob(res, "image/png"));
  const fileName = () => `fsl-${(card.name || "giocatore").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.png`;
  const download = async () => { const b = await blob(); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = fileName(); a.click(); URL.revokeObjectURL(a.href); };
  const share = async () => {
    const b = await blob(); const file = new File([b], fileName(), { type: "image/png" });
    const text = `${card.name}${card.profile?.quote ? ` · «${card.profile.quote}»` : ""} · Future Stars League`;
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: "Future Stars League", text }); } catch (e) { if (e.name !== "AbortError") toast.error("Condivisione non riuscita"); } } else { await download(); toast.info("Condivisione diretta non supportata: cartolina scaricata, inviala su WhatsApp"); }
  };
  return (
    <div className="grid sm:grid-cols-[minmax(0,260px)_1fr] gap-5 items-start" data-testid="player-postcard">
      <canvas ref={canvas} width={W} height={H} className="w-full max-w-[260px] rounded-xl border border-white/15 shadow-card bg-navy-900" aria-label="Cartolina del giocatore" data-testid="player-postcard-canvas" />
      <div className="space-y-3">
        <div className="fsl-kicker">Cartolina 1080 × 1350</div>
        <p className="text-sm text-fsl-slate">Foto, numero, citazione, statistiche ufficiali e badge in un'immagine pronta per WhatsApp e Instagram. Si aggiorna automaticamente con la scheda.</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-gold" disabled={!ready} onClick={download} data-testid="player-postcard-download"><Download className="h-4 w-4" /> Scarica cartolina</button>
          <button className="btn-primary" disabled={!ready} onClick={share} data-testid="player-postcard-share"><Share2 className="h-4 w-4" /> Condividi</button>
        </div>
      </div>
    </div>
  );
}
