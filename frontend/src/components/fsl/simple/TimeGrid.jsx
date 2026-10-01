import { useMemo, useState } from "react";
import { GripVertical, Pencil } from "lucide-react";
import { fmtDate } from "@/lib/format";

const WEEKDAYS = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
const toMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const toHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

function slotTimes(sessions, day, step, duration) {
  const out = new Set();
  sessions.filter((s) => s.date === day).forEach((s) => { for (let t = toMin(s.start_time); t + duration <= toMin(s.end_time); t += step) out.add(toHHMM(t)); });
  return out;
}

export function TimeGrid({ board, canWrite, onMove, onEdit }) {
  const [over, setOver] = useState(null);
  const [extra, setExtra] = useState({});
  const [newTime, setNewTime] = useState({});
  const c = board.calendar;
  const step = (c.match_minutes || 25) + (c.buffer_minutes ?? 10);
  const all = useMemo(() => [...board.matches, ...board.finals], [board]);
  const fields = board.fields.slice(0, Math.max(c.fields_count || 1, 1));
  const days = useMemo(() => [...new Set([...(c.sessions || []).map((s) => s.date), ...all.map((m) => m.kickoff_at.slice(0, 10))])].sort(), [c.sessions, all]);
  const byKey = useMemo(() => Object.fromEntries(all.map((m) => [`${m.kickoff_at}|${m.field_id}`, m])), [all]);

  const drop = (e, kickoff, fieldId) => {
    e.preventDefault(); setOver(null);
    const id = e.dataTransfer.getData("text/fsl-match");
    const src = all.find((m) => m.id === id);
    if (!src || (src.kickoff_at === kickoff && src.field_id === fieldId)) return;
    const target = byKey[`${kickoff}|${fieldId}`];
    if (target?.played) return;
    onMove(id, kickoff, fieldId);
  };

  if (!fields.length) return <p className="text-sm text-fsl-slate">Nessun campo configurato.</p>;
  return (
    <div className="space-y-6" data-testid="time-grid">
      {days.map((day) => {
        const times = slotTimes(c.sessions || [], day, step, c.match_minutes || 25);
        all.filter((m) => m.kickoff_at.startsWith(day)).forEach((m) => times.add(m.kickoff_at.slice(11, 16)));
        (extra[day] || []).forEach((t) => times.add(t));
        const rows = [...times].sort();
        return (
          <div key={day} className="rounded-lg border border-white/10 overflow-hidden" data-testid={`grid-day-${day}`}>
            <div className="px-4 h-11 flex items-center gap-3 bg-ink-950/60 border-b border-white/10"><span className="font-display font-extrabold uppercase text-fsl-gold">{WEEKDAYS[new Date(day + "T12:00").getDay()]} {fmtDate(day)}</span><span className="text-xs text-fsl-slate">{all.filter((m) => m.kickoff_at.startsWith(day)).length} partite</span>
              {canWrite && <form className="ml-auto flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); const t = newTime[day]; if (t) { setExtra({ ...extra, [day]: [...(extra[day] || []), t] }); setNewTime({ ...newTime, [day]: "" }); } }} data-testid={`grid-add-row-${day}`}><input type="time" className="fsl-input h-8 w-28 text-xs py-0" value={newTime[day] || ""} onChange={(e) => setNewTime({ ...newTime, [day]: e.target.value })} aria-label="Nuovo orario" data-testid={`grid-add-time-${day}`} /><button type="submit" className="btn-ghost h-8 px-2 text-xs" data-testid={`grid-add-time-button-${day}`}>+ Orario</button></form>}</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm table-fixed">
                <thead className="text-[11px] uppercase tracking-wider text-fsl-slate"><tr><th className="w-24 text-left px-3 py-2">Ora</th>{fields.map((f) => <th key={f.id} className="text-left px-2 py-2">{f.name}</th>)}</tr></thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {rows.map((t) => {
                    const kickoff = `${day}T${t}`;
                    return (
                      <tr key={t}>
                        <td className="px-3 py-1.5 num font-semibold text-fsl-white/90 align-top">{t}<span className="block text-[10px] text-fsl-slate font-normal">– {toHHMM(toMin(t) + (c.match_minutes || 25))}</span></td>
                        {fields.map((f) => {
                          const m = byKey[`${kickoff}|${f.id}`];
                          const key = `${kickoff}|${f.id}`;
                          const isOver = over === key;
                          return (
                            <td key={f.id} className="px-1.5 py-1.5 align-top" onDragOver={(e) => { if (canWrite && !m?.played) { e.preventDefault(); setOver(key); } }} onDragLeave={() => setOver((o) => (o === key ? null : o))} onDrop={(e) => drop(e, kickoff, f.id)} data-testid={`grid-cell-${kickoff}-${f.id}`}>
                              {m ? (
                                <div draggable={canWrite && !m.played} onDragStart={(e) => { e.dataTransfer.setData("text/fsl-match", m.id); e.dataTransfer.effectAllowed = "move"; }} className={`group rounded-md border px-2 py-1.5 flex items-center gap-2 ${m.stage === "finals" ? "border-fsl-gold/60 bg-fsl-gold/10" : "border-white/15 bg-navy-800/80"} ${isOver ? "ring-2 ring-fsl-gold" : ""} ${canWrite && !m.played ? "cursor-grab active:cursor-grabbing" : ""}`} data-testid={`grid-match-${m.id}`}>
                                  {canWrite && !m.played && <GripVertical className="h-3.5 w-3.5 text-fsl-slate/60 shrink-0" />}
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm"><span className="font-semibold">{m.home}</span> <span className="text-fsl-slate">vs</span> <span className="font-semibold">{m.away}</span></div>
                                    <div className="text-[10px] uppercase tracking-wider text-fsl-gold/90 truncate">{m.stage === "finals" ? m.round_name : m.series}{m.played ? ` · ${m.score?.home}-${m.score?.away}` : ""}</div>
                                  </div>
                                  {canWrite && !m.played && <button type="button" onClick={() => onEdit(m)} className="opacity-0 group-hover:opacity-100 text-fsl-slate hover:text-fsl-gold" aria-label="Modifica" data-testid={`grid-edit-${m.id}`}><Pencil className="h-3.5 w-3.5" /></button>}
                                </div>
                              ) : (
                                <div className={`h-[46px] rounded-md border border-dashed ${isOver ? "border-fsl-gold bg-fsl-gold/10" : "border-white/10"} flex items-center justify-center text-[10px] uppercase tracking-wider text-fsl-slate/50`}>{canWrite ? "libero" : ""}</div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
