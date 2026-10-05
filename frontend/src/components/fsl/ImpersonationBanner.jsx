import { useEffect, useState } from "react";
import { Eye, LogOut } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { ROLE_LABELS } from "@/lib/format";

const remaining = (iso) => {
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms) || ms <= 0) return "scaduta";
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${String(s).padStart(2, "0")}`;
};

export function ImpersonationBanner() {
  const { user, logout } = useAuth();
  const imp = user?.impersonation;
  const [, tick] = useState(0);
  useEffect(() => {
    if (!imp) return undefined;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [imp]);
  if (!imp) return null;
  return (
    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-[200] max-w-[96vw] rounded-full border border-fsl-gold/70 bg-ink-950/95 backdrop-blur px-4 py-2 flex items-center gap-3 shadow-2xl text-sm text-fsl-white" data-testid="impersonation-banner" role="status">
      <Eye className="h-4 w-4 text-fsl-gold shrink-0" aria-hidden="true" />
      <span className="truncate">Stai vedendo come <strong className="text-fsl-gold">{user.full_name}</strong> <span className="text-fsl-slate">· {ROLE_LABELS[user.role] || user.role} · {remaining(imp.expires_at)}</span></span>
      <button type="button" onClick={logout} className="btn-gold h-8 px-3 text-xs shrink-0" data-testid="impersonation-exit-button"><LogOut className="h-3.5 w-3.5" aria-hidden="true" /> Torna alla Control Room</button>
    </div>
  );
}
