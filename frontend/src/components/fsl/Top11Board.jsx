import { useRef } from "react";
import { Download } from "lucide-react";
import { ClubCrest } from "@/components/fsl/ClubCrest";

const ROWS = { P: 4, D: 3, C: 2, A: 1 };
const GROUP_LABEL = { P: "POR", D: "DIF", C: "CEN", A: "ATT" };
const fmt = (v) => (v == null ? "—" : Number(v).toFixed(1).replace(".", ","));

function PlayerTile({ slot, onPick, editable }) {
  const p = slot.player;
  return (
    <button type="button" disabled={!editable} onClick={() => onPick?.(slot)} className={`group relative w-[92px] sm:w-[112px] rounded-xl border ${slot.off_role ? "border-fsl-warning/70" : "border-fsl-gold/50"} bg-ink-950/85 backdrop-blur px-2 pt-2 pb-1.5 text-center shadow-[0_8px_24px_-12px_rgba(0,0,0,0.8)] ${editable ? "hover:border-fsl-gold hover:-translate-y-0.5 transition-[transform,border-color]" : ""}`} data-testid={`top11-slot-${slot.slot}`}>
      <div className="mx-auto h-12 w-12 sm:h-14 sm:w-14 rounded-full overflow-hidden bg-navy-700 border-2 border-fsl-gold/60 flex items-center justify-center">{p?.photo_url ? <img src={p.photo_url} alt="" className="h-full w-full object-cover" /> : <span className="font-display font-extrabold text-xl text-fsl-white/80">{p ? (p.shirt_number ?? p.name[0]) : "?"}</span>}</div>
      <div className="mt-1 font-display font-bold uppercase text-[11px] sm:text-xs leading-tight truncate text-fsl-white">{p ? p.name : "Slot vuoto"}</div>
      <div className="text-[10px] text-fsl-slate truncate">{p?.team || slot.slot_label}</div>
      <div className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 h-5 text-[10px] font-bold num ${slot.off_role ? "bg-fsl-warning text-ink-950" : "bg-fsl-gold text-ink-950"}`}>{p ? `${(p.role || "").slice(0, 3).toUpperCase()} · ${fmt(p.fanta)}` : GROUP_LABEL[slot.slot_group]}</div>
    </button>
  );
}

export function Top11Board({ doc, competition, tournamentName, editable = false, onPick }) {
  const ref = useRef(null);
  const rows = [1, 2, 3, 4].map((r) => doc.lineup.filter((s) => ROWS[s.slot_group] === r));
  return (
    <div ref={ref} className="relative overflow-hidden rounded-2xl border border-white/15 bg-[#0B2A1F]" data-testid="top11-board">
      <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(255,255,255,0.035)_0_48px,transparent_48px_96px)]" />
      <div className="absolute inset-x-6 top-[38%] h-px bg-white/25" /><div className="absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2 h-28 w-28 rounded-full border border-white/25" />
      <div className="absolute inset-x-[22%] bottom-0 h-16 border border-b-0 border-white/25 rounded-t-md" />
      <div className="relative flex items-center justify-between gap-3 px-5 pt-4">
        <div><div className="font-sans text-[10px] font-semibold tracking-[0.28em] uppercase text-fsl-gold">FSL Top 11 · Giornata {doc.match_day}</div><div className="font-display font-extrabold uppercase text-xl sm:text-2xl leading-none text-fsl-white">{competition?.name || tournamentName}</div></div>
        <img src="/brand/logo.png" alt="FSL" className="h-10 w-10 object-contain" />
      </div>
      <div className="relative px-3 pb-4 pt-4 space-y-3 sm:space-y-5">
        {rows.map((row, i) => <div key={i} className="flex justify-center gap-2 sm:gap-4">{row.map((s) => <PlayerTile key={s.slot} slot={s} editable={editable} onPick={onPick} />)}</div>)}
      </div>
      <div className="relative flex items-center justify-between px-5 pb-3 text-[10px] uppercase tracking-wider text-fsl-white/70"><span>{doc.formation} · Fantavoto ufficiale FSL</span>{doc.sponsor && <span className="text-fsl-gold font-bold">Presented by {doc.sponsor}</span>}</div>
    </div>
  );
}

export async function downloadTop11(doc, competition, ratio = "4:5") {
  const W = 1080, H = ratio === "9:16" ? 1920 : ratio === "1:1" ? 1080 : 1350;
  const c = document.createElement("canvas"); c.width = W; c.height = H; const ctx = c.getContext("2d");
  ctx.fillStyle = "#0B2A1F"; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 3; ctx.strokeRect(60, 220, W - 120, H - 340);
  ctx.beginPath(); ctx.arc(W / 2, 220 + (H - 340) * 0.45, 110, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = "#F4AE2B"; ctx.font = "700 28px Inter, sans-serif"; ctx.fillText(`FSL TOP 11 · GIORNATA ${doc.match_day}`, 60, 110);
  ctx.fillStyle = "#fff"; ctx.font = "800 64px 'Barlow Condensed', sans-serif"; ctx.fillText((competition?.name || "").toUpperCase(), 60, 185);
  const rows = [1, 2, 3, 4].map((r) => doc.lineup.filter((s) => ROWS[s.slot_group] === r));
  const top = 300, bottom = H - 200, rowH = (bottom - top) / 4;
  const load = (src) => new Promise((res) => { if (!src) return res(null); const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
  for (let r = 0; r < 4; r++) {
    const row = rows[r]; const y = top + r * rowH + rowH / 2; const gap = W / (row.length + 1);
    for (let i = 0; i < row.length; i++) {
      const s = row[i]; const p = s.player; const x = gap * (i + 1);
      ctx.fillStyle = "rgba(3,19,31,0.9)"; ctx.beginPath(); ctx.roundRect(x - 95, y - 105, 190, 210, 18); ctx.fill();
      ctx.strokeStyle = s.off_role ? "#E0A106" : "#F4AE2B"; ctx.lineWidth = 3; ctx.stroke();
      const im = await load(p?.photo_url);
      ctx.save(); ctx.beginPath(); ctx.arc(x, y - 45, 46, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
      if (im) ctx.drawImage(im, x - 46, y - 91, 92, 92); else { ctx.fillStyle = "#123"; ctx.fillRect(x - 46, y - 91, 92, 92); ctx.fillStyle = "#fff"; ctx.font = "800 40px 'Barlow Condensed'"; ctx.textAlign = "center"; ctx.fillText(String(p?.shirt_number ?? "?"), x, y - 30); }
      ctx.restore(); ctx.textAlign = "center";
      ctx.fillStyle = "#fff"; ctx.font = "800 22px 'Barlow Condensed', sans-serif"; ctx.fillText((p ? p.name : "—").toUpperCase().slice(0, 18), x, y + 30);
      ctx.fillStyle = "#9FB3C8"; ctx.font = "500 16px Inter, sans-serif"; ctx.fillText((p?.team || s.slot_label).slice(0, 22), x, y + 54);
      ctx.fillStyle = "#F4AE2B"; ctx.font = "800 20px Inter, sans-serif"; ctx.fillText(p ? `${(p.role || "").slice(0, 3).toUpperCase()} · ${fmt(p.fanta)}` : GROUP_LABEL[s.slot_group], x, y + 88);
    }
  }
  ctx.textAlign = "left"; ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.font = "600 22px Inter, sans-serif"; ctx.fillText(`${doc.formation} · FANTAVOTO UFFICIALE FSL`, 60, H - 70);
  if (doc.sponsor) { ctx.textAlign = "right"; ctx.fillStyle = "#F4AE2B"; ctx.fillText(`PRESENTED BY ${doc.sponsor.toUpperCase()}`, W - 60, H - 70); }
  const logo = await load("/brand/logo.png"); if (logo) ctx.drawImage(logo, W - 180, 60, 120, 120);
  const a = document.createElement("a"); a.href = c.toDataURL("image/png"); a.download = `fsl-top11-g${doc.match_day}-${ratio.replace(":", "x")}.png`; a.click();
}

export function DownloadTop11({ doc, competition }) {
  return <div className="flex flex-wrap gap-2">{["4:5", "9:16", "1:1"].map((r) => <button key={r} type="button" className="btn-ghost h-9 px-3 text-xs" onClick={() => downloadTop11(doc, competition, r)} data-testid={`top11-download-${r.replace(":", "x")}`}><Download className="h-3.5 w-3.5" /> PNG {r}</button>)}</div>;
}

export { ClubCrest };
