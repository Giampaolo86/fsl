import { useState } from "react";
import { FileDown, Pencil } from "lucide-react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { fmtDate } from "@/lib/format";

export function MatchTable({ rows, onEdit, canWrite, showGroup = true, testId }) {
  if (!rows.length) return null;
  return (
    <div className="overflow-x-auto rounded-lg border border-white/10" data-testid={testId}>
      <table className="w-full text-sm">
        <thead className="text-[11px] uppercase tracking-wider text-fsl-slate bg-ink-950/60">
          <tr><th className="text-left px-3 py-2">Data</th><th className="text-left px-2 py-2">Ora</th><th className="text-left px-2 py-2">Campo</th>{showGroup && <th className="text-left px-2 py-2">Girone</th>}<th className="text-left px-2 py-2">Squadra casa</th><th className="text-left px-2 py-2">Squadra ospite</th><th className="px-2 py-2 text-right">{canWrite ? "Modifica" : "Esito"}</th></tr>
        </thead>
        <tbody className="divide-y divide-white/[0.06]">
          {rows.map((m) => (
            <tr key={m.id} className={m.played ? "opacity-70" : ""} data-testid={`simple-match-${m.id}`}>
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

export function CalendarBlock({ tid, board, reload, canWrite, onEdit }) {
  const c = board.calendar;
  const [f, setF] = useState({ date: c.date || new Date().toISOString().slice(0, 10), fields_count: c.fields_count || 2, start_time: c.start_time || "08:30", end_time: c.end_time || "13:30", match_minutes: c.match_minutes || 25, buffer_minutes: c.buffer_minutes ?? 10 });
  const [busy, setBusy] = useState(false);
  const generate = async () => {
    if (board.matches.length && !window.confirm("Il calendario attuale dei gironi verrà sostituito. Continuare?")) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/tournaments/${tid}/simple/calendar`, { ...f, category: board.category, fields_count: Number(f.fields_count), match_minutes: Number(f.match_minutes), buffer_minutes: Number(f.buffer_minutes) });
      toast.success(`${data.count} partite generate su ${data.days} giornat${data.days === 1 ? "a" : "e"}`); reload();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const [pdfBusy, setPdfBusy] = useState(false);
  const pdf = async () => {
    setPdfBusy(true);
    try {
      const r = await api.get(`/tournaments/${tid}/simple/calendar.pdf`, { params: { category: board.category }, responseType: "blob" });
      const url = URL.createObjectURL(r.data); const a = document.createElement("a"); a.href = url; a.download = `FSL_Calendario_${board.category}.pdf`; a.click(); URL.revokeObjectURL(url);
    } catch (e) { toast.error(apiError(e)); } finally { setPdfBusy(false); }
  };
  return (
    <section className="fsl-card p-5" data-testid="block-calendar">
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div><div className="fsl-kicker">B</div><h2 className="font-display font-extrabold uppercase text-2xl leading-none">Calendario</h2><p className="text-xs text-fsl-slate mt-1">Girone all'italiana, sola andata: partite solo tra squadre dello stesso girone.</p></div>
        {canWrite && board.groups.length > 0 && (
          <div className="flex flex-wrap items-end gap-2 ml-auto">
            <label className="text-xs text-fsl-slate">Data inizio<input type="date" className="fsl-input h-10 w-40 mt-1" value={f.date} onChange={set("date")} data-testid="cal-date" /></label>
            <label className="text-xs text-fsl-slate">Campi<input type="number" min="1" max="20" className="fsl-input h-10 w-16 mt-1" value={f.fields_count} onChange={set("fields_count")} data-testid="cal-fields" /></label>
            <label className="text-xs text-fsl-slate">Inizio<input type="time" className="fsl-input h-10 w-28 mt-1" value={f.start_time} onChange={set("start_time")} data-testid="cal-start" /></label>
            <label className="text-xs text-fsl-slate">Fine<input type="time" className="fsl-input h-10 w-28 mt-1" value={f.end_time} onChange={set("end_time")} data-testid="cal-end" /></label>
            <label className="text-xs text-fsl-slate">Durata (min)<input type="number" min="5" max="120" className="fsl-input h-10 w-20 mt-1" value={f.match_minutes} onChange={set("match_minutes")} data-testid="cal-duration" /></label>
            <label className="text-xs text-fsl-slate">Intervallo (min)<input type="number" min="0" max="60" className="fsl-input h-10 w-20 mt-1" value={f.buffer_minutes} onChange={set("buffer_minutes")} data-testid="cal-buffer" /></label>
            <button className="btn-gold h-10" disabled={busy} onClick={generate} data-testid="cal-generate-button">Genera calendario</button>
          </div>
        )}
      </div>
      {board.matches.length === 0 ? (
        <p className="text-sm text-fsl-slate" data-testid="cal-empty">{board.groups.length ? "Imposta campi e orari, poi premi «Genera calendario». Ogni partita resterà modificabile." : "Crea prima i gironi."}</p>
      ) : (
        <div className="space-y-4">
          <button className="btn-ghost h-10" disabled={pdfBusy} onClick={pdf} data-testid="cal-pdf-button"><FileDown className="h-4 w-4" /> {pdfBusy ? "Preparo il PDF…" : "Stampa calendario PDF (una pagina per girone)"}</button>
          {board.groups.map((g) => <div key={g.id}><h3 className="fsl-section-title mb-2">{g.name} <span className="text-fsl-slate text-sm font-sans normal-case">· {board.matches.filter((m) => m.competition_id === g.id).length} partite</span></h3><MatchTable rows={board.matches.filter((m) => m.competition_id === g.id)} onEdit={onEdit} canWrite={canWrite} showGroup={false} testId={`cal-table-${g.name.replace(/\s+/g, "-")}`} /></div>)}
        </div>
      )}
    </section>
  );
}
