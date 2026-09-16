import { Heart } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { api, apiError } from "@/lib/api";

export function FavButton({ kind, id, label, className = "", small = false }) {
  const { user, updateUser } = useAuth();
  if (!id) return null;
  const fav = user?.favorites || { tournaments: [], teams: [], players: [] };
  const on = (fav[kind] || []).includes(id);
  if (!user) return <Link to="/registrati" className={`inline-flex items-center gap-1 text-xs text-fsl-slate hover:text-fsl-gold ${className}`} title="Registrati per salvare i preferiti" data-testid={`fav-${kind}-${id}`}><Heart className={small ? "h-3.5 w-3.5" : "h-4 w-4"} />{!small && (label || "Preferito")}</Link>;
  if (user.role !== "fan") return null;
  const toggle = async (e) => {
    e.preventDefault(); e.stopPropagation();
    const next = { ...fav, [kind]: on ? fav[kind].filter((x) => x !== id) : [...(fav[kind] || []), id] };
    try { const r = await api.put("/me/favorites", next); updateUser({ favorites: r.data }); toast.success(on ? "Rimosso dai preferiti" : "Aggiunto ai preferiti"); } catch (err) { toast.error(apiError(err)); }
  };
  return <button type="button" onClick={toggle} aria-pressed={on} className={`inline-flex items-center gap-1 rounded-full border ${on ? "border-fsl-gold bg-fsl-gold/15 text-fsl-gold" : "border-white/20 text-fsl-slate hover:text-fsl-gold"} ${small ? "h-7 px-2 text-[11px]" : "h-9 px-3 text-xs"} font-semibold ${className}`} data-testid={`fav-${kind}-${id}`}><Heart className={`${small ? "h-3.5 w-3.5" : "h-4 w-4"} ${on ? "fill-current" : ""}`} />{!small && (on ? "Nei preferiti" : label || "Preferito")}</button>;
}
