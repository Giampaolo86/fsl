import { useEffect, useRef, useState } from "react";
import { Download, Share2 } from "lucide-react";
import { toast } from "sonner";
import { mediaUrl } from "@/lib/upload";

const W = 1080, H = 1350;
const NAVY = "#041E32", GOLD = "#F4AE2B", WHITE = "#F5F7FA", SLATE = "#9AA8B8";
const font = (w, s, fam = '"Barlow Condensed", "Arial Narrow", sans-serif') => `${w} ${s}px ${fam}`;
const fit = (ctx, text, max) => { let t = text || ""; while (ctx.measureText(t).width > max && t.length > 3) t = `${t.slice(0, -2)}…`; return t; };
const rr = (ctx, x, y, w, h, r, fill) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fillStyle = fill; ctx.fill(); };

export function drawTeamCard(ctx, d, crest, preview) {
  const primary = d.club?.colors?.primary || "#0B57D9", secondary = d.club?.colors?.secondary || GOLD;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = NAVY; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.globalAlpha = 0.9; ctx.fillStyle = primary; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W, 0); ctx.lineTo(W, 300); ctx.lineTo(0, 420); ctx.fill(); ctx.restore();
  ctx.textBaseline = "top"; ctx.textAlign = "left";
  ctx.fillStyle = GOLD; ctx.font = font(700, 30); ctx.fillText("FUTURE STARS LEAGUE", 60, 50);
  ctx.fillStyle = WHITE; ctx.font = font(500, 24, "Inter, Arial, sans-serif"); ctx.fillText(fit(ctx, `${d.tournament?.name || ""} · ${d.tournament?.season_label || ""}`, 700), 60, 90);
  if (crest) { ctx.save(); ctx.beginPath(); ctx.arc(W - 150, 150, 90, 0, Math.PI * 2); ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.fill(); ctx.clip(); ctx.drawImage(crest, W - 230, 70, 160, 160); ctx.restore(); }
  else { ctx.beginPath(); ctx.arc(W - 150, 150, 90, 0, Math.PI * 2); ctx.fillStyle = secondary; ctx.fill(); ctx.fillStyle = NAVY; ctx.font = font(800, 72); ctx.textAlign = "center"; ctx.fillText((d.club?.short_name || "FSL").slice(0, 3).toUpperCase(), W - 150, 112); ctx.textAlign = "left"; }
  ctx.fillStyle = WHITE; ctx.font = font(800, 92); ctx.fillText(fit(ctx, (d.team?.name || "").toUpperCase(), 720), 60, 150);
  ctx.fillStyle = secondary; ctx.fillRect(60, 250, 240, 10);
  ctx.fillStyle = WHITE; ctx.font = font(600, 30); ctx.fillText(fit(ctx, `${d.club?.name || ""} · ${d.competition || ""}`, 720), 60, 275);
  // season stats
  const st = d.standing || {};
  const stats = [["POS.", st.pos != null ? `${st.pos}°` : "—"], ["PUNTI", st.PT ?? "—"], ["GARE", st.PG ?? d.matches_played], ["V-N-P", st.PG != null ? `${st.V}-${st.N}-${st.P}` : "—"], ["GOL", st.PG != null ? `${st.GF}:${st.GS}` : "—"]];
  const sw = (W - 120 - 16 * 4) / 5;
  stats.forEach(([l, v], i) => { const x = 60 + i * (sw + 16); rr(ctx, x, 450, sw, 120, 18, "rgba(255,255,255,0.08)"); ctx.textAlign = "center"; ctx.fillStyle = GOLD; ctx.font = font(600, 20); ctx.fillText(l, x + sw / 2, 466); ctx.fillStyle = WHITE; ctx.font = font(800, 56); ctx.fillText(String(v), x + sw / 2, 494); });
  ctx.textAlign = "left";
  // roster two columns
  ctx.fillStyle = GOLD; ctx.font = font(700, 26); ctx.fillText(`LA ROSA · ${d.roster.length} GIOCATORI`, 60, 610);
  const rows = d.roster.slice(0, 22); const colH = 44; const half = Math.ceil(rows.length / 2);
  rows.forEach((p, i) => {
    const col = i < half ? 0 : 1; const y = 655 + (i - col * half) * colH; const x = 60 + col * 490;
    rr(ctx, x, y, 470, colH - 6, 10, i % 2 ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.08)");
    ctx.fillStyle = secondary; ctx.font = font(800, 28); ctx.textAlign = "right"; ctx.fillText(p.shirt_number != null ? String(p.shirt_number) : "", x + 52, y + 5);
    ctx.textAlign = "left"; ctx.fillStyle = WHITE; ctx.font = font(700, 27); ctx.fillText(fit(ctx, p.name.toUpperCase(), 280), x + 66, y + 6);
    ctx.fillStyle = SLATE; ctx.font = font(500, 18, "Inter, Arial, sans-serif"); ctx.fillText(fit(ctx, p.role || "", 90), x + 350, y + 11);
    if (p.goals) { ctx.fillStyle = GOLD; ctx.font = font(800, 24); ctx.textAlign = "right"; ctx.fillText(`${p.goals}⚽`, x + 460, y + 8); ctx.textAlign = "left"; }
  });
  // footer: top scorers + badges
  const fy = 655 + half * colH + 30;
  rr(ctx, 60, fy, W - 120, H - fy - 130, 20, primary);
  ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.font = font(600, 22); ctx.fillText("MARCATORI", 90, fy + 22);
  ctx.fillStyle = WHITE; ctx.font = font(800, 34);
  ctx.fillText(fit(ctx, (d.top_scorers || []).map((s) => `${s.name} ${s.goals}`).join(" · ") || "—", 600), 90, fy + 52);
  ctx.textAlign = "right"; ctx.fillStyle = GOLD; ctx.font = font(800, 72); ctx.fillText(String(d.badges_total || 0), W - 90, fy + 14); ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.font = font(600, 22); ctx.fillText("BADGE DI SQUADRA", W - 90, fy + 92);
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,0.08)"; ctx.fillRect(0, H - 110, W, 110);
  ctx.fillStyle = GOLD; ctx.font = font(800, 36); ctx.fillText("FUTURE STARS LEAGUE", 60, H - 78);
  ctx.textAlign = "right"; ctx.fillStyle = SLATE; ctx.font = font(500, 24, "Inter, Arial, sans-serif"); ctx.fillText("Cartolina squadra · La Serie A del futuro", W - 60, H - 72);
  ctx.textAlign = "left";
  if (preview) { ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(-Math.PI / 6); ctx.globalAlpha = 0.28; ctx.fillStyle = WHITE; ctx.font = font(800, 150); ctx.textAlign = "center"; ctx.fillText("ANTEPRIMA", 0, -80); ctx.font = font(700, 60); ctx.fillText("ACQUISTA PER SCARICARE · 2,49 €", 0, 90); ctx.restore(); }
}

export function TeamCard({ data, preview = false, onBuy, buying }) {
  const canvas = useRef(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!data || !canvas.current) return;
    const ctx = canvas.current.getContext("2d");
    const crest = () => new Promise((res) => { if (!data.club?.crest_url) return res(null); const img = new Image(); img.crossOrigin = "anonymous"; img.onload = () => res(img); img.onerror = () => res(null); img.src = mediaUrl(data.club.crest_url); });
    const fonts = document.fonts?.load ? Promise.all([document.fonts.load('800 100px "Barlow Condensed"'), document.fonts.load('500 20px Inter')]).catch(() => null) : Promise.resolve();
    Promise.all([fonts, crest()]).then(([, img]) => { drawTeamCard(ctx, data, img, preview); setReady(true); });
  }, [data, preview]);
  const blob = () => new Promise((res) => canvas.current.toBlob(res, "image/png"));
  const fileName = () => `fsl-squadra-${(data.team?.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.png`;
  const download = async () => { const b = await blob(); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = fileName(); a.click(); URL.revokeObjectURL(a.href); };
  const share = async () => {
    const b = await blob(); const file = new File([b], fileName(), { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: "Future Stars League", text: `${data.team?.name} · Future Stars League` }); } catch (e) { if (e.name !== "AbortError") toast.error("Condivisione non riuscita"); } } else { await download(); toast.info("Condivisione diretta non supportata: cartolina scaricata"); }
  };
  return (
    <div className="grid sm:grid-cols-[minmax(0,300px)_1fr] gap-5 items-start" data-testid="team-card">
      <canvas ref={canvas} width={W} height={H} className="w-full max-w-[300px] rounded-xl border border-white/15 shadow-card bg-navy-900" aria-label="Cartolina della squadra" data-testid="team-card-canvas" />
      <div className="space-y-3">
        <div className="fsl-kicker">Cartolina squadra 1080 × 1350</div>
        <p className="text-sm text-fsl-slate">Stemma, rosa completa, classifica, marcatori e badge della stagione in un'unica immagine da condividere nel gruppo squadra.</p>
        {preview ? (
          <button className="btn-gold" disabled={!ready || buying} onClick={onBuy} data-testid="team-card-buy">{buying ? "Reindirizzamento…" : `Acquista · ${Number(data.prices?.team_card ?? 2.49).toFixed(2).replace(".", ",")} €`}</button>
        ) : (
          <div className="flex flex-wrap gap-2"><button className="btn-gold" disabled={!ready} onClick={download} data-testid="team-card-download"><Download className="h-4 w-4" /> Scarica PNG</button><button className="btn-primary" disabled={!ready} onClick={share} data-testid="team-card-share"><Share2 className="h-4 w-4" /> Condividi</button></div>
        )}
      </div>
    </div>
  );
}
