import { useEffect, useState } from "react";
import { Download, ShoppingBag, Ticket, Wallet } from "lucide-react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { mediaUrl } from "@/lib/upload";

const eur = (n) => `${Number(n).toFixed(2).replace(".", ",")} €`;
const ICON = { file: Download, voucher: Ticket, payment: Wallet };

export async function buyItem(itemId, setBusy) {
  setBusy?.(itemId);
  try { const r = await api.post("/payments/checkout", { item_id: itemId, origin_url: window.location.origin }); window.location.href = r.data.checkout_url; } catch (e) { toast.error(apiError(e)); setBusy?.(null); }
}

export function ShopCard({ p, busy, onBuy, meta }) {
  const Icon = ICON[p.delivery] || ShoppingBag;
  return (
    <div className="rounded-2xl border border-fsl-gold/30 bg-navy-800/80 p-4 flex gap-4 hover:border-fsl-gold transition-colors" data-testid={`shop-item-${p.id}`}>
      <div className="h-20 w-20 shrink-0 rounded-xl bg-ink-950/60 border border-white/10 overflow-hidden flex items-center justify-center">{p.image_url ? <img src={mediaUrl(p.image_url)} alt="" className="h-full w-full object-cover" loading="lazy" /> : <Icon className="h-7 w-7 text-fsl-gold" />}</div>
      <div className="min-w-0 flex-1 flex flex-col">
        {meta && <div className="fsl-kicker text-[10px]">{meta}</div>}
        <div className="font-display font-bold uppercase leading-tight">{p.title}</div>
        {p.description && <p className="text-xs text-fsl-slate mt-1 line-clamp-2">{p.description}</p>}
        <div className="mt-auto pt-2 flex items-center gap-3">
          <span className="font-display font-extrabold text-2xl text-fsl-gold num">{eur(p.price)}</span>
          {p.left != null && <span className="text-[11px] text-fsl-slate">{p.left} disponibili</span>}
          <button className="btn-gold h-9 ml-auto" disabled={busy === p.id || !p.available} onClick={() => onBuy(p.id)} data-testid={`shop-buy-${p.id}`}>{busy === p.id ? "Reindirizzamento…" : p.available ? "Acquista" : "Esaurito"}</button>
        </div>
      </div>
    </div>
  );
}

// Prodotti personalizzati del Negozio FSL per una posizione (home torneo, società, giocatore).
export function ShopStrip({ slug, placement, clubId, title = "Negozio FSL", className = "" }) {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(null);
  useEffect(() => { if (!slug) return; api.get(`/public/tournaments/${slug}/shop`, { params: { placement, club_id: clubId || undefined } }).then((r) => setItems(r.data)).catch(() => setItems([])); }, [slug, placement, clubId]);
  if (items.length === 0) return null;
  return (
    <section className={className} data-testid={`shop-strip-${placement}`}>
      <div className="flex items-center gap-2 mb-3"><ShoppingBag className="h-5 w-5 text-fsl-gold" /><h2 className="fsl-section-title">{title}</h2></div>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{items.map((p) => <ShopCard key={p.id} p={p} busy={busy} onBuy={(id) => buyItem(id, setBusy)} />)}</div>
    </section>
  );
}

export function FanShop() {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(null);
  useEffect(() => { api.get("/public/shop/fan-area").then((r) => setItems(r.data)).catch(() => setItems([])); }, []);
  if (items.length === 0) return null;
  return (
    <section data-testid="fan-shop">
      <h2 className="fsl-section-title mb-3 flex items-center gap-2"><ShoppingBag className="h-5 w-5 text-fsl-gold" /> Negozio FSL</h2>
      <div className="grid md:grid-cols-2 gap-4">{items.map((p) => <ShopCard key={p.id} p={p} meta={p.tournament_name} busy={busy} onBuy={(id) => buyItem(id, setBusy)} />)}</div>
    </section>
  );
}
