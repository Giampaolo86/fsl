import { GOLD, INK, NAVY, SLATE, WHITE, drawFifaCard, fmt1, loadFonts, loadImg, preload, splitName } from "@/components/fsl/FifaCard";
import { drawPosterFooter, drawPosterHeader, drawStadium, renderTop11 } from "@/components/fsl/Top11Board";

const F = (w, s, fam = '"Barlow Condensed", "Arial Narrow", sans-serif') => `${w} ${s}px ${fam}`;
const fit = (ctx, t, max) => { let s = t || ""; while (ctx.measureText(s).width > max && s.length > 2) s = `${s.slice(0, -2)}…`; return s; };
const when = (iso) => { try { const d = new Date(iso); return `${d.toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "2-digit" })} · ${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`.toUpperCase(); } catch { return iso || ""; } };
export const FORMATS = { "4:5": [1080, 1350], "9:16": [1080, 1920], "1:1": [1080, 1080] };

function bg(ctx, W, H, c1 = "#0B57D9", c2 = GOLD) {
  ctx.fillStyle = NAVY; ctx.fillRect(0, 0, W, H);
  const g1 = ctx.createRadialGradient(W * 0.15, H * 0.2, 0, W * 0.15, H * 0.2, W * 0.9); g1.addColorStop(0, `${c1}88`); g1.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = g1; ctx.fillRect(0, 0, W, H);
  const g2 = ctx.createRadialGradient(W * 0.9, H * 0.85, 0, W * 0.9, H * 0.85, W * 0.8); g2.addColorStop(0, `${c2}55`); g2.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.globalAlpha = 0.07; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; for (let i = -H; i < W; i += 96) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + H, H); ctx.stroke(); } ctx.restore();
}

async function header(ctx, W, kicker, title, sub) {
  ctx.textBaseline = "top"; ctx.textAlign = "left";
  ctx.fillStyle = GOLD; ctx.font = "600 24px Inter, Arial, sans-serif"; ctx.fillText(kicker.toUpperCase(), 60, 64);
  const g = ctx.createLinearGradient(0, 96, 0, 230); g.addColorStop(0, "#FFF3C4"); g.addColorStop(0.55, "#F4AE2B"); g.addColorStop(1, "#C8811A");
  ctx.fillStyle = g; ctx.font = F(800, 132); ctx.fillText(fit(ctx, title.toUpperCase(), W - 260), 56, 88);
  if (sub) { ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.font = "700 38px Caveat, cursive"; ctx.fillText(sub, 62, 232); }
  const logo = await loadImg("/brand/logo.png"); if (logo) ctx.drawImage(logo, W - 60 - 120, 56, 120, 120);
}

async function footer(ctx, W, H, sponsor, left = "FUTURE STARS LEAGUE · LA SERIE A DEL FUTURO") {
  ctx.fillStyle = "rgba(255,255,255,0.07)"; ctx.fillRect(0, H - 96, W, 96);
  ctx.textBaseline = "middle"; ctx.textAlign = "left"; ctx.fillStyle = WHITE; ctx.font = F(800, 30); ctx.fillText(left, 60, H - 48);
  if (sponsor?.name) {
    ctx.textAlign = "right"; ctx.fillStyle = GOLD; ctx.font = "700 22px Inter, Arial, sans-serif";
    let x = W - 60;
    if (sponsor.logo_url) { const li = await loadImg(sponsor.logo_url); if (li) { const lh = 56, lw = lh * (li.width / li.height); ctx.fillStyle = "rgba(255,255,255,0.95)"; ctx.beginPath(); ctx.roundRect(W - 60 - lw - 16, H - 48 - lh / 2 - 8, lw + 16, lh + 16, 10); ctx.fill(); ctx.drawImage(li, W - 60 - lw - 8, H - 48 - lh / 2, lw, lh); x = W - 60 - lw - 40; ctx.fillStyle = GOLD; } }
    ctx.fillText(`PRESENTED BY ${sponsor.name.toUpperCase()}`, x, H - 48);
  }
  ctx.textBaseline = "top";
}

const crest = async (ctx, side, x, y, s) => {
  const im = await loadImg(side.crest_url);
  ctx.save(); ctx.beginPath(); ctx.arc(x + s / 2, y + s / 2, s / 2, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = side.colors?.primary || "#0B57D9"; ctx.fillRect(x, y, s, s);
  if (im) ctx.drawImage(im, x + s * 0.1, y + s * 0.1, s * 0.8, s * 0.8); else { ctx.fillStyle = "#fff"; ctx.font = F(800, s * 0.42); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText((side.short_name || side.name || "?").slice(0, 3).toUpperCase(), x + s / 2, y + s / 2 + 2); }
  ctx.restore(); ctx.textBaseline = "top";
};

export async function renderMatchday(ctx, W, H, d, opts) {
  await loadFonts(); bg(ctx, W, H);
  await header(ctx, W, `${d.tournament} · ${d.competition}`, opts.headline || "Matchday", `Giornata ${d.match_day} · in campo questo weekend`);
  const list = d.matches.slice(0, H > 1400 ? 12 : H < 1200 ? 6 : 9);
  await preload(list.flatMap((m) => [m.home.crest_url, m.away.crest_url]));
  const top = 300, rowH = Math.min(96, (H - top - 130) / Math.max(list.length, 1));
  for (let i = 0; i < list.length; i++) {
    const m = list[i], y = top + i * rowH;
    ctx.fillStyle = i % 2 ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.07)"; ctx.beginPath(); ctx.roundRect(60, y, W - 120, rowH - 10, 16); ctx.fill();
    await crest(ctx, m.home, 80, y + (rowH - 10) / 2 - 26, 52); await crest(ctx, m.away, W - 80 - 52, y + (rowH - 10) / 2 - 26, 52);
    ctx.fillStyle = WHITE; ctx.font = F(800, 34); ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(fit(ctx, m.home.name.toUpperCase(), 300), 150, y + (rowH - 10) / 2);
    ctx.textAlign = "right"; ctx.fillText(fit(ctx, m.away.name.toUpperCase(), 300), W - 150, y + (rowH - 10) / 2);
    ctx.textAlign = "center"; ctx.fillStyle = GOLD; ctx.font = "700 18px Inter, Arial, sans-serif"; ctx.fillText(when(m.kickoff_at), W / 2, y + (rowH - 10) / 2 - 14);
    ctx.fillStyle = SLATE; ctx.font = "500 16px Inter, Arial, sans-serif"; ctx.fillText(fit(ctx, (m.field_name || m.venue_name || "").toUpperCase(), 220), W / 2, y + (rowH - 10) / 2 + 14);
    ctx.textBaseline = "top";
  }
  await footer(ctx, W, H, opts.sponsor);
}

export async function renderFullTime(ctx, W, H, s, opts) {
  await loadFonts(); bg(ctx, W, H, s.home.colors?.primary, s.away.colors?.primary);
  await header(ctx, W, `${s.tournament} · ${s.competition}`, opts.headline || "Full Time", s.round_name || "");
  await preload([s.home.crest_url, s.away.crest_url, s.mvp?.photo_url]);
  const cy = H > 1400 ? 620 : H < 1200 ? 420 : 500, cs = H < 1200 ? 200 : 260;
  await crest(ctx, s.home, W * 0.25 - cs / 2, cy - cs / 2, cs); await crest(ctx, s.away, W * 0.75 - cs / 2, cy - cs / 2, cs);
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = WHITE; ctx.font = F(800, H < 1200 ? 180 : 230); ctx.fillText(`${s.score?.home ?? "-"}  ${s.score?.away ?? "-"}`, W / 2, cy);
  ctx.fillStyle = GOLD; ctx.fillRect(W / 2 - 4, cy - 70, 8, 140);
  ctx.font = F(800, 40); ctx.fillStyle = WHITE; ctx.fillText(fit(ctx, s.home.name.toUpperCase(), 440), W * 0.25, cy + cs / 2 + 44); ctx.fillText(fit(ctx, s.away.name.toUpperCase(), 440), W * 0.75, cy + cs / 2 + 44);
  const y0 = cy + cs / 2 + 110; ctx.font = "500 24px Inter, Arial, sans-serif"; ctx.fillStyle = SLATE;
  (s.scorers?.home || []).slice(0, 5).forEach((x, i) => { ctx.textAlign = "center"; ctx.fillText(fit(ctx, `${x.name}${x.goals > 1 ? ` ×${x.goals}` : ""}`, 440), W * 0.25, y0 + i * 32); });
  (s.scorers?.away || []).slice(0, 5).forEach((x, i) => { ctx.fillText(fit(ctx, `${x.name}${x.goals > 1 ? ` ×${x.goals}` : ""}`, 440), W * 0.75, y0 + i * 32); });
  if (s.mvp && H >= 1200) { const my = H - 96 - 60 - 110; ctx.fillStyle = "rgba(244,174,43,0.12)"; ctx.beginPath(); ctx.roundRect(60, my, W - 120, 110, 20); ctx.fill(); ctx.strokeStyle = "rgba(244,174,43,0.5)"; ctx.lineWidth = 2; ctx.stroke(); const im = await loadImg(s.mvp.photo_url); ctx.save(); ctx.beginPath(); ctx.arc(130, my + 55, 38, 0, Math.PI * 2); ctx.clip(); ctx.fillStyle = INK; ctx.fillRect(92, my + 17, 76, 76); if (im) ctx.drawImage(im, 92, my + 17, 76, 76); ctx.restore(); ctx.textAlign = "left"; ctx.fillStyle = GOLD; ctx.font = "700 18px Inter, Arial, sans-serif"; ctx.fillText("MVP DELLA PARTITA", 190, my + 34); ctx.fillStyle = WHITE; ctx.font = F(800, 40); ctx.fillText(fit(ctx, s.mvp.name.toUpperCase(), 600), 190, my + 70); ctx.textAlign = "right"; ctx.fillStyle = GOLD; ctx.font = F(800, 56); ctx.fillText(fmt1(s.mvp.fanta), W - 90, my + 55); }
  ctx.textBaseline = "top"; await footer(ctx, W, H, opts.sponsor);
}

export async function renderMvp(ctx, W, H, s, opts) {
  await loadFonts(); const mine = s.mvp && (s.mvp.team_id === s.home.id ? s.home : s.away); bg(ctx, W, H, mine?.colors?.primary || GOLD, GOLD);
  await header(ctx, W, `${s.tournament} · ${s.competition}`, opts.headline || "MVP", `${s.home.name} ${s.score?.home ?? ""}-${s.score?.away ?? ""} ${s.away.name}`);
  if (!s.mvp) { ctx.fillStyle = SLATE; ctx.font = F(700, 40); ctx.textAlign = "center"; ctx.fillText("MVP NON ANCORA ASSEGNATO", W / 2, H / 2); await footer(ctx, W, H, opts.sponsor); return; }
  const cw = H < 1200 ? 380 : 520, cx = W / 2 - cw / 2, cy = H > 1400 ? 420 : 300;
  const img = await loadImg(s.mvp.photo_url);
  const ch = drawFifaCard(ctx, { x: cx, y: cy, w: cw }, { name: s.mvp.name, photo_url: s.mvp.photo_url, role: s.mvp.role, fanta: s.mvp.fanta, vote: s.mvp.vote, team: mine?.name, shirt_number: s.mvp.shirt_number, goals: s.mvp.events?.goal || 0, assists: s.mvp.events?.assist || 0, mvp: true }, { variant: "special", img });
  const [first, last] = splitName(s.mvp.name);
  if (cy + ch + 150 < H - 100) { ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.font = "600 26px Inter, Arial, sans-serif"; ctx.fillText(first.toUpperCase(), W / 2, cy + ch + 40); ctx.fillStyle = WHITE; ctx.font = F(800, 84); ctx.fillText(fit(ctx, (last || first).toUpperCase(), W - 120), W / 2, cy + ch + 70); }
  await footer(ctx, W, H, opts.sponsor);
}

export async function renderStandings(ctx, W, H, d, opts) {
  await loadFonts(); await drawStadium(ctx, W, H);
  const scale = H < 1200 ? 0.5 : H > 1400 ? 0.9 : 0.66;
  const top = (await drawPosterHeader(ctx, W, { gold: (opts.headline || "Classifica").toUpperCase(), white: "SETTIMANALE", sub: "I leader del campionato", pill: d.match_day ? `Giornata ${d.match_day}` : d.competition, y0: H > 1400 ? 60 : 30, scale })) + 20;
  const rows = d.rows.slice(0, H > 1400 ? 18 : H < 1200 ? 10 : 12);
  await preload(rows.map((r) => r.club?.crest_url));
  const fy = H - 130, avail = fy - top - 40, rowH = Math.min(78, Math.floor((avail - 44) / Math.max(rows.length, 1)));
  const cols = [["PT", 640], ["PG", 720], ["V", 786], ["N", 848], ["P", 910], ["GF", 972], ["GS", 1034]];
  ctx.fillStyle = "rgba(3,19,31,0.85)"; ctx.beginPath(); ctx.roundRect(560, top, W - 560 - 40, 40, 8); ctx.fill(); ctx.strokeStyle = "rgba(244,174,43,0.7)"; ctx.lineWidth = 2; ctx.stroke();
  ctx.textBaseline = "middle"; ctx.textAlign = "center"; ctx.font = "700 20px Inter, Arial, sans-serif";
  cols.forEach(([l, x], i) => { ctx.fillStyle = i === 0 ? GOLD : "rgba(255,255,255,0.85)"; ctx.fillText(l, x, top + 20); if (i) { ctx.fillStyle = "rgba(244,174,43,0.35)"; ctx.fillRect(x - 31, top + 8, 1, 24); } });
  const medal = ["#F4AE2B", "#C9D3DE", "#C8811A"];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i], y = top + 52 + i * rowH, h = rowH - 8, podium = i < 3;
    ctx.save(); if (podium) { ctx.shadowColor = medal[i]; ctx.shadowBlur = 22; }
    ctx.fillStyle = podium ? "rgba(6,18,32,0.94)" : "rgba(3,19,31,0.82)"; ctx.beginPath(); ctx.roundRect(60, y, W - 120, h, 12); ctx.fill();
    ctx.strokeStyle = podium ? medal[i] : "rgba(244,174,43,0.45)"; ctx.lineWidth = podium ? 3 : 1.5; ctx.stroke(); ctx.restore();
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    if (podium) { ctx.fillStyle = medal[i]; ctx.beginPath(); ctx.arc(110, y + h / 2, h * 0.36, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = INK; ctx.font = F(800, h * 0.5); ctx.fillText(String(i + 1), 110, y + h / 2 + 1); if (i === 0) { ctx.fillStyle = GOLD; ctx.font = `700 ${h * 0.36}px Inter, Arial, sans-serif`; ctx.fillText("♛", 110, y - 2); } }
    else { ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.font = F(800, h * 0.5); ctx.fillText(String(i + 1), 110, y + h / 2 + 1); }
    ctx.fillStyle = "rgba(255,255,255,0.15)"; ctx.fillRect(160, y + 8, 1, h - 16);
    await crest(ctx, { name: r.club?.name || r.name, short_name: r.club?.short_name, colors: r.club?.colors, crest_url: r.club?.crest_url }, 176, y + h / 2 - h * 0.34, h * 0.68);
    ctx.textAlign = "left"; ctx.fillStyle = WHITE; ctx.font = F(800, Math.min(34, h * 0.5)); ctx.fillText(fit(ctx, (r.club?.name || r.name).toUpperCase(), 360), 176 + h * 0.68 + 18, y + h / 2 + 1);
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(244,174,43,0.14)"; ctx.beginPath(); ctx.roundRect(608, y + 6, 64, h - 12, 8); ctx.fill(); ctx.strokeStyle = GOLD; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = GOLD; ctx.font = F(800, Math.min(38, h * 0.56)); ctx.fillText(String(r.PT), 640, y + h / 2 + 1);
    ctx.fillStyle = "rgba(255,255,255,0.92)"; ctx.font = F(600, Math.min(28, h * 0.42));
    [[r.PG, 720], [r.V, 786], [r.N, 848], [r.P, 910], [r.GF, 972], [r.GS, 1034]].forEach(([v, x]) => { ctx.fillText(String(v), x, y + h / 2 + 1); ctx.fillStyle = "rgba(255,255,255,0.1)"; ctx.fillRect(x - 31, y + 10, 1, h - 20); ctx.fillStyle = "rgba(255,255,255,0.92)"; });
  }
  ctx.textBaseline = "top";
  await drawPosterFooter(ctx, W, H, opts.sponsor, "SOLO RISULTATI UFFICIALI · FSL");
}

export async function renderScorers(ctx, W, H, d, opts) {
  await loadFonts(); await drawStadium(ctx, W, H);
  const scale = H < 1200 ? 0.5 : H > 1400 ? 0.9 : 0.66;
  const top = (await drawPosterHeader(ctx, W, { gold: (opts.headline || "Marcatori").toUpperCase(), white: "DELLA SETTIMANA", sub: d.competition, pill: `Giornata ${d.match_day}`, hand: ["Chi ha fatto", "la differenza"], y0: H > 1400 ? 60 : 30, scale })) + 20;
  const rows = d.rows.slice(0, H > 1400 ? 10 : H < 1200 ? 5 : 8);
  if (!rows.length) { ctx.fillStyle = SLATE; ctx.font = F(700, 40); ctx.textAlign = "center"; ctx.fillText("NESSUN GOL UFFICIALE NELLA GIORNATA", W / 2, H / 2); await drawPosterFooter(ctx, W, H, opts.sponsor); return; }
  await preload(rows.flatMap((r) => [r.photo_url, r.crest_url]));
  const fy = H - 130, rowH = Math.min(104, Math.floor((fy - top - 30) / rows.length));
  const medal = ["#F4AE2B", "#C9D3DE", "#C8811A"];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i], y = top + i * rowH, h = rowH - 10, podium = i < 3;
    ctx.save(); if (podium) { ctx.shadowColor = medal[i]; ctx.shadowBlur = 20; }
    ctx.fillStyle = podium ? "rgba(6,18,32,0.94)" : "rgba(3,19,31,0.82)"; ctx.beginPath(); ctx.roundRect(60, y, W - 120, h, 14); ctx.fill(); ctx.strokeStyle = podium ? medal[i] : "rgba(244,174,43,0.45)"; ctx.lineWidth = podium ? 3 : 1.5; ctx.stroke(); ctx.restore();
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = podium ? medal[i] : "rgba(255,255,255,0.85)"; ctx.font = F(800, h * 0.5); ctx.fillText(String(i + 1), 100, y + h / 2 + 1);
    const ps = h - 16, px = 140, py = y + 8; const img = await loadImg(r.photo_url);
    ctx.save(); ctx.beginPath(); ctx.arc(px + ps / 2, py + ps / 2, ps / 2, 0, Math.PI * 2); ctx.clip(); ctx.fillStyle = r.colors?.primary || "#0B57D9"; ctx.fillRect(px, py, ps, ps); if (img) ctx.drawImage(img, px, py, ps, ps); else { ctx.fillStyle = "#fff"; ctx.font = F(800, ps * 0.5); ctx.fillText(String(r.shirt_number ?? "?"), px + ps / 2, py + ps / 2 + 2); } ctx.restore();
    ctx.strokeStyle = podium ? medal[i] : "rgba(255,255,255,0.3)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px + ps / 2, py + ps / 2, ps / 2, 0, Math.PI * 2); ctx.stroke();
    const [first, last] = splitName(r.name); ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255,255,255,0.75)"; ctx.font = `600 ${Math.min(18, h * 0.22)}px Inter, Arial, sans-serif`; ctx.fillText(first.toUpperCase(), px + ps + 22, y + h * 0.3);
    ctx.fillStyle = WHITE; ctx.font = F(800, Math.min(40, h * 0.46)); ctx.fillText(fit(ctx, (last || first).toUpperCase(), 420), px + ps + 22, y + h * 0.62);
    const cx = W - 60 - 300; await crest(ctx, { name: r.club || r.team, colors: r.colors, crest_url: r.crest_url }, cx, y + h / 2 - 18, 36);
    ctx.fillStyle = "rgba(255,255,255,0.8)"; ctx.font = `600 ${Math.min(16, h * 0.2)}px Inter, Arial, sans-serif`; ctx.textAlign = "left"; ctx.fillText(fit(ctx, (r.club || r.team).toUpperCase(), 150), cx + 44, y + h / 2 + 1);
    ctx.fillStyle = "rgba(244,174,43,0.14)"; ctx.beginPath(); ctx.roundRect(W - 60 - 92, y + 8, 80, h - 16, 10); ctx.fill(); ctx.strokeStyle = GOLD; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.textAlign = "center"; ctx.fillStyle = GOLD; ctx.font = F(800, Math.min(48, h * 0.58)); ctx.fillText(String(r.goals), W - 60 - 52, y + h / 2 - 4);
    ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.font = "600 11px Inter, Arial, sans-serif"; ctx.fillText(r.goals === 1 ? "GOL" : "GOL", W - 60 - 52, y + h - 16);
  }
  ctx.textBaseline = "top"; await drawPosterFooter(ctx, W, H, opts.sponsor, "SOLO TABELLINI UFFICIALI · FSL");
}

export async function renderTop11Template(ctx, W, H, d, opts) {
  await renderTop11(ctx, W, H, d.doc, d.competition, { sponsor: opts.sponsor ? { name: opts.sponsor.name, logo: opts.sponsor.logo_url } : null });
}

export const TEMPLATES = [
  { key: "matchday", label: "Matchday", desc: "Le gare della giornata con orari e campi", needs: "day", render: renderMatchday },
  { key: "fulltime", label: "Full Time", desc: "Risultato finale, marcatori e MVP", needs: "match", render: renderFullTime },
  { key: "mvp", label: "MVP", desc: "Card speciale del migliore in campo", needs: "match", render: renderMvp },
  { key: "standings", label: "Classifica", desc: "Classifica ufficiale aggiornata", needs: "comp", render: renderStandings },
  { key: "scorers", label: "Marcatori", desc: "I marcatori della giornata in stile poster", needs: "day", render: renderScorers },
  { key: "top11", label: "Top 11", desc: "La formazione ideale in stile FIFA", needs: "top11", render: renderTop11Template },
];
