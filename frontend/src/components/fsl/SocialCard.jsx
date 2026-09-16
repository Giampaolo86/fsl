import { useCallback, useEffect, useRef, useState } from "react";
import { Download, RefreshCw, Share2 } from "lucide-react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { fmtVote } from "@/lib/fanta";
import { mediaUrl } from "@/lib/upload";

const W = 1080, H = 1350;
const NAVY = "#041E32", GOLD = "#F4AE2B", WHITE = "#F5F7FA", SLATE = "#9AA8B8";
const font = (w, s, fam = '"Barlow Condensed", "Arial Narrow", sans-serif') => `${w} ${s}px ${fam}`;

function fit(ctx, text, max) {
  let t = text || "";
  while (ctx.measureText(t).width > max && t.length > 3) t = `${t.slice(0, -2)}…`;
  return t;
}

function roundRect(ctx, x, y, w, h, r, fill) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fillStyle = fill; ctx.fill();
}

export function drawSocial(ctx, d, mvpImg = null) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = NAVY; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.globalAlpha = 0.9;
  ctx.fillStyle = d.home.colors?.primary || "#0B57D9"; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W * 0.62, 0); ctx.lineTo(W * 0.38, 430); ctx.lineTo(0, 430); ctx.fill();
  ctx.fillStyle = d.away.colors?.primary || "#7A1E2C"; ctx.beginPath(); ctx.moveTo(W * 0.62, 0); ctx.lineTo(W, 0); ctx.lineTo(W, 430); ctx.lineTo(W * 0.38, 430); ctx.fill();
  ctx.restore();
  ctx.fillStyle = "rgba(4,30,50,0.55)"; ctx.fillRect(0, 0, W, 430);
  ctx.textBaseline = "top"; ctx.textAlign = "left";
  ctx.fillStyle = GOLD; ctx.font = font(700, 30); ctx.fillText((d.tournament || "").toUpperCase(), 60, 56);
  ctx.fillStyle = WHITE; ctx.font = font(500, 26, "Inter, Arial, sans-serif"); ctx.fillText(fit(ctx, `${d.competition} · ${d.round_name}`, 700), 60, 96);
  ctx.textAlign = "right"; ctx.fillStyle = SLATE; ctx.fillText(new Date(d.kickoff_at).toLocaleDateString("it-IT", { day: "2-digit", month: "short" }).toUpperCase(), W - 60, 96);
  ctx.textAlign = "center"; ctx.fillStyle = WHITE; ctx.font = font(800, 54);
  ctx.fillText(fit(ctx, (d.home.name || "").toUpperCase(), 380), 250, 190);
  ctx.fillText(fit(ctx, (d.away.name || "").toUpperCase(), 380), W - 250, 190);
  ctx.fillStyle = d.home.colors?.secondary || GOLD; ctx.fillRect(150, 262, 200, 8);
  ctx.fillStyle = d.away.colors?.secondary || GOLD; ctx.fillRect(W - 350, 262, 200, 8);
  const score = d.score.home == null ? "VS" : `${d.score.home}-${d.score.away}`;
  ctx.fillStyle = WHITE; ctx.font = font(800, 200); ctx.fillText(score, W / 2, 215);
  if (d.score.home_pen != null) { ctx.font = font(600, 30); ctx.fillStyle = GOLD; ctx.fillText(`(${d.score.home_pen}-${d.score.away_pen} dcr)`, W / 2, 415); }
  ctx.textAlign = "left";
  let y = 470;
  const sc = d.scorers || { home: [], away: [] };
  if (sc.home.length || sc.away.length) {
    ctx.font = font(700, 26); ctx.fillStyle = GOLD; ctx.textAlign = "center"; ctx.fillText("MARCATORI", W / 2, y); y += 40;
    ctx.font = font(500, 30, "Inter, Arial, sans-serif");
    const lines = Math.min(6, Math.max(sc.home.length, sc.away.length));
    for (let i = 0; i < lines; i++) {
      const hm = sc.home[i], aw = sc.away[i];
      ctx.fillStyle = WHITE;
      if (hm) { ctx.textAlign = "right"; ctx.fillText(fit(ctx, `${hm.name}${hm.goals > 1 ? ` ×${hm.goals}` : ""}`, 440), W / 2 - 40, y); }
      if (aw) { ctx.textAlign = "left"; ctx.fillText(fit(ctx, `${aw.name}${aw.goals > 1 ? ` ×${aw.goals}` : ""}`, 440), W / 2 + 40, y); }
      ctx.fillStyle = GOLD; ctx.beginPath(); ctx.arc(W / 2, y + 16, 5, 0, Math.PI * 2); ctx.fill();
      y += 42;
    }
    if (Math.max(sc.home.length, sc.away.length) > 6) { ctx.textAlign = "center"; ctx.fillStyle = SLATE; ctx.font = font(500, 24, "Inter, Arial, sans-serif"); ctx.fillText("…", W / 2, y); y += 30; }
    y += 24;
  }
  ctx.textAlign = "left";
  if (d.mvp) {
    roundRect(ctx, 60, y, W - 120, 170, 24, "rgba(255,255,255,0.06)");
    ctx.fillStyle = GOLD; ctx.fillRect(60, y, 12, 170);
    ctx.font = font(700, 28); ctx.fillStyle = GOLD; ctx.fillText("MVP DELLA PARTITA", 100, y + 24);
    ctx.font = font(800, 66); ctx.fillStyle = WHITE; ctx.fillText(fit(ctx, d.mvp.name.toUpperCase(), mvpImg ? 470 : 620), 100, y + 60);
    ctx.font = font(500, 24, "Inter, Arial, sans-serif"); ctx.fillStyle = SLATE; ctx.fillText(fit(ctx, `${d.mvp.role} · ${d.mvp.team_id === d.home.id ? d.home.name : d.away.name}`, 500), 100, y + 130);
    if (mvpImg) { ctx.save(); ctx.beginPath(); ctx.arc(665, y + 85, 58, 0, Math.PI * 2); ctx.closePath(); ctx.clip(); ctx.drawImage(mvpImg, 607, y + 27, 116, 116); ctx.restore(); ctx.strokeStyle = GOLD; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(665, y + 85, 58, 0, Math.PI * 2); ctx.stroke(); }
    ctx.textAlign = "right"; ctx.font = font(800, 110); ctx.fillStyle = "#4C8DFF"; ctx.fillText(fmtVote(d.mvp.fanta), W - 100, y + 30);
    ctx.textAlign = "left"; y += 200;
  }
  if (d.podium?.length) {
    ctx.font = font(700, 24); ctx.fillStyle = GOLD; ctx.fillText("PODIO", 60, y); y += 36;
    d.podium.forEach((p, i) => {
      if (y > H - 190) return;
      roundRect(ctx, 60, y, W - 120, 56, 14, i === 0 ? "rgba(244,174,43,0.14)" : "rgba(255,255,255,0.05)");
      ctx.font = font(800, 34); ctx.fillStyle = GOLD; ctx.fillText(String(i + 1), 84, y + 10);
      ctx.font = font(700, 30); ctx.fillStyle = WHITE; ctx.fillText(fit(ctx, p.name, 560), 130, y + 12);
      ctx.font = font(500, 20, "Inter, Arial, sans-serif"); ctx.fillStyle = SLATE; ctx.textAlign = "right"; ctx.fillText(fit(ctx, p.team_id === d.home.id ? d.home.short_name || d.home.name : d.away.short_name || d.away.name, 220), W - 190, y + 18);
      ctx.font = font(800, 34); ctx.fillStyle = "#4C8DFF"; ctx.fillText(fmtVote(p.fanta), W - 90, y + 10); ctx.textAlign = "left";
      y += 64;
    });
  }
  ctx.fillStyle = GOLD; ctx.fillRect(60, H - 110, W - 120, 2);
  ctx.font = font(800, 34); ctx.fillStyle = WHITE; ctx.fillText("FUTURE STARS LEAGUE", 60, H - 90);
  ctx.font = font(500, 22, "Inter, Arial, sans-serif"); ctx.fillStyle = GOLD; ctx.fillText((d.payoff || "La Serie A del futuro").toUpperCase(), 60, H - 48);
  ctx.textAlign = "right"; ctx.fillStyle = d.status === "ready" ? "#2FBF71" : GOLD; ctx.font = font(700, 24); ctx.fillText(d.status === "ready" ? "RISULTATO UFFICIALE" : "ANTEPRIMA · NON UFFICIALE", W - 60, H - 84);
  ctx.textAlign = "left";
}

export function SocialCard({ url, version }) {
  const canvas = useRef(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => api.get(url).then((r) => setData(r.data)).catch(setError), [url]);
  useEffect(() => { load(); }, [load, version]);
  useEffect(() => {
    if (!data || !canvas.current) return;
    const ctx = canvas.current.getContext("2d");
    const paint = (img) => drawSocial(ctx, data, img);
    const withPhoto = () => new Promise((res) => { if (!data.mvp?.photo_url) return res(null); const img = new Image(); img.crossOrigin = "anonymous"; img.onload = () => res(img); img.onerror = () => res(null); img.src = mediaUrl(data.mvp.photo_url); });
    const fonts = document.fonts?.load ? Promise.all([document.fonts.load('800 100px "Barlow Condensed"'), document.fonts.load('500 20px Inter')]).catch(() => null) : Promise.resolve();
    Promise.all([fonts, withPhoto()]).then(([, img]) => paint(img));
  }, [data]);
  const blob = () => new Promise((res) => canvas.current.toBlob(res, "image/png"));
  const fileName = () => `fsl-${(data.home.short_name || "casa").toLowerCase()}-${(data.away.short_name || "ospite").toLowerCase()}.png`;
  const download = async () => { const b = await blob(); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = fileName(); a.click(); URL.revokeObjectURL(a.href); };
  const share = async () => {
    const b = await blob(); const file = new File([b], fileName(), { type: "image/png" });
    const text = `${data.home.name} ${data.score.home ?? ""}-${data.score.away ?? ""} ${data.away.name}${data.mvp ? ` · MVP ${data.mvp.name}` : ""} · Future Stars League`;
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: "Future Stars League", text }); } catch (e) { if (e.name !== "AbortError") toast.error("Condivisione non riuscita"); } } else { await download(); toast.info("Condivisione diretta non supportata: immagine scaricata"); }
  };
  if (error) return <p className="text-sm text-fsl-danger">{apiError(error)}</p>;
  return (
    <div className="grid md:grid-cols-[minmax(0,320px)_1fr] gap-5 items-start" data-testid="social-match-center">
      <canvas ref={canvas} width={W} height={H} className="w-full max-w-[320px] rounded-xl border border-white/15 shadow-card bg-navy-900" aria-label="Grafica social della partita" data-testid="social-canvas" />
      <div className="space-y-3">
        <div className="flex items-center gap-2"><span className={`h-7 px-3 rounded-full text-[11px] font-bold uppercase inline-flex items-center ${data?.status === "ready" ? "bg-fsl-success text-ink-950" : "bg-fsl-warning text-ink-950"}`} data-testid="social-status">{data ? (data.status === "ready" ? "Pronta da pubblicare" : "Anteprima") : "…"}</span><span className="text-xs text-fsl-slate">1080 × 1350 · formato verticale</span></div>
        <p className="text-sm text-fsl-slate">Grafica generata automaticamente da risultato, colori delle società, marcatori, MVP e podio della gara. I badge restano sul profilo di ogni giocatore. Si rigenera a ogni rettifica di risultato o voti.</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-gold" disabled={!data} onClick={download} data-testid="social-download"><Download className="h-4 w-4" /> Scarica PNG</button>
          <button className="btn-primary" disabled={!data} onClick={share} data-testid="social-share"><Share2 className="h-4 w-4" /> Condividi</button>
          <button className="btn-ghost" onClick={load} data-testid="social-regenerate"><RefreshCw className="h-4 w-4" /> Rigenera</button>
        </div>
      </div>
    </div>
  );
}
