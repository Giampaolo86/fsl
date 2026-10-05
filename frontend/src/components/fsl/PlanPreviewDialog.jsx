import { useEffect, useState } from "react";
import { AlertTriangle, Check, Coffee, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, apiError } from "@/lib/api";
import { fmtDate } from "@/lib/format";

const KIND = {
  group: { cls: "bg-fsl-blue/25 border-fsl-blue/50", label: "Gironi" },
  final: { cls: "bg-fsl-gold/20 border-fsl-gold/60", label: "Fase finale" },
  extra: { cls: "bg-emerald-500/20 border-emerald-400/50", label: "Gare libere" },
};

const addMin = (t, m) => { const [h, mi] = t.split(":").map(Number); const x = h * 60 + mi + m; return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`; };

function Cell({ m }) {
  if (!m) return <td className="border border-white/5 p-1 align-top" />;
  const k = KIND[m.kind] || KIND.group;
  return (
    <td className="border border-white/5 p-1 align-top" data-testid={`plan-preview-cell-${m.date}-${m.time}-${m.field}`}>
      <div className={`rounded-md border px-2 py-1.5 text-[11px] leading-tight ${k.cls}`}>
        <div className="font-semibold truncate">{m.home} <span className="text-fsl-gold">–</span> {m.away}</div>
        <div className="text-[10px] text-fsl-slate truncate">{m.group ? `${m.group} · ` : ""}{m.label}</div>
      </div>
    </td>
  );
}

function DayGrid({ day, fields, matches, breaks, duration }) {
  const byTime = {};
  matches.forEach((m) => { (byTime[m.time] ||= {})[m.field] = m; });
  const rows = Array.from(new Set([...Object.keys(byTime), ...breaks.map((b) => b.start_time)])).sort();
  const cols = Array.from(new Set([...fields, ...matches.map((m) => m.field)])).filter(Boolean);
  return (
    <div className="space-y-2" data-testid={`plan-preview-day-${day}`}>
      <h3 className="font-display font-extrabold uppercase text-sm text-fsl-gold">{fmtDate(day, { weekday: true })} <span className="text-fsl-slate font-normal normal-case text-xs">· {matches.length} gare</span></h3>
      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full text-xs">
          <thead><tr className="bg-navy-700/60"><th className="text-left px-2 py-1.5 w-16 text-fsl-slate font-semibold">Ora</th>{cols.map((f) => <th key={f} className="text-left px-2 py-1.5 text-fsl-slate font-semibold">{f}</th>)}</tr></thead>
          <tbody>
            {rows.map((t) => {
              const brk = breaks.find((b) => b.start_time === t);
              const ms = byTime[t];
              return (
                <tr key={t}>
                  <td className="border border-white/5 px-2 py-1 num font-bold align-top whitespace-nowrap">{t}{ms && <div className="text-[10px] text-fsl-slate font-normal">–{addMin(t, duration)}</div>}</td>
                  {brk && !ms ? <td colSpan={cols.length} className="border border-white/5 px-2 py-1.5 text-fsl-warning bg-fsl-warning/10"><div className="inline-flex items-center gap-2"><Coffee className="h-3.5 w-3.5" /> {brk.label} · {brk.start_time}–{brk.end_time}</div></td> : cols.map((f) => <Cell key={f} m={ms?.[f]} />)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PlanPreviewDialog({ open, onOpenChange, tid, category, plan, onApply, applying }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!open) return;
    setData(null); setError(null);
    api.post(`/ai/tournaments/${tid}/calendar/preview`, { category, plan }).then((r) => setData(r.data)).catch((e) => setError(apiError(e)));
  }, [open, tid, category, plan]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto" data-testid="plan-preview-dialog">
        <DialogHeader>
          <DialogTitle className="font-display uppercase">Anteprima del piano</DialogTitle>
          <DialogDescription>Così verranno create le gare, giorno per giorno e campo per campo. Nulla è ancora stato scritto: dopo «Applica» ogni gara resta modificabile a mano.</DialogDescription>
        </DialogHeader>
        {error && <div className="text-sm text-fsl-danger" data-testid="plan-preview-error">{error}</div>}
        {!data && !error && <div className="py-10 text-center text-fsl-slate"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>}
        {data && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3 text-xs" data-testid="plan-preview-summary">
              {Object.entries(KIND).map(([k, v]) => <span key={k} className="inline-flex items-center gap-1.5"><span className={`h-3 w-3 rounded border ${v.cls}`} />{v.label}: <b className="num">{data.counts[k]}</b></span>)}
              <span className="inline-flex items-center gap-1.5 text-fsl-warning"><Coffee className="h-3.5 w-3.5" /> Pause: <b className="num">{data.breaks.length}</b></span>
              {data.groups?.length > 0 && <span className="text-fsl-slate">· {data.groups.map((g) => `${g.series} (${g.teams.length})`).join(", ")}</span>}
            </div>
            {data.warnings.length > 0 && <ul className="rounded-lg border border-fsl-warning/40 bg-fsl-warning/10 p-3 text-xs text-fsl-warning space-y-1" data-testid="plan-preview-warnings">{data.warnings.map((w) => <li key={w} className="flex gap-2"><AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {w}</li>)}</ul>}
            {data.days.length === 0 && <p className="text-sm text-fsl-slate">Il piano non crea gare.</p>}
            {data.days.map((d) => <DayGrid key={d} day={d} fields={data.fields} matches={data.matches.filter((m) => m.date === d)} breaks={data.breaks.filter((b) => b.date === d)} duration={data.duration} />)}
          </div>
        )}
        <DialogFooter>
          <button type="button" className="btn-ghost" onClick={() => onOpenChange(false)} data-testid="plan-preview-close">Chiudi</button>
          <button type="button" className="btn-gold" disabled={!data || applying} onClick={onApply} data-testid="plan-preview-apply">{applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Applica il piano</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
