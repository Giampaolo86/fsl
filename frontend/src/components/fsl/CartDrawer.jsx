import { Loader2, Lock, ShoppingCart, Trash2, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useCart } from "@/context/CartContext";
import { mediaUrl } from "@/lib/upload";

const eur = (n) => `${Number(n).toFixed(2).replace(".", ",")} €`;
const KIND = { photo: "Foto della gara", video: "Video della gara", team_card: "Cartolina squadra", album: "Album stagione", player_card: "Card Player ID", player_card_special: "Card Speciale", push_pass: "Pass notifiche", custom: "Negozio FSL" };

export function CartDrawer() {
  const cart = useCart();
  if (!cart) return null;
  const { items, remove, total, open, setOpen, checkout, redirecting, clear } = cart;
  return (
    <>
      {items.length > 0 && !open && (
        <button className="fixed bottom-4 right-4 z-40 h-12 pl-4 pr-5 rounded-full bg-fsl-gold text-ink-950 font-display font-bold uppercase text-sm shadow-[0_10px_30px_rgba(0,0,0,.45)] inline-flex items-center gap-2 hover:brightness-110 transition" onClick={() => setOpen(true)} data-testid="cart-fab">
          <ShoppingCart className="h-5 w-5" /> {items.length} {items.length === 1 ? "contenuto" : "contenuti"} · <span className="num">{eur(total)}</span>
        </button>
      )}
      <Sheet open={open} onOpenChange={(o) => !redirecting && setOpen(o)}>
        <SheetContent side="right" className="bg-navy-800 border-white/15 text-fsl-white w-full sm:max-w-md flex flex-col" data-testid="cart-drawer">
          <SheetHeader><SheetTitle className="font-display uppercase text-2xl text-fsl-white flex items-center gap-2"><ShoppingCart className="h-6 w-6 text-fsl-gold" /> Il tuo carrello</SheetTitle></SheetHeader>
          {redirecting ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-4" data-testid="cart-redirecting">
              <Loader2 className="h-12 w-12 text-fsl-gold animate-spin" />
              <div className="font-display font-bold uppercase text-xl">Ordine ricevuto</div>
              <p className="text-sm text-fsl-slate max-w-xs">Ti stiamo portando al pagamento sicuro Stripe: bastano pochi secondi, non chiudere la pagina.</p>
              <div className="text-xs text-fsl-slate inline-flex items-center gap-1"><Lock className="h-3.5 w-3.5" /> Pagamento protetto · carta, Apple Pay, Google Pay</div>
            </div>
          ) : items.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center text-sm text-fsl-slate gap-2" data-testid="cart-empty"><ShoppingCart className="h-10 w-10 text-fsl-gold/60" />Il carrello è vuoto.<br />Scegli foto, video o prodotti FSL e li trovi qui.</div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto -mx-6 px-6 divide-y divide-white/[0.06]" data-testid="cart-items">
                {items.map((it) => (
                  <div key={it.id} className="py-3 flex items-center gap-3" data-testid={`cart-item-${it.id}`}>
                    <div className="h-14 w-14 shrink-0 rounded-lg bg-ink-950/60 border border-white/10 overflow-hidden flex items-center justify-center">{it.image_url ? <img src={mediaUrl(it.image_url)} alt="" className="h-full w-full object-cover" /> : <ShoppingCart className="h-5 w-5 text-fsl-gold/70" />}</div>
                    <div className="min-w-0 flex-1"><div className="text-[10px] uppercase tracking-wider text-fsl-slate">{KIND[it.kind] || it.kind}</div><div className="text-sm font-semibold truncate">{it.title}</div>{it.meta && <div className="text-xs text-fsl-slate truncate">{it.meta}</div>}</div>
                    <div className="num font-display font-bold">{eur(it.price)}</div>
                    <button className="text-fsl-slate hover:text-fsl-danger" onClick={() => remove(it.id)} title="Rimuovi" data-testid={`cart-remove-${it.id}`}><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
              <div className="border-t border-white/10 pt-4 space-y-3">
                <div className="flex items-center justify-between"><span className="text-sm text-fsl-slate">Totale · {items.length} {items.length === 1 ? "contenuto" : "contenuti"} · IVA inclusa</span><span className="font-display font-extrabold text-2xl num" data-testid="cart-total">{eur(total)}</span></div>
                <button className="btn-gold h-12 w-full text-base" onClick={checkout} data-testid="cart-checkout"><Lock className="h-4 w-4" /> Paga {eur(total)} in sicurezza</button>
                <div className="flex justify-between text-xs">
                  <button className="text-fsl-gold hover:underline" onClick={() => setOpen(false)} data-testid="cart-continue">← Continua a scegliere</button>
                  <button className="text-fsl-slate hover:text-fsl-danger inline-flex items-center gap-1" onClick={clear} data-testid="cart-clear"><X className="h-3 w-3" /> Svuota</button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
