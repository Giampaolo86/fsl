import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Award, Bell, FileText } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/format";

export function NotificationsBell() {
  const { user } = useAuth();
  const membership = user.memberships?.find((m) => m.role === "club_manager");
  const tid = membership?.tournament_id;
  const [data, setData] = useState({ unread: 0, items: [] });
  const load = useCallback(() => { if (tid) api.get(`/tournaments/${tid}/notifications`).then((r) => setData(r.data)).catch(() => {}); }, [tid]);
  useEffect(() => { load(); const id = setInterval(load, 60000); return () => clearInterval(id); }, [load]);
  const markAll = () => api.post(`/tournaments/${tid}/notifications/read`).then(load).catch(() => {});
  return (
    <Popover onOpenChange={(o) => { if (!o && data.unread) markAll(); }}>
      <PopoverTrigger asChild>
        <button className="relative h-11 w-11 rounded-md border border-white/20 inline-flex items-center justify-center hover:border-fsl-gold/60" aria-label={`Notifiche (${data.unread} non lette)`} data-testid="club-notifications-button">
          <Bell className="h-4 w-4" />
          {data.unread > 0 && <span className="absolute -top-1.5 -right-1.5 h-5 min-w-[20px] px-1 rounded-full bg-fsl-gold text-ink-950 text-[10px] font-bold num inline-flex items-center justify-center" data-testid="notifications-unread">{data.unread}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0 bg-navy-800 border-white/20 text-fsl-white rounded-xl" data-testid="notifications-panel">
        <div className="h-11 px-4 flex items-center justify-between border-b border-white/10"><span className="fsl-kicker">Notifiche</span>{data.unread > 0 && <button className="text-xs text-fsl-gold" onClick={markAll} data-testid="notifications-read-all">Segna tutte come lette</button>}</div>
        <div className="max-h-[420px] overflow-y-auto divide-y divide-white/[0.06]">
          {data.items.length === 0 && <p className="p-6 text-sm text-fsl-slate text-center">Nessuna notifica.</p>}
          {data.items.map((n) => (
            <Link key={n.id} to={n.link || "/societa"} className={`block px-4 py-3 hover:bg-white/[0.04] ${n.read ? "opacity-70" : ""}`} data-testid={`notification-${n.id}`}>
              <div className="flex items-start gap-2 text-sm">{n.kind === "badge" ? <Award className="h-4 w-4 text-fsl-gold shrink-0 mt-0.5" /> : <FileText className="h-4 w-4 text-fsl-blue-light shrink-0 mt-0.5" />}<div className="min-w-0"><div className="font-semibold leading-tight">{n.title}</div>{n.body && <div className="text-xs text-fsl-slate mt-0.5 line-clamp-2">{n.body}</div>}<div className="text-[10px] text-fsl-slate num mt-1">{fmtDate(n.created_at, { time: true })}</div></div>{!n.read && <span className="ml-auto h-2 w-2 rounded-full bg-fsl-gold shrink-0 mt-1.5" />}</div>
            </Link>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
