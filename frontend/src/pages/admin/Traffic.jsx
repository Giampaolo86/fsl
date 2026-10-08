import { useCallback, useEffect, useState } from "react";
import { Activity, Clock, Eye, Globe, Monitor, RefreshCw, Smartphone, Trophy, Users } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { KpiTile, PageHeader, SectionTitle } from "@/components/fsl/Primitives";
import { ErrorState, LoadingState } from "@/components/fsl/States";
import { api, apiError } from "@/lib/api";

const GOLD = "#F4AE2B";
const tip = { contentStyle: { background: "#0B1220", border: "1px solid rgba(255,255,255,.15)", borderRadius: 8, fontSize: 12 }, labelStyle: { color: "#9FB0C8" }, itemStyle: { color: "#fff" } };

function Bars({ rows, label, icon: Icon, testId, total }) {
  const max = Math.max(1, ...rows.map((r) => r.views));
  return (
    <div className="fsl-card p-5" data-testid={testId}>
      <SectionTitle>{label}</SectionTitle>
      {rows.length === 0 ? <p className="text-sm text-fsl-slate">Ancora nessun dato.</p> : (
        <div className="space-y-2">{rows.map((r) => (
          <div key={r.key} className="text-sm" data-testid={`${testId}-${r.key}`}>
            <div className="flex items-center gap-2"><span className="truncate flex-1">{Icon && <Icon className="inline h-3.5 w-3.5 mr-1 text-fsl-gold" />}{r.label || r.key}</span><span className="num text-fsl-slate text-xs">{r.visitors} visitatori</span><span className="num font-bold w-14 text-right">{r.views}</span>{total > 0 && <span className="num text-xs text-fsl-slate w-10 text-right">{Math.round((r.views / total) * 100)}%</span>}</div>
            <div className="h-1.5 rounded bg-white/5 mt-1"><div className="h-full rounded bg-fsl-gold" style={{ width: `${(r.views / max) * 100}%` }} /></div>
          </div>
        ))}</div>
      )}
    </div>
  );
}

export default function Traffic() {
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => api.get("/analytics/summary").then((r) => setD(r.data)).catch((e) => setError(apiError(e))), []);
  useEffect(() => { load(); const id = setInterval(load, 60000); return () => clearInterval(id); }, [load]);
  if (error) return <ErrorState message={error} />;
  if (!d) return <LoadingState />;
  const devTotal = d.devices.reduce((a, r) => a + r.views, 0);
  const mobile = d.devices.find((r) => r.key === "mobile")?.views || 0;
  return (
    <div className="space-y-8" data-testid="traffic-page">
      <PageHeader kicker="Riservato al Super Admin" title="Traffico" subtitle="Visite e visitatori del portale pubblico. Dati anonimi (nessun cookie di tracciamento, nessun dato personale), conservati nel tuo database: i dettagli oltre 90 giorni vengono riassunti in totali giornalieri." actions={<button className="btn-ghost h-10" onClick={load} data-testid="traffic-refresh"><RefreshCw className="h-4 w-4" /> Aggiorna</button>} />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiTile icon={Activity} value={d.online} label="Online adesso" hint="ultimi 5 minuti" gold testId="traffic-online" />
        <KpiTile icon={Users} value={d.today.visitors} label="Visitatori oggi" hint={`${d.today.views} pagine viste`} testId="traffic-today" />
        <KpiTile icon={Users} value={d.week.visitors} label="Visitatori 7 giorni" hint={`${d.week.views} pagine viste`} testId="traffic-week" />
        <KpiTile icon={Users} value={d.month.visitors} label="Visitatori 30 giorni" hint={`${d.month.views} pagine viste`} testId="traffic-month" />
        <KpiTile icon={Eye} value={d.all_time_views} label="Pagine viste totali" hint={devTotal ? `${Math.round((mobile / devTotal) * 100)}% da mobile` : "—"} testId="traffic-all" />
      </div>
      <div className="grid lg:grid-cols-[1.6fr_1fr] gap-4">
        <div className="fsl-card p-5" data-testid="traffic-daily">
          <SectionTitle>Ultime 4 settimane</SectionTitle>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={d.daily.map((r) => ({ ...r, label: r.day.slice(8) + "/" + r.day.slice(5, 7) }))}>
                <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={GOLD} stopOpacity={0.6} /><stop offset="100%" stopColor={GOLD} stopOpacity={0} /></linearGradient></defs>
                <XAxis dataKey="label" tick={{ fill: "#9FB0C8", fontSize: 10 }} axisLine={false} tickLine={false} interval={3} />
                <YAxis tick={{ fill: "#9FB0C8", fontSize: 10 }} axisLine={false} tickLine={false} width={28} allowDecimals={false} />
                <Tooltip {...tip} />
                <Area type="monotone" dataKey="views" name="Pagine viste" stroke={GOLD} fill="url(#g)" strokeWidth={2} />
                <Area type="monotone" dataKey="visitors" name="Visitatori" stroke="#fff" fill="transparent" strokeWidth={1.5} strokeDasharray="4 3" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="fsl-card p-5" data-testid="traffic-hourly">
          <SectionTitle>Orari di punta (30 giorni)</SectionTitle>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.hourly}>
                <XAxis dataKey="hour" tick={{ fill: "#9FB0C8", fontSize: 10 }} axisLine={false} tickLine={false} interval={2} tickFormatter={(h) => `${h}h`} />
                <YAxis hide allowDecimals={false} />
                <Tooltip {...tip} labelFormatter={(h) => `ore ${h}:00`} />
                <Bar dataKey="views" name="Pagine viste" fill={GOLD} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <Bars rows={d.pages} label="Pagine più viste (30 giorni)" testId="traffic-pages" total={d.month.views} />
        <div className="space-y-4">
          <Bars rows={d.sources} label="Provenienza (30 giorni)" icon={Globe} testId="traffic-sources" total={d.sources.reduce((a, r) => a + r.views, 0)} />
          <Bars rows={d.tournaments} label="Tornei" icon={Trophy} testId="traffic-tournaments" total={d.tournaments.reduce((a, r) => a + r.views, 0)} />
          <Bars rows={d.devices.map((r) => ({ ...r, label: r.key === "mobile" ? "Mobile" : "Desktop" }))} label="Dispositivi" icon={mobile > devTotal / 2 ? Smartphone : Monitor} testId="traffic-devices" total={devTotal} />
        </div>
      </div>
      <p className="text-xs text-fsl-slate flex items-center gap-1" data-testid="traffic-generated"><Clock className="h-3 w-3" /> Aggiornato {new Date(d.generated_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })} · si aggiorna da solo ogni minuto</p>
    </div>
  );
}
