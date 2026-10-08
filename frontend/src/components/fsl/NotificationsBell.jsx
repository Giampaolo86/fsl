import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Award, Bell, CalendarDays, Camera, FileText, KeyRound, Shirt, Sparkles } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/format";

const ICONS = { badge: [Award, "text-fsl-gold"], match: [CalendarDays, "text-fsl-gold"], media: [Camera, "text-fsl-blue-light"], callup: [Shirt, "text-fsl-success"], top11: [Sparkles, "text-fsl-gold"], access: [KeyRound, "text-fsl-gold"], security: [KeyRound, "text-fsl-danger"] };

export function NotificationsBell({ fan = false, staff = false }) {
  const { user } = useAuth();
  const membership = user.memberships?.find((m) => m.role === "club_manager");
  const tid = membership?.tournament_id;
  const base = fan || staff ? "/me/notifications" : tid ? `/tournaments/${tid}/notifications` : null;
  const prefix = staff ? "staff" : fan ? "fan" : "club";
  const home = staff ? "/admin" : fan ? "/account" : "/societa";
  const [data, setData] = useState({ unread: 0, items: [] });
  const load = useCallback(() => { if (base) api.get(base).then((r) => setData(r.data)).catch(() => {}); }, [base]);
  useEffect(() => { load(); const id = setInterval(load, 60000); return () => clearInterval(id); }, [load]);
  const markAll = () => api.post(`${base}/read`).then(load).catch(() => {});
  return (
    <Popover onOpenChange={(o) => { if (!o && data.unread) markAll(); }}>
      <PopoverTrigger asChild>
        <button className="relative h-11 w-11 rounded-md border border-white/20 inline-flex items-center justify-center hover:border-fsl-gold/60" aria-label={`Notifiche (${data.unread} non lette)`} data-testid={`${prefix}-notifications-button`}>
          <Bell className="h-4 w-4" />
          {data.unread > 0 && <span className="absolute -top-1.5 -right-1.5 h-5 min-w-[20px] px-1 rounded-full bg-fsl-gold text-ink-950 text-[10px] font-bold num inline-flex items-center justify-center" data-testid={`${prefix}-notifications-unread`}>{data.unread}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0 bg-navy-800 border-white/20 text-fsl-white rounded-xl" data-testid={`${prefix}-notifications-panel`}>
        <div className="h-11 px-4 flex items-center justify-between border-b border-white/10"><span className="fsl-kicker">Notifiche</span>{data.unread > 0 && <button className="text-xs text-fsl-gold" onClick={markAll} data-testid="notifications-read-all">Segna tutte come lette</button>}</div>
        <div className="max-h-[420px] overflow-y-auto divide-y divide-white/[0.06]">
          {data.items.length === 0 && <p className="p-6 text-sm text-fsl-slate text-center" data-testid={`${prefix}-notifications-empty`}>{fan ? "Nessuna notifica. Segui squadre e giocatori per ricevere avvisi sulle prossime partite e sulle nuove foto/video." : "Nessuna notifica."}</p>}
          {data.items.map((n) => {
            const [Icon, tone] = ICONS[n.kind] || [FileText, "text-fsl-blue-light"];
            return (
              <Link key={n.id} to={n.link || home} className={`block px-4 py-3 hover:bg-white/[0.04] ${n.read ? "opacity-70" : ""}`} data-testid={`notification-${n.id}`}>
                <div className="flex items-start gap-2 text-sm"><Icon className={`h-4 w-4 shrink-0 mt-0.5 ${tone}`} /><div className="min-w-0"><div className="font-semibold leading-tight">{n.title}</div>{n.body && <div className="text-xs text-fsl-slate mt-0.5 line-clamp-2">{n.body}</div>}<div className="text-[10px] text-fsl-slate num mt-1">{fmtDate(n.created_at, { time: true })}</div></div>{!n.read && <span className="ml-auto h-2 w-2 rounded-full bg-fsl-gold shrink-0 mt-1.5" />}</div>
              </Link>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
