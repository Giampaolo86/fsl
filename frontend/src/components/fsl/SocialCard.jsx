import { useCallback, useEffect, useRef, useState } from "react";
import { Download, RefreshCw, Share2 } from "lucide-react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { fmtVote } from "@/lib/fanta";

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

export function drawSocial(ctx, d) {
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
  let y = 480;
  if (d.mvp) {
    roundRect(ctx, 60, y, W - 120, 190, 24, "rgba(255,255,255,0.06)");
    ctx.fillStyle = GOLD; ctx.fillRect(60, y, 12, 190);
    ctx.font = font(700, 30); ctx.fillStyle = GOLD; ctx.fillText("MVP DELLA PARTITA", 100, y + 28);
    ctx.font = font(800, 72); ctx.fillStyle = WHITE; ctx.fillText(fit(ctx, d.mvp.name.toUpperCase(), 640), 100, y + 70);
    ctx.font = font(500, 26, "Inter, Arial, sans-serif"); ctx.fillStyle = SLATE; ctx.fillText(`${d.mvp.role} · ${d.mvp.team_id === d.home.id ? d.home.name : d.away.name}`, 100, y + 148);
    ctx.textAlign = "right"; ctx.font = font(800, 120); ctx.fillStyle = "#4C8DFF"; ctx.fillText(fmtVote(d.mvp.fanta), W - 100, y + 40);
    ctx.textAlign = "left"; y += 230;
  }
  ctx.font = font(700, 30); ctx.fillStyle = GOLD; ctx.fillText("PODIO", 60, y); y += 48;
  d.podium.forEach((p, i) => {
    roundRect(ctx, 60, y, W - 120, 92, 18, i === 0 ? "rgba(244,174,43,0.14)" : "rgba(255,255,255,0.05)");
    ctx.font = font(800, 56); ctx.fillStyle = GOLD; ctx.fillText(String(i + 1), 90, y + 16);
    ctx.font = font(700, 44); ctx.fillStyle = WHITE; ctx.fillText(fit(ctx, p.name, 560), 150, y + 22);
    ctx.font = font(500, 24, "Inter, Arial, sans-serif"); ctx.fillStyle = SLATE; ctx.textAlign = "right"; ctx.fillText(p.team_id === d.home.id ? d.home.short_name || d.home.name : d.away.short_name || d.away.name, W - 230, y + 34);
    ctx.font = font(800, 56); ctx.fillStyle = "#4C8DFF"; ctx.fillText(fmtVote(p.fanta), W - 100, y + 16); ctx.textAlign = "left";
    y += 104;
  });
  if (d.awards.length) {
    y += 16; ctx.font = font(700, 30); ctx.fillStyle = GOLD; ctx.fillText("PREMI E BADGE", 60, y); y += 48;
    let x = 60;
    ctx.font = font(500, 24, "Inter, Arial, sans-serif");
    d.awards.slice(0, 8).forEach((a) => {
      const label = `${a.label} · ${a.player}`; const w = ctx.measureText(label).width + 44;
      if (x + w > W - 60) { x = 60; y += 62; }
      if (y > H - 150) return;
      roundRect(ctx, x, y, w, 50, 25, "rgba(255,255,255,0.08)"); ctx.fillStyle = WHITE; ctx.fillText(label, x + 22, y + 13); x += w + 12;
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
    const paint = () => drawSocial(ctx, data);
    if (document.fonts?.load) Promise.all([document.fonts.load('800 100px "Barlow Condensed"'), document.fonts.load('500 20px Inter')]).then(paint, paint); else paint();
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
        <p className="text-sm text-fsl-slate">Grafica generata automaticamente da risultato, colori delle società, MVP (bonus specifico o miglior fantavoto), podio e premi della gara. Si rigenera a ogni rettifica di risultato, voti o premi.</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-gold" disabled={!data} onClick={download} data-testid="social-download"><Download className="h-4 w-4" /> Scarica PNG</button>
          <button className="btn-primary" disabled={!data} onClick={share} data-testid="social-share"><Share2 className="h-4 w-4" /> Condividi</button>
          <button className="btn-ghost" onClick={load} data-testid="social-regenerate"><RefreshCw className="h-4 w-4" /> Rigenera</button>
        </div>
        {data?.awards?.length > 0 && <ul className="text-xs text-fsl-slate space-y-1" data-testid="social-awards">{data.awards.map((a, i) => <li key={i}><span className="text-fsl-gold font-semibold">{a.label}</span> · {a.player}</li>)}</ul>}
      </div>
    </div>
  );
}
