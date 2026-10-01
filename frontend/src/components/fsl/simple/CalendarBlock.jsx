import { useState } from "react";
import { FileDown, GripVertical, LayoutGrid, List, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { TimeGrid } from "./TimeGrid";

export function MatchTable({ rows, onEdit, onSwap, canWrite, showGroup = true, testId }) {
  const [over, setOver] = useState(null);
  if (!rows.length) return null;
  const draggable = canWrite && !!onSwap;
  const drop = (e, target) => {
    e.preventDefault(); setOver(null);
    const src = e.dataTransfer.getData("text/fsl-match");
    if (src && src !== target.id && !target.played) onSwap(src, target.id);
  };
  return (
    <div className="overflow-x-auto rounded-lg border border-white/10" data-testid={testId}>
      <table className="w-full text-sm">
        <thead className="text-[11px] uppercase tracking-wider text-fsl-slate bg-ink-950/60">
          <tr>{draggable && <th className="w-6" aria-label="Trascina" />}<th className="text-left px-3 py-2">Data</th><th className="text-left px-2 py-2">Ora</th><th className="text-left px-2 py-2">Campo</th>{showGroup && <th className="text-left px-2 py-2">Girone</th>}<th className="text-left px-2 py-2">Squadra casa</th><th className="text-left px-2 py-2">Squadra ospite</th><th className="px-2 py-2 text-right">{canWrite ? "Modifica" : "Esito"}</th></tr>
        </thead>
        <tbody className="divide-y divide-white/[0.06]">
          {rows.map((m) => (
            <tr
              key={m.id}
              draggable={draggable && !m.played}
              onDragStart={(e) => { e.dataTransfer.setData("text/fsl-match", m.id); e.dataTransfer.effectAllowed = "move"; }}
              onDragOver={(e) => { if (draggable && !m.played) { e.preventDefault(); setOver(m.id); } }}
              onDragLeave={() => setOver((o) => (o === m.id ? null : o))}
              onDrop={(e) => drop(e, m)}
              className={`${m.played ? "opacity-70" : draggable ? "cursor-grab active:cursor-grabbing" : ""} ${over === m.id ? "bg-fsl-gold/15 outline outline-1 outline-fsl-gold" : ""} transition-colors`}
              data-testid={`simple-match-${m.id}`}
            >
              {draggable && <td className="pl-2 text-fsl-slate/50" aria-hidden="true">{!m.played && <GripVertical className="h-4 w-4" />}</td>}
              <td className="px-3 py-2 text-xs text-fsl-slate whitespace-nowrap">{fmtDate(m.kickoff_at)}</td>
              <td className="px-2 py-2 num font-semibold">{m.kickoff_at.slice(11, 16)}</td>
              <td className="px-2 py-2 text-fsl-slate whitespace-nowrap">{m.field_name || "—"}</td>
              {showGroup && <td className="px-2 py-2 text-xs text-fsl-gold whitespace-nowrap">{m.stage === "finals" ? m.round_name : m.series}</td>}
              <td className="px-2 py-2 font-semibold">{m.home}</td>
              <td className="px-2 py-2 font-semibold">{m.away}</td>
              <td className="px-2 py-2 text-right whitespace-nowrap">
                {m.played ? <span className="num text-fsl-gold font-bold">{m.score?.home} - {m.score?.away}</span> : canWrite ? <button className="btn-ghost h-8 px-3 text-xs" onClick={() => onEdit(m)} data-testid={`simple-edit-${m.id}`}><Pencil className="h-3.5 w-3.5" /> Modifica</button> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const WEEKDAYS = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
const dayLabel = (d) => (d ? `${WEEKDAYS[new Date(d + "T12:00").getDay()]} ${fmtDate(d)}` : "");

export function CalendarBlock({ tid, board, reload, canWrite, onEdit, onSwap, onMove, onBreaks, onSlots, onQuickTeam }) {
  const c = board.calendar;
  const [view, setView] = useState("grid");
  const today = new Date().toISOString().slice(0, 10);
  const [sessions, setSessions] = useState(c.sessions?.length ? c.sessions : [{ date: c.date || today, start_time: c.start_time || "15:00", end_time: c.end_time || "19:00" }]);
  const [f, setF] = useState({ fields_count: c.fields_count || 2, match_minutes: c.match_minutes || 25, buffer_minutes: c.buffer_minutes ?? 10 });
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const updS = (i, k, v) => setSessions(sessions.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const addSession = () => {
    const last = sessions[sessions.length - 1];
    const d = new Date((last?.date || today) + "T12:00"); d.setDate(d.getDate() + 1);
    setSessions([...sessions, { date: d.toISOString().slice(0, 10), start_time: "08:30", end_time: "12:30" }]);
  };
  const generate = async () => {
    if (board.matches.length && !window.confirm("Il calendario attuale dei gironi verrà sostituito (le modifiche manuali andranno perse). Continuare?")) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/tournaments/${tid}/simple/calendar`, { category: board.category, sessions, fields_count: Number(f.fields_count), match_minutes: Number(f.match_minutes), buffer_minutes: Number(f.buffer_minutes) });
      toast.success(`${data.count} partite distribuite su ${data.sessions} session${data.sessions === 1 ? "e" : "i"}`); reload();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  const pdf = async () => {
    setPdfBusy(true);
    try {
      const r = await api.get(`/tournaments/${tid}/simple/calendar.pdf`, { params: { category: board.category }, responseType: "blob" });
      const url = URL.createObjectURL(r.data); const a = document.createElement("a"); a.href = url; a.download = `FSL_Calendario_${board.category}.pdf`; a.click(); URL.revokeObjectURL(url);
    } catch (e) { toast.error(apiError(e)); } finally { setPdfBusy(false); }
  };
  const days = [...new Set(board.matches.map((m) => m.kickoff_at.slice(0, 10)))];
  return (
    <section className="fsl-card p-5" data-testid="block-calendar">
      <div className="flex flex-wrap items-start gap-4 mb-4">
        <div><div className="fsl-kicker">B</div><h2 className="font-display font-extrabold uppercase text-2xl leading-none">Calendario</h2><p className="text-xs text-fsl-slate mt-1">All'italiana, sola andata, solo tra squadre dello stesso girone. Ogni partita resta modificabile (anche il giorno).</p></div>
        {canWrite && board.groups.length > 0 && (
          <div className="md:ml-auto rounded-lg border border-white/10 bg-ink-950/40 p-3 space-y-2 w-full md:w-auto md:min-w-[520px]" data-testid="cal-setup">
            <div className="flex items-center justify-between"><span className="text-[11px] uppercase tracking-wider text-fsl-slate">Quando si gioca</span><button type="button" className="text-xs text-fsl-gold hover:underline" onClick={addSession} data-testid="cal-add-session">+ Aggiungi sessione</button></div>
            {sessions.map((sess, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2" data-testid={`cal-session-${i}`}>
                <input type="date" className="fsl-input h-9 w-36 sm:w-40" value={sess.date} onChange={(e) => updS(i, "date", e.target.value)} data-testid={`cal-session-date-${i}`} />
                <span className="text-xs text-fsl-slate w-20 truncate hidden sm:inline">{dayLabel(sess.date)}</span>
                <input type="time" className="fsl-input h-9 w-24 sm:w-28" value={sess.start_time} onChange={(e) => updS(i, "start_time", e.target.value)} data-testid={`cal-session-start-${i}`} />
                <span className="text-xs text-fsl-slate">→</span>
                <input type="time" className="fsl-input h-9 w-24 sm:w-28" value={sess.end_time} onChange={(e) => updS(i, "end_time", e.target.value)} data-testid={`cal-session-end-${i}`} />
                {sessions.length > 1 && <button type="button" className="text-fsl-slate hover:text-fsl-danger" onClick={() => setSessions(sessions.filter((_, j) => j !== i))} aria-label="Rimuovi sessione" data-testid={`cal-session-remove-${i}`}><X className="h-4 w-4" /></button>}
              </div>
            ))}
            <div className="flex flex-wrap items-end gap-2 pt-1">
              <label className="text-xs text-fsl-slate">Campi<input type="number" min="1" max="20" className="fsl-input h-9 w-16 mt-1" value={f.fields_count} onChange={set("fields_count")} data-testid="cal-fields" /></label>
              <label className="text-xs text-fsl-slate">Durata gara (min)<input type="number" min="5" max="120" className="fsl-input h-9 w-24 mt-1" value={f.match_minutes} onChange={set("match_minutes")} data-testid="cal-duration" /></label>
              <label className="text-xs text-fsl-slate">Pausa tra gare (min)<input type="number" min="0" max="60" className="fsl-input h-9 w-24 mt-1" value={f.buffer_minutes} onChange={set("buffer_minutes")} data-testid="cal-buffer" /></label>
              <button className="btn-gold h-9 w-full sm:w-auto sm:ml-auto" disabled={busy} onClick={generate} data-testid="cal-generate-button">{board.matches.length ? "Rigenera calendario" : "Genera calendario"}</button>
            </div>
          </div>
        )}
      </div>
      {board.matches.length === 0 ? (
        <p className="text-sm text-fsl-slate" data-testid="cal-empty">{board.groups.length ? "Indica quando si gioca (es. sabato 15:00→19:00 e domenica 08:30→12:30), campi e durata, poi premi «Genera calendario»." : "Crea prima i gironi."}</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-xs text-fsl-slate">
            <span data-testid="cal-summary">{board.matches.length} partite · {days.map(dayLabel).join(" · ")}</span>
            {canWrite && <span className="inline-flex items-center gap-1 text-fsl-slate/80" data-testid="cal-drag-hint"><GripVertical className="h-3.5 w-3.5" /> {view === "grid" ? "Trascina una partita in uno slot libero (o su un'altra per scambiarle)" : "Trascina una partita su un'altra per scambiare orario e campo"}</span>}
            <div className="sm:ml-auto flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <div className="inline-flex rounded-md border border-white/15 overflow-hidden" role="tablist" data-testid="cal-view-toggle">
                <button type="button" role="tab" aria-selected={view === "grid"} onClick={() => setView("grid")} className={`h-9 px-3 text-xs inline-flex items-center gap-1 ${view === "grid" ? "bg-fsl-gold text-ink-950 font-semibold" : "hover:bg-white/5"}`} data-testid="cal-view-grid"><LayoutGrid className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Griglia ora × campo</span><span className="sm:hidden">Griglia</span></button>
                <button type="button" role="tab" aria-selected={view === "list"} onClick={() => setView("list")} className={`h-9 px-3 text-xs inline-flex items-center gap-1 ${view === "list" ? "bg-fsl-gold text-ink-950 font-semibold" : "hover:bg-white/5"}`} data-testid="cal-view-list"><List className="h-3.5 w-3.5" /> Per girone</button>
              </div>
              <button className="btn-ghost h-9" disabled={pdfBusy} onClick={pdf} data-testid="cal-pdf-button"><FileDown className="h-4 w-4" /> {pdfBusy ? "Preparo il PDF…" : "Stampa PDF"}</button>
            </div>
          </div>
          {view === "grid" && <TimeGrid board={board} canWrite={canWrite} onMove={onMove} onEdit={onEdit} onBreaks={onBreaks} onSlots={onSlots} onQuickTeam={onQuickTeam} />}
          {view === "list" && board.groups.map((g) => <div key={g.id}><h3 className="fsl-section-title mb-2">{g.name} <span className="text-fsl-slate text-sm font-sans normal-case">· {board.matches.filter((m) => m.competition_id === g.id).length} partite</span></h3><MatchTable rows={board.matches.filter((m) => m.competition_id === g.id)} onEdit={onEdit} onSwap={onSwap} canWrite={canWrite} showGroup={false} testId={`cal-table-${g.name.replace(/\s+/g, "-")}`} /></div>)}
        </div>
      )}
    </section>
  );
}
