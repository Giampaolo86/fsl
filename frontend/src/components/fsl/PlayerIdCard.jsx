import { useEffect, useRef, useState } from "react";
import { Download, Share2, Sparkles, Star } from "lucide-react";
import { toast } from "sonner";
import { GOLD, INK, NAVY, SLATE, WHITE, drawFifaCard, fmt1, loadFonts, loadImg } from "@/components/fsl/FifaCard";

const W = 1080, H = 1350;
const F = (w, s, fam = '"Barlow Condensed", "Arial Narrow", sans-serif') => `${w} ${s}px ${fam}`;
export const fmtEur = (v) => `${Number(v ?? 0).toFixed(2).replace(".", ",")} €`;

export async function drawPlayerId(ctx, c, { special = false, preview = false } = {}) {
  await loadFonts();
  const t = c.totals || {}, prim = c.club?.colors?.primary || "#0B57D9";
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = special ? INK : NAVY; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.5, H * 0.42, 40, W * 0.5, H * 0.42, 720); glow.addColorStop(0, special ? "rgba(244,174,43,0.28)" : `${prim}66`); glow.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.globalAlpha = 0.08; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; for (let i = -H; i < W; i += 90) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + H, H); ctx.stroke(); } ctx.restore();
  ctx.textBaseline = "top"; ctx.textAlign = "left";
  ctx.fillStyle = GOLD; ctx.font = "600 26px Inter, Arial, sans-serif"; ctx.fillText(special ? "FSL PLAYER ID · EDIZIONE SPECIALE" : "FSL PLAYER ID · PREMIUM", 60, 60);
  ctx.fillStyle = WHITE; ctx.font = F(800, 64); ctx.fillText("FUTURE STARS LEAGUE", 60, 92);
  ctx.fillStyle = SLATE; ctx.font = "500 24px Inter, Arial, sans-serif"; ctx.fillText(`${c.tournament?.name || ""}${c.season_label ? ` · Stagione ${c.season_label}` : ""}`, 60, 168);
  const logo = await loadImg("/brand/logo.png"); if (logo) ctx.drawImage(logo, W - 60 - 120, 56, 120, 120);
  const cardW = 520, cx = W / 2 - cardW / 2, cy = 240;
  const img = await loadImg(c.photo_url);
  const cardH = drawFifaCard(ctx, { x: cx, y: cy, w: cardW }, { name: c.name, photo_url: c.photo_url, role: c.role, fanta: c.avg_fanta, team: c.team, shirt_number: c.shirt_number, goals: t.goal || 0, assists: t.assist || 0, vote: c.avg_vote, mvp: special && (t.mvp || 0) > 0 }, { variant: special ? "special" : "gold", img });
  if (special) {
    const rib = [(c.top11?.length || 0) > 0 ? `TOP 11 × ${c.top11.length}` : null, (t.mvp || 0) > 0 ? `MVP × ${t.mvp}` : null].filter(Boolean);
    let rx = W / 2 - (rib.length * 200 + (rib.length - 1) * 16) / 2;
    rib.forEach((label) => { ctx.fillStyle = GOLD; ctx.beginPath(); ctx.roundRect(rx, cy + cardH + 26, 200, 52, 26); ctx.fill(); ctx.fillStyle = INK; ctx.font = "800 24px Inter, Arial, sans-serif"; ctx.textAlign = "center"; ctx.fillText(label, rx + 100, cy + cardH + 38); rx += 216; });
    if (!rib.length) { ctx.fillStyle = GOLD; ctx.font = "700 26px Caveat, cursive"; ctx.textAlign = "center"; ctx.fillText("La prossima Top 11 ti aspetta", W / 2, cy + cardH + 30); }
  }
  ctx.textAlign = "left";
  const y = 1080;
  const stats = [["PRESENZE", t.presences || 0], ["GOL", t.goal || 0], ["ASSIST", t.assist || 0], ["MEDIA FANTA", fmt1(c.avg_fanta)], ["MVP", t.mvp || 0], ["TOP 11", c.top11?.length || c.top11_count || 0]];
  const sw = (W - 120 - 5 * 14) / 6;
  stats.forEach(([l, v], i) => { const x = 60 + i * (sw + 14); ctx.fillStyle = "rgba(255,255,255,0.06)"; ctx.beginPath(); ctx.roundRect(x, y, sw, 120, 18); ctx.fill(); ctx.strokeStyle = special ? "rgba(244,174,43,0.35)" : "rgba(255,255,255,0.12)"; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = GOLD; ctx.font = F(800, 58); ctx.textAlign = "center"; ctx.fillText(String(v), x + sw / 2, y + 16); ctx.fillStyle = SLATE; ctx.font = "600 15px Inter, Arial, sans-serif"; ctx.fillText(l, x + sw / 2, y + 86); });
  ctx.textAlign = "left"; ctx.fillStyle = "rgba(255,255,255,0.08)"; ctx.fillRect(0, H - 96, W, 96);
  ctx.fillStyle = GOLD; ctx.font = F(800, 32); ctx.fillText("FUTURE STARS LEAGUE", 60, H - 66);
  ctx.textAlign = "right"; ctx.fillStyle = SLATE; ctx.font = "500 20px Inter, Arial, sans-serif"; ctx.fillText(`ID ${String(c.player_id || "").slice(-8).toUpperCase()} · ${c.club?.name || c.team || ""}`, W - 60, H - 62);
  if (preview) {
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(-Math.PI / 7); ctx.globalAlpha = 0.16; ctx.fillStyle = "#fff"; ctx.font = F(800, 200); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("ANTEPRIMA", 0, 0); ctx.fillText("FSL", 0, 220); ctx.restore();
  }
}

export function usePlayerIdCanvas({ card, special = false, preview = false, className = "" }) {
  const ref = useRef(null);
  const [ready, setReady] = useState(false);
  useEffect(() => { if (!card || !ref.current) return; drawPlayerId(ref.current.getContext("2d"), card, { special, preview }).then(() => setReady(true)); }, [card, special, preview]);
  const blob = () => new Promise((res) => ref.current.toBlob(res, "image/png"));
  const fileName = () => `fsl-player-id-${special ? "speciale" : "premium"}-${(card.name || "giocatore").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
  const download = async () => { const b = await blob(); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = fileName(); a.click(); URL.revokeObjectURL(a.href); };
  const share = async () => { const b = await blob(); const file = new File([b], fileName(), { type: "image/png" }); if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: "FSL Player ID", text: `${card.name} · Future Stars League` }); } catch (e) { if (e.name !== "AbortError") toast.error("Condivisione non riuscita"); } } else { await download(); toast.info("Card scaricata: condividila su WhatsApp o Instagram"); } };
  return { canvas: <canvas ref={ref} width={W} height={H} className={`rounded-2xl border border-white/15 shadow-elev bg-navy-900 ${className}`} aria-label="Card Player ID" data-testid={`player-id-canvas-${special ? "special" : "premium"}`} />, ready, download, share };
}

export function PlayerIdProduct({ card, special }) {
  const { canvas, ready, download, share } = usePlayerIdCanvas({ card, special });
  return (
    <div className="grid lg:grid-cols-[minmax(0,420px)_1fr] gap-8 items-start" data-testid="player-id-product">
      <div className="w-full max-w-[420px]">{canvas}</div>
      <div className="space-y-4">
        <div className="fsl-kicker">{special ? "Card Player ID · Edizione speciale Top 11 / MVP" : "Card Player ID · Premium"}</div>
        <h2 className="text-3xl sm:text-4xl font-extrabold uppercase leading-[0.95]">{card.name}</h2>
        <p className="text-sm text-fsl-slate max-w-lg">Card in stile FIFA con foto, ruolo, numero di maglia, media fantavoto, gol, assist, MVP e presenze in Top 11: si aggiorna automaticamente con i tabellini ufficiali. 1080 × 1350, pronta per WhatsApp e Instagram.</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-gold" disabled={!ready} onClick={download} data-testid="player-id-download"><Download className="h-4 w-4" /> Scarica PNG</button>
          <button className="btn-primary" disabled={!ready} onClick={share} data-testid="player-id-share"><Share2 className="h-4 w-4" /> Condividi</button>
        </div>
        {special && card.top11?.length > 0 && <div className="fsl-card p-4 text-sm" data-testid="player-id-top11-list"><div className="fsl-label mb-2">Presenze in Top 11</div><ul className="space-y-1">{card.top11.map((x, i) => <li key={i} className="flex justify-between gap-3"><span>Giornata {x.match_day} · {x.competition}</span><span className="num text-fsl-gold font-bold">{fmt1(x.fanta)}</span></li>)}</ul></div>}
      </div>
    </div>
  );
}

export function PlayerIdOffer({ preview, onBuy, busy }) {
  const [special, setSpecial] = useState(false);
  const { canvas } = usePlayerIdCanvas({ card: preview, special, preview: true, className: "w-full" });
  if (!preview) return null;
  const price = preview.prices?.[special ? "player_card_special" : "player_card"];
  return (
    <section className="relative overflow-hidden rounded-3xl border border-fsl-gold/30 bg-navy-800" data-testid="player-id-offer">
      <div className="absolute inset-0 grain opacity-40 pointer-events-none" />
      <div className="relative grid lg:grid-cols-[minmax(0,300px)_1fr] gap-8 p-6 md:p-8 items-center">
        <div className="mx-auto w-full max-w-[300px]">{canvas}</div>
        <div>
          <div className="fsl-kicker flex items-center gap-2"><Sparkles className="h-4 w-4 text-fsl-gold" /> FSL Player ID</div>
          <h2 className="mt-1 text-3xl sm:text-4xl font-extrabold uppercase leading-[0.95]">La card ufficiale in stile FIFA</h2>
          <p className="mt-2 text-sm text-fsl-slate max-w-xl">Foto, ruolo, numero, media fantavoto, gol, assist, MVP e Top 11: la card si aggiorna da sola con ogni tabellino ufficiale. Link personale sempre aggiornato, scaricabile e condivisibile.</p>
          <div className="mt-5 grid sm:grid-cols-2 gap-3">
            {[[false, "Card Premium", "Oro FIFA · statistiche ufficiali", preview.prices?.player_card], [true, "Card Speciale", "Edizione nera e oro · Top 11 e MVP in evidenza", preview.prices?.player_card_special]].map(([sp, title, sub, pr]) => (
              <button key={String(sp)} type="button" onClick={() => setSpecial(sp)} className={`text-left rounded-2xl border p-4 transition-colors ${special === sp ? "border-fsl-gold bg-fsl-gold/10" : "border-white/15 hover:border-white/40"}`} data-testid={`player-id-pick-${sp ? "special" : "premium"}`}>
                <div className="flex items-center justify-between"><span className="font-display font-extrabold uppercase text-lg flex items-center gap-1">{sp && <Star className="h-4 w-4 text-fsl-gold" />}{title}</span><span className="num font-display font-extrabold text-2xl text-fsl-gold">{fmtEur(pr)}</span></div>
                <div className="text-xs text-fsl-slate mt-1">{sub}</div>
              </button>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button className="btn-gold" disabled={busy || !preview.purchasable} onClick={() => onBuy(special ? "player_card_special" : "player_card")} data-testid="player-id-buy">{busy ? "Reindirizzamento…" : `Acquista ${special ? "la card speciale" : "la card premium"} · ${fmtEur(price)}`}</button>
            <span className="text-[10px] text-fsl-slate">Pagamento sicuro Stripe · link personale{!preview.purchasable ? " · disponibile con il consenso della famiglia" : ""}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
