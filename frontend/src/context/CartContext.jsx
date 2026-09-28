import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";

const CartCtx = createContext(null);
export const cartRef = { current: null };
const KEY = "fsl-cart-v1";
const load = () => { try { return JSON.parse(sessionStorage.getItem(KEY) || "[]"); } catch { return []; } };

// Carrello leggero: un ordine = contenuti dello stesso torneo. Il checkout crea una sola sessione Stripe con più righe.
export function CartProvider({ children }) {
  const [items, setItems] = useState(load);
  const [open, setOpen] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  useEffect(() => { sessionStorage.setItem(KEY, JSON.stringify(items)); }, [items]);

  const add = useCallback((item, { open: openAfter = true } = {}) => {
    setItems((cur) => {
      if (cur.some((x) => x.id === item.id)) { toast.message("Già nel carrello"); return cur; }
      if (cur.length && item.scope && cur[0].scope && cur[0].scope !== item.scope) { toast.message("Carrello svuotato: i contenuti erano di un altro torneo"); return [item]; }
      return [...cur, item];
    });
    if (openAfter) setOpen(true);
  }, []);
  const remove = useCallback((id) => setItems((cur) => cur.filter((x) => x.id !== id)), []);
  const clear = useCallback(() => setItems([]), []);
  const has = useCallback((id) => items.some((x) => x.id === id), [items]);
  const total = useMemo(() => items.reduce((s, x) => s + Number(x.price || 0), 0), [items]);

  const checkout = useCallback(async () => {
    if (!items.length) return;
    setRedirecting(true);
    try {
      const r = await api.post("/payments/checkout", { item_ids: items.map((x) => x.id), origin_url: window.location.origin });
      sessionStorage.setItem("fsl-cart-pending", JSON.stringify(items));
      setItems([]);
      window.location.href = r.data.checkout_url;
    } catch (e) { toast.error(apiError(e)); setRedirecting(false); }
  }, [items]);

  const value = useMemo(() => ({ items, add, remove, clear, has, total, open, setOpen, checkout, redirecting }), [items, add, remove, clear, has, total, open, checkout, redirecting]);
  cartRef.current = value;
  return <CartCtx.Provider value={value}>{children}</CartCtx.Provider>;
}

export const useCart = () => useContext(CartCtx);
