import { useMemo, useState } from "react";
import { AlertTriangle, Coffee, GripVertical, Pencil, X } from "lucide-react";
import { MatchTile, TeamRow } from "@/components/fsl/MatchTile";
import { fmtDate } from "@/lib/format";
import { useIsMobile } from "@/hooks/useIsMobile";

export const WEEKDAYS = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
export const toMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
export const toHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

export function slotTimes(sessions, day, step, duration) {
  const out = new Set();
  sessions.filter((s) => s.date === day).forEach((s) => { for (let t = toMin(s.start_time); t + duration <= toMin(s.end_time); t += step) out.add(toHHMM(t)); });
  return out;
}

export function gridRows(day, sessions, breaks, matches, step, duration, extraTimes = []) {
  const times = slotTimes(sessions, day, step, duration);
  matches.filter((m) => m.kickoff_at.startsWith(day)).forEach((m) => times.add(m.kickoff_at.slice(11, 16)));
  extraTimes.forEach((t) => times.add(t));
  return [...[...times].map((t) => ({ kind: "slot", t })), ...breaks.filter((b) => b.date === day).map((b) => ({ kind: "break", t: b.start_time, b }))].sort((a, z) => a.t.localeCompare(z.t));
}

const overlaps = (a, b, dur) => a.kickoff_at.slice(0, 10) === b.kickoff_at.slice(0, 10) && Math.abs(toMin(a.kickoff_at.slice(11, 16)) - toMin(b.kickoff_at.slice(11, 16))) < dur;

export function findConflicts(all, duration) {
  const team = {}, field = {};
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j];
      if (a.played && b.played) continue;
      if (!overlaps(a, b, duration)) continue;
      const other = (x) => `${x.home} – ${x.away} · ${x.kickoff_at.slice(11, 16)} · ${x.field_name || ""}`;
      for (const sa of ["home", "away"]) for (const sb of ["home", "away"]) {
        if (a[`${sa}_team_id`] && a[`${sa}_team_id`] === b[`${sb}_team_id`]) { team[`${a.id}|${sa}`] = other(b); team[`${b.id}|${sb}`] = other(a); }
      }
      if (a.field_id && a.field_id === b.field_id) { field[a.id] = other(b); field[b.id] = other(a); }
    }
  }
  return { team, field };
}

function TeamBox({ m, side, teams, canWrite, onQuickTeam, conflict }) {
  const [open, setOpen] = useState(false);
  const id = m[`${side}_team_id`];
  const team = teams.find((t) => t.id === id) || { id, name: m[side] };
  if (open) {
    return (
      <select autoFocus className="fsl-input h-7 w-full text-xs py-0 px-1" value={id} onBlur={() => setOpen(false)} onChange={(e) => { setOpen(false); if (e.target.value !== id) onQuickTeam(m.id, side, e.target.value); }} aria-label={side === "home" ? "Squadra casa" : "Squadra ospite"} data-testid={`grid-team-select-${side}-${m.id}`}>
        {teams.map((t) => <option key={t.id} value={t.id}>{t.name}{t.series && t.series !== "Fase finale" ? ` · ${t.series}` : ""}</option>)}
      </select>
    );
  }
  return <TeamRow team={{ ...team, name: m[side] }} side={side} conflict={conflict} onClick={canWrite && !m.played ? () => setOpen(true) : undefined} testId={`grid-team-${side}-${m.id}`} />;
}

export function TimeGrid({ board, canWrite, onMove, onEdit, onBreaks, onQuickTeam }) {
  const mobile = useIsMobile();
  const [over, setOver] = useState(null);
  const [extra, setExtra] = useState({});
  const [newTime, setNewTime] = useState({});
  const [newBreak, setNewBreak] = useState({});
  const c = board.calendar;
  const breaks = c.breaks || [];
  const addBreak = (day) => {
    const b = newBreak[day] || {};
    if (!b.start_time || !b.end_time) return;
    onBreaks([...breaks, { date: day, start_time: b.start_time, end_time: b.end_time, label: b.label || "Pausa" }]);
    setNewBreak({ ...newBreak, [day]: {} });
  };
  const removeBreak = (b) => onBreaks(breaks.filter((x) => !(x.date === b.date && x.start_time === b.start_time && x.label === b.label)));
  const step = (c.match_minutes || 25) + (c.buffer_minutes ?? 10);
  const all = useMemo(() => [...board.matches, ...board.finals], [board]);
  const conflicts = useMemo(() => findConflicts(all, c.match_minutes || 25), [all, c.match_minutes]);
  const teamById = useMemo(() => Object.fromEntries(board.teams.map((t) => [t.id, t])), [board.teams]);
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

  const tile = (m, isOver) => (
    <MatchTile
      m={m}
      home={{ node: <TeamBox m={m} side="home" teams={board.teams} canWrite={canWrite} onQuickTeam={onQuickTeam} conflict={conflicts.team[`${m.id}|home`]} />, ...(teamById[m.home_team_id] || {}) }}
      away={{ node: <TeamBox m={m} side="away" teams={board.teams} canWrite={canWrite} onQuickTeam={onQuickTeam} conflict={conflicts.team[`${m.id}|away`]} />, ...(teamById[m.away_team_id] || {}) }}
      kicker={m.stage === "finals" ? m.round_name : m.series}
      fieldConflict={conflicts.field[m.id]}
      className={`${isOver ? "ring-2 ring-fsl-gold" : ""} ${canWrite && !m.played && !mobile ? "cursor-grab active:cursor-grabbing" : ""}`}
      tileProps={{ draggable: canWrite && !m.played && !mobile, onDragStart: (e) => { e.dataTransfer.setData("text/fsl-match", m.id); e.dataTransfer.effectAllowed = "move"; } }}
      dragHandle={canWrite && !m.played && !mobile ? <GripVertical className="h-3.5 w-3.5 text-fsl-slate/40 group-hover:text-fsl-slate self-center shrink-0 ml-0.5" /> : null}
      actions={canWrite && !m.played ? <button type="button" onClick={() => onEdit(m)} className={`absolute top-1 right-1 text-fsl-slate hover:text-fsl-gold transition-opacity ${mobile ? "" : "opacity-0 group-hover:opacity-100"}`} aria-label="Modifica" data-testid={`grid-edit-${m.id}`}><Pencil className="h-3 w-3" /></button> : null}
      testId={`grid-match-${m.id}`}
    />
  );
  if (!fields.length) return <p className="text-sm text-fsl-slate">Nessun campo configurato.</p>;
  return (
    <div className="space-y-6" data-testid="time-grid">
      {[...new Set([...days, ...breaks.map((b) => b.date)])].sort().map((day) => {
        const rows = gridRows(day, c.sessions || [], breaks, all, step, c.match_minutes || 25, extra[day] || []);
        const nConf = all.filter((m) => m.kickoff_at.startsWith(day) && (conflicts.field[m.id] || conflicts.team[`${m.id}|home`] || conflicts.team[`${m.id}|away`])).length;
        return (
          <div key={day} className="rounded-lg border border-white/10 overflow-hidden" data-testid={`grid-day-${day}`}>
            <div className="px-3 sm:px-4 min-h-11 py-2 flex flex-wrap items-center gap-x-3 gap-y-2 bg-ink-950/60 border-b border-white/10"><span className="font-display font-extrabold uppercase text-fsl-gold text-sm sm:text-base">{WEEKDAYS[new Date(day + "T12:00").getDay()]} {fmtDate(day)}</span><span className="text-xs text-fsl-slate">{all.filter((m) => m.kickoff_at.startsWith(day)).length} partite</span>{nConf > 0 && <span className="inline-flex items-center gap-1 rounded-full border border-fsl-danger/60 bg-fsl-danger/15 px-2 h-6 text-[10px] font-semibold uppercase tracking-wider text-fsl-danger" data-testid={`grid-conflicts-${day}`}><AlertTriangle className="h-3 w-3" /> {nConf} in conflitto</span>}
              {canWrite && <form className="sm:ml-auto flex items-center gap-1 flex-wrap" onSubmit={(e) => { e.preventDefault(); const t = newTime[day]; if (t) { setExtra({ ...extra, [day]: [...(extra[day] || []), t] }); setNewTime({ ...newTime, [day]: "" }); } }} data-testid={`grid-add-row-${day}`}><input type="time" className="fsl-input h-8 w-28 text-xs py-0" value={newTime[day] || ""} onChange={(e) => setNewTime({ ...newTime, [day]: e.target.value })} aria-label="Nuovo orario" data-testid={`grid-add-time-${day}`} /><button type="submit" className="btn-ghost h-8 px-2 text-xs" data-testid={`grid-add-time-button-${day}`}>+ Orario</button></form>}
              {canWrite && <form className="flex items-center gap-1 flex-wrap" onSubmit={(e) => { e.preventDefault(); addBreak(day); }} data-testid={`grid-add-break-${day}`}><input className="fsl-input h-8 w-32 text-xs py-0" placeholder="Pausa pranzo" value={newBreak[day]?.label || ""} onChange={(e) => setNewBreak({ ...newBreak, [day]: { ...newBreak[day], label: e.target.value } })} aria-label="Nome pausa" data-testid={`grid-break-label-${day}`} /><input type="time" className="fsl-input h-8 w-24 text-xs py-0" value={newBreak[day]?.start_time || ""} onChange={(e) => setNewBreak({ ...newBreak, [day]: { ...newBreak[day], start_time: e.target.value } })} aria-label="Inizio pausa" data-testid={`grid-break-start-${day}`} /><input type="time" className="fsl-input h-8 w-24 text-xs py-0" value={newBreak[day]?.end_time || ""} onChange={(e) => setNewBreak({ ...newBreak, [day]: { ...newBreak[day], end_time: e.target.value } })} aria-label="Fine pausa" data-testid={`grid-break-end-${day}`} /><button type="submit" className="btn-ghost h-8 px-2 text-xs" data-testid={`grid-break-add-button-${day}`}><Coffee className="h-3.5 w-3.5" /> Pausa</button></form>}</div>
            {mobile ? (
              <div className="divide-y divide-white/[0.06]" data-testid={`grid-mobile-${day}`}>
                {rows.map(({ kind, t, b }) => kind === "break" ? (
                  <div key={`b-${t}-${b.label}`} className="bg-fsl-gold/[0.07] px-3 py-2 flex items-center gap-2 text-sm" data-testid={`grid-break-${day}-${t}`}><Coffee className="h-4 w-4 text-fsl-gold shrink-0" /><span className="font-semibold uppercase tracking-wide truncate">{b.label}</span><span className="ml-auto num text-xs text-fsl-slate whitespace-nowrap">{b.start_time} – {b.end_time}</span>{canWrite && <button type="button" onClick={() => removeBreak(b)} className="text-fsl-slate hover:text-fsl-danger" aria-label="Rimuovi pausa" data-testid={`grid-break-remove-${day}-${t}`}><X className="h-4 w-4" /></button>}</div>
                ) : (
                  <div key={t} className="px-3 py-2">
                    <div className="flex items-baseline gap-2 mb-1.5"><span className="num font-display font-extrabold text-lg text-fsl-gold leading-none">{t}</span><span className="num text-[10px] text-fsl-slate">– {toHHMM(toMin(t) + (c.match_minutes || 25))}</span></div>
                    <div className="space-y-1.5">
                      {fields.map((f) => { const m = byKey[`${day}T${t}|${f.id}`]; return m ? <div key={f.id}><div className="text-[9px] uppercase tracking-[0.16em] text-fsl-slate mb-0.5 pl-1">{f.name}</div>{tile(m, false)}</div> : null; })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm table-fixed">
                <thead className="text-[11px] uppercase tracking-wider text-fsl-slate"><tr><th className="w-24 text-left px-3 py-2">Ora</th>{fields.map((f) => <th key={f.id} className="text-left px-2 py-2">{f.name}</th>)}</tr></thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {rows.map(({ kind, t, b }) => {
                    if (kind === "break") {
                      return (
                        <tr key={`b-${t}-${b.label}`} className="bg-fsl-gold/[0.07]" data-testid={`grid-break-${day}-${t}`}>
                          <td className="px-3 py-2 num font-semibold text-fsl-slate align-top">{b.start_time}<span className="block text-[10px] font-normal">– {b.end_time}</span></td>
                          <td colSpan={fields.length} className="px-3 py-2">
                            <div className="flex items-center gap-3 text-sm"><Coffee className="h-4 w-4 text-fsl-gold" /><span className="font-semibold uppercase tracking-wide">{b.label}</span><span className="text-xs text-fsl-slate">{toMin(b.end_time) - toMin(b.start_time)} minuti</span>{canWrite && <button type="button" onClick={() => removeBreak(b)} className="ml-auto text-fsl-slate hover:text-fsl-danger" aria-label="Rimuovi pausa" data-testid={`grid-break-remove-${day}-${t}`}><X className="h-4 w-4" /></button>}</div>
                          </td>
                        </tr>
                      );
                    }
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
                              {m ? tile(m, isOver) : (
                                <div className={`h-[70px] rounded-md border border-dashed ${isOver ? "border-fsl-gold bg-fsl-gold/10" : "border-white/10"} flex items-center justify-center text-[10px] uppercase tracking-wider text-fsl-slate/50`}>{canWrite ? "libero" : ""}</div>
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
            )}
          </div>
        );
      })}
    </div>
  );
}
