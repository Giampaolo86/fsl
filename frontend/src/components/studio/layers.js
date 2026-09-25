import { loadImg } from "@/components/fsl/FifaCard";

export const FONTS = { display: ['Barlow Condensed', '"Barlow Condensed", "Arial Narrow", sans-serif'], sans: ["Inter", "Inter, Arial, sans-serif"], hand: ["Manoscritto", "Caveat, cursive"] };
export const SWATCHES = [["Oro", "#F4AE2B"], ["Bianco", "#FFFFFF"], ["Navy", "#03131F"], ["Blu FSL", "#0B57D9"], ["Rosso", "#E5484D"], ["Verde", "#2ECC71"]];
export const BGS = [["none", "Nessuno"], ["pill", "Pillola"], ["band", "Fascia"]];
const uid = () => Math.random().toString(36).slice(2, 9);
const dark = (hex) => { const n = parseInt(hex.replace("#", ""), 16); if (Number.isNaN(n)) return false; const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; return (r * 299 + g * 587 + b * 114) / 1000 < 140; };

export const newText = (partial = {}) => ({ id: uid(), type: "text", name: "Testo", text: "Nuovo testo", x: 0.5, y: 0.5, size: 64, color: "#FFFFFF", font: "display", weight: 800, align: "center", upper: true, bg: "none", shadow: true, rotate: 0, visible: true, ...partial });
export const newImage = (src, ratio, partial = {}) => ({ id: uid(), type: "image", name: "Immagine", src, ratio: ratio || 1, x: 0.5, y: 0.5, w: 0.3, opacity: 1, round: 0, rotate: 0, visible: true, ...partial });

export const QUICK_TEXTS = [
  { label: "Titolo", make: () => newText({ name: "Titolo", text: "Il tuo titolo", size: 110, color: "#F4AE2B", y: 0.42 }) },
  { label: "Sottotitolo", make: () => newText({ name: "Sottotitolo", text: "Un sottotitolo che racconta", size: 44, font: "sans", weight: 600, upper: false, y: 0.5 }) },
  { label: "Manoscritto", make: () => newText({ name: "Claim", text: "Il futuro scende in campo", size: 72, font: "hand", weight: 700, upper: false, color: "#F4AE2B", rotate: -8, y: 0.3 }) },
  { label: "Hashtag", make: () => newText({ name: "Hashtag", text: "#FutureStarsLeague", size: 40, font: "sans", weight: 700, upper: false, bg: "pill", color: "#03131F", y: 0.9 }) },
  { label: "Call to action", make: () => newText({ name: "CTA", text: "Scopri di più su futurestarsleague.it", size: 34, font: "sans", weight: 600, upper: true, bg: "band", color: "#FFFFFF", y: 0.82 }) },
  { label: "Data / ora", make: () => newText({ name: "Data", text: new Date().toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "long" }), size: 38, font: "sans", weight: 700, bg: "pill", color: "#03131F", y: 0.12 }) },
];

const lines = (l) => (l.upper ? l.text.toUpperCase() : l.text).split("\n");
const fontOf = (l) => `${l.weight} ${l.size}px ${FONTS[l.font]?.[1] || FONTS.display[1]}`;

function textBox(ctx, W, H, l) {
  ctx.font = fontOf(l);
  const ls = lines(l), lh = l.size * 1.1, tw = Math.max(...ls.map((t) => ctx.measureText(t).width), 10), th = lh * ls.length;
  const padX = l.bg === "none" ? 0 : l.size * 0.5, padY = l.bg === "none" ? 0 : l.size * 0.22;
  const w = l.bg === "band" ? W : tw + padX * 2, h = th + padY * 2;
  return { x: W * l.x - w / 2, y: H * l.y - h / 2, w, h, tw, lh, ls, padX, padY };
}

function drawText(ctx, W, H, l) {
  const b = textBox(ctx, W, H, l);
  ctx.save(); ctx.translate(W * l.x, H * l.y); ctx.rotate((l.rotate || 0) * Math.PI / 180); ctx.translate(-W * l.x, -H * l.y);
  if (l.bg !== "none") { ctx.fillStyle = dark(l.color) ? "#F4AE2B" : "rgba(3,19,31,0.88)"; ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, l.bg === "pill" ? b.h / 2 : 0); ctx.fill(); }
  ctx.font = fontOf(l); ctx.fillStyle = l.color; ctx.textBaseline = "middle"; ctx.textAlign = l.align;
  if (l.shadow && l.bg === "none") { ctx.shadowColor = "rgba(0,0,0,0.75)"; ctx.shadowBlur = l.size * 0.25; ctx.shadowOffsetY = l.size * 0.05; }
  const tx = l.align === "left" ? b.x + b.padX + (b.w - b.padX * 2 - b.tw) / 2 : l.align === "right" ? b.x + b.w - b.padX - (b.w - b.padX * 2 - b.tw) / 2 : W * l.x;
  b.ls.forEach((t, i) => ctx.fillText(t, tx, b.y + b.padY + b.lh * i + b.lh / 2));
  ctx.restore();
  return { x: b.x, y: b.y, w: b.w, h: b.h };
}

async function drawImage(ctx, W, H, l) {
  const im = await loadImg(l.src);
  const w = W * l.w, h = w / (l.ratio || 1), x = W * l.x - w / 2, y = H * l.y - h / 2;
  if (im) { ctx.save(); ctx.globalAlpha = l.opacity ?? 1; ctx.translate(W * l.x, H * l.y); ctx.rotate((l.rotate || 0) * Math.PI / 180); ctx.translate(-W * l.x, -H * l.y); if (l.round) { ctx.beginPath(); ctx.roundRect(x, y, w, h, Math.min(w, h) * l.round / 2); ctx.clip(); } ctx.drawImage(im, x, y, w, h); ctx.restore(); }
  return { x, y, w, h };
}

export async function drawLayers(ctx, W, H, layers, options = {}) {
  if (options.dim) { ctx.fillStyle = `rgba(3,19,31,${options.dim / 100})`; ctx.fillRect(0, 0, W, H); }
  const boxes = {};
  for (const l of layers) { if (l.visible === false) continue; boxes[l.id] = l.type === "text" ? drawText(ctx, W, H, l) : await drawImage(ctx, W, H, l); }
  ctx.textBaseline = "top"; ctx.textAlign = "left"; ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  return boxes;
}

export function drawSelection(ctx, b) {
  if (!b) return;
  ctx.save(); ctx.strokeStyle = "#F4AE2B"; ctx.lineWidth = 3; ctx.setLineDash([12, 8]); ctx.strokeRect(b.x - 8, b.y - 8, b.w + 16, b.h + 16);
  ctx.setLineDash([]); ctx.fillStyle = "#F4AE2B"; [[b.x - 8, b.y - 8], [b.x + b.w + 8, b.y - 8], [b.x - 8, b.y + b.h + 8], [b.x + b.w + 8, b.y + b.h + 8]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill(); });
  ctx.restore();
}

export const hitLayer = (boxes, layers, x, y) => [...layers].reverse().find((l) => { const b = boxes[l.id]; return b && l.visible !== false && x >= b.x - 10 && x <= b.x + b.w + 10 && y >= b.y - 10 && y <= b.y + b.h + 10; });

export const readImageFile = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => { const im = new Image(); im.onload = () => res({ src: r.result, ratio: im.width / im.height }); im.onerror = rej; im.src = r.result; }; r.onerror = rej; r.readAsDataURL(file); });

const KEY = (tid) => `fsl-studio-presets:${tid}`;
export const loadPresets = (tid) => { try { return JSON.parse(localStorage.getItem(KEY(tid)) || "[]"); } catch { return []; } };
export const savePresets = (tid, list) => { try { localStorage.setItem(KEY(tid), JSON.stringify(list)); return true; } catch { return false; } };
