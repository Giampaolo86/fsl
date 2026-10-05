import { useEffect, useState } from "react";
import { AlertTriangle, Check, Coffee, GripVertical, Loader2, RotateCcw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, apiError } from "@/lib/api";
import { fmtDate } from "@/lib/format";

const KIND = {
  group: { cls: "bg-fsl-blue/25 border-fsl-blue/50", label: "Gironi" },
  final: { cls: "bg-fsl-gold/20 border-fsl-gold/60", label: "Fase finale" },
  extra: { cls: "bg-emerald-500/20 border-emerald-400/50", label: "Gare libere" },
};

const addMin = (t, m) => { const [h, mi] = t.split(":").map(Number); const x = h * 60 + mi + m; return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`; };
export const matchKey = (m) => `${m.kind}|${m.home}|${m.away}|${m.label}`;

function Cell({ m, day, time, field, onDrop, dragging, moved }) {
  const [over, setOver] = useState(false);
  const handlers = {
    onDragOver: (e) => { e.preventDefault(); setOver(true); },
    onDragLeave: () => setOver(false),
    onDrop: (e) => { e.preventDefault(); setOver(false); onDrop(e.dataTransfer.getData("text/plain"), day, time, field); },
  };
  if (!m) return <td className={`border border-white/5 p-1 align-top transition-colors ${over ? "bg-fsl-gold/15" : dragging ? "bg-white/[0.03]" : ""}`} {...handlers} data-testid={`plan-preview-cell-${day}-${time}-${field}`} />;
  const k = KIND[m.kind] || KIND.group;
  return (
    <td className={`border border-white/5 p-1 align-top transition-colors ${over ? "bg-fsl-gold/15" : ""}`} {...handlers} data-testid={`plan-preview-cell-${day}-${time}-${field}`}>
      <div draggable onDragStart={(e) => { e.dataTransfer.setData("text/plain", matchKey(m)); e.dataTransfer.effectAllowed = "move"; }} className={`group rounded-md border px-2 py-1.5 text-[11px] leading-tight cursor-grab active:cursor-grabbing flex items-start gap-1.5 ${k.cls} ${moved ? "ring-1 ring-fsl-gold" : ""}`} data-testid={`plan-preview-match-${matchKey(m)}`} title="Trascina per spostare (su una gara: scambio)">
        <GripVertical className="h-3.5 w-3.5 shrink-0 text-white/40 group-hover:text-fsl-gold mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold truncate">{m.home} <span className="text-fsl-gold">–</span> {m.away}</div>
          <div className="text-[10px] text-fsl-slate truncate">{m.group ? `${m.group} · ` : ""}{m.label}{moved && <span className="text-fsl-gold"> · spostata</span>}</div>
        </div>
      </div>
    </td>
  );
}

function DayGrid({ day, fields, matches, breaks, duration, onDrop, dragging, movedKeys }) {
  const byTime = {};
  matches.forEach((m) => { (byTime[m.time] ||= {})[m.field] = m; });
  const rows = Array.from(new Set([...Object.keys(byTime), ...breaks.map((b) => b.start_time)])).sort();
  const cols = Array.from(new Set([...fields, ...matches.map((m) => m.field)])).filter(Boolean);
  return (
    <div className="space-y-2" data-testid={`plan-preview-day-${day}`}>
      <h3 className="font-display font-extrabold uppercase text-sm text-fsl-gold">{fmtDate(day)} <span className="text-fsl-slate font-normal normal-case text-xs">· {matches.length} gare</span></h3>
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
                  {brk && !ms ? <td colSpan={cols.length} className="border border-white/5 px-2 py-1.5 text-fsl-warning bg-fsl-warning/10"><div className="inline-flex items-center gap-2"><Coffee className="h-3.5 w-3.5" /> {brk.label} · {brk.start_time}–{brk.end_time}</div></td> : cols.map((f) => <Cell key={f} m={ms?.[f]} day={day} time={t} field={f} onDrop={onDrop} dragging={dragging} moved={ms?.[f] && movedKeys.has(matchKey(ms[f]))} />)}
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
  const [original, setOriginal] = useState(null);
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!open) return;
    setData(null); setOriginal(null); setError(null);
    api.post(`/ai/tournaments/${tid}/calendar/preview`, { category, plan }).then((r) => { setData(r.data); setOriginal(r.data.matches); }).catch((e) => setError(apiError(e)));
  }, [open, tid, category, plan]);
  const movedKeys = new Set((data?.matches || []).filter((m) => { const o = original?.find((x) => matchKey(x) === matchKey(m)); return o && (o.date !== m.date || o.time !== m.time || o.field !== m.field); }).map(matchKey));
  const overrides = (data?.matches || []).filter((m) => movedKeys.has(matchKey(m))).map((m) => ({ kind: m.kind, home: m.home, away: m.away, label: m.label, date: m.date, time: m.time, field: m.field === "—" ? null : m.field }));
  const drop = (key, day, time, field) => {
    setDragging(false);
    setData((d) => {
      const src = d.matches.find((m) => matchKey(m) === key);
      if (!src || (src.date === day && src.time === time && src.field === field)) return d;
      const target = d.matches.find((m) => m.date === day && m.time === time && m.field === field);
      const matches = d.matches.map((m) => {
        if (m === src) return { ...m, date: day, time, field };
        if (target && m === target) return { ...m, date: src.date, time: src.time, field: src.field };
        return m;
      });
      return { ...d, matches: matches.sort((a, b) => `${a.date}${a.time}${a.field}`.localeCompare(`${b.date}${b.time}${b.field}`)) };
    });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto" data-testid="plan-preview-dialog" onDragEnter={() => setDragging(true)} onDragEnd={() => setDragging(false)}>
        <DialogHeader>
          <DialogTitle className="font-display uppercase">Anteprima del piano</DialogTitle>
          <DialogDescription>Così verranno create le gare, giorno per giorno e campo per campo. Trascina una gara su un altro orario o campo per spostarla (su una gara occupata: scambio). Nulla è scritto finché non premi «Applica»; dopo, ogni gara resta comunque modificabile a mano.</DialogDescription>
        </DialogHeader>
        {error && <div className="text-sm text-fsl-danger" data-testid="plan-preview-error">{error}</div>}
        {!data && !error && <div className="py-10 text-center text-fsl-slate"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>}
        {data && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3 text-xs" data-testid="plan-preview-summary">
              {Object.entries(KIND).map(([k, v]) => <span key={k} className="inline-flex items-center gap-1.5"><span className={`h-3 w-3 rounded border ${v.cls}`} />{v.label}: <b className="num">{data.counts[k]}</b></span>)}
              <span className="inline-flex items-center gap-1.5 text-fsl-warning"><Coffee className="h-3.5 w-3.5" /> Pause: <b className="num">{data.breaks.length}</b></span>
              {data.groups?.length > 0 && <span className="text-fsl-slate">· {data.groups.map((g) => `${g.series} (${g.teams.length})`).join(", ")}</span>}
              {overrides.length > 0 && <span className="ml-auto inline-flex items-center gap-2 text-fsl-gold" data-testid="plan-preview-moved"><b className="num">{overrides.length}</b> spostament{overrides.length === 1 ? "o" : "i"} <button type="button" className="btn-ghost h-7 px-2 text-[11px]" onClick={() => setData((d) => ({ ...d, matches: original }))} data-testid="plan-preview-reset"><RotateCcw className="h-3 w-3" /> Annulla</button></span>}
            </div>
            {data.warnings.length > 0 && <ul className="rounded-lg border border-fsl-warning/40 bg-fsl-warning/10 p-3 text-xs text-fsl-warning space-y-1" data-testid="plan-preview-warnings">{data.warnings.map((w) => <li key={w} className="flex gap-2"><AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {w}</li>)}</ul>}
            {data.days.length === 0 && <p className="text-sm text-fsl-slate">Il piano non crea gare.</p>}
            {data.days.map((d) => <DayGrid key={d} day={d} fields={data.fields} matches={data.matches.filter((m) => m.date === d)} breaks={data.breaks.filter((b) => b.date === d)} duration={data.duration} onDrop={drop} dragging={dragging} movedKeys={movedKeys} />)}
          </div>
        )}
        <DialogFooter>
          <button type="button" className="btn-ghost" onClick={() => onOpenChange(false)} data-testid="plan-preview-close">Chiudi</button>
          <button type="button" className="btn-gold" disabled={!data || applying} onClick={() => onApply(overrides)} data-testid="plan-preview-apply">{applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Applica il piano{overrides.length ? ` (+${overrides.length} spostamenti)` : ""}</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
