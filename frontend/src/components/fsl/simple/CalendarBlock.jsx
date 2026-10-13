import { useEffect, useMemo, useState } from "react";
import { CalendarRange, ChevronLeft, ChevronRight, FileDown, Layers, FileUp, GripVertical, LayoutGrid, List, Pencil, Plus, Printer, Star, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { api, apiError, withForce } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { TimeGrid } from "./TimeGrid";
import { CsvImportDialog } from "./CsvImportDialog";

export function MatchTable({ rows, onEdit, onSwap, canWrite, showGroup = true, testId, tid, onBulkDeleted }) {
  const [over, setOver] = useState(null);
  const [sel, setSel] = useState([]);
  const [deleting, setDeleting] = useState(false);
  if (!rows.length) return null;
  const draggable = canWrite && !!onSwap;
  const selectable = canWrite && !!tid && !!onBulkDeleted;
  const deletable = rows.filter((m) => !m.played);
  const selected = sel.filter((id) => rows.some((m) => m.id === id));
  const toggle = (id) => setSel((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  const toggleAll = () => setSel(selected.length === deletable.length ? [] : deletable.map((m) => m.id));
  const bulkDelete = async () => {
    if (!window.confirm(`Eliminare ${selected.length} partite selezionate? L'operazione non è reversibile.`)) return;
    setDeleting(true);
    try {
      const { data } = await api.post(`/tournaments/${tid}/simple/matches/bulk-delete`, { ids: selected });
      toast.success(`${data.deleted} partite eliminate${data.skipped ? ` · ${data.skipped} saltate (già giocate)` : ""}`);
      setSel([]);
      onBulkDeleted(data);
    } catch (e) { toast.error(apiError(e)); } finally { setDeleting(false); }
  };
  const drop = (e, target) => {
    e.preventDefault(); setOver(null);
    const src = e.dataTransfer.getData("text/fsl-match");
    if (src && src !== target.id && !target.played) onSwap(src, target.id);
  };
  return (
    <div className="space-y-2">
      {selectable && selected.length > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-fsl-gold/50 bg-ink-950/95 px-3 py-2 text-sm shadow-xl" data-testid={`${testId}-bulk-bar`}>
          <span><b className="num">{selected.length}</b> partite selezionate</span>
          <button type="button" className="btn-ghost h-8 px-3 text-xs text-fsl-danger" disabled={deleting} onClick={bulkDelete} data-testid={`${testId}-bulk-delete`}><Trash2 className="h-3.5 w-3.5" /> Elimina selezionate</button>
          <button type="button" className="btn-ghost h-8 px-3 text-xs" onClick={() => setSel([])} data-testid={`${testId}-bulk-clear`}>Annulla selezione</button>
        </div>
      )}
    <div className="overflow-x-auto rounded-lg border border-white/10" data-testid={testId}>
      <table className="w-full text-sm">
        <thead className="text-[11px] uppercase tracking-wider text-fsl-slate bg-ink-950/60">
          <tr>{selectable && <th className="w-8 px-2"><input type="checkbox" aria-label="Seleziona tutte" checked={deletable.length > 0 && selected.length === deletable.length} onChange={toggleAll} data-testid={`${testId}-select-all`} /></th>}{draggable && <th className="w-6" aria-label="Trascina" />}<th className="text-left px-3 py-2">Data</th><th className="text-left px-2 py-2">Ora</th><th className="text-left px-2 py-2">Campo</th>{showGroup && <th className="text-left px-2 py-2">Girone</th>}<th className="text-left px-2 py-2">Squadra casa</th><th className="text-left px-2 py-2">Squadra ospite</th><th className="px-2 py-2 text-right">{canWrite ? "Modifica" : "Esito"}</th></tr>
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
              onClick={() => { if (canWrite && !m.played) onEdit(m); }}
              className={`${m.played ? "opacity-70" : draggable ? "cursor-grab active:cursor-grabbing" : canWrite ? "cursor-pointer" : ""} ${canWrite && !m.played ? "hover:bg-white/[0.04]" : ""} ${over === m.id ? "bg-fsl-gold/15 outline outline-1 outline-fsl-gold" : ""} transition-colors`}
              data-testid={`simple-match-${m.id}`}
            >
              {selectable && <td className="px-2" onClick={(e) => e.stopPropagation()}>{!m.played && <input type="checkbox" aria-label="Seleziona partita" checked={selected.includes(m.id)} onChange={() => toggle(m.id)} data-testid={`simple-select-${m.id}`} />}</td>}
              {draggable && <td className="pl-2 text-fsl-slate/50" aria-hidden="true">{!m.played && <GripVertical className="h-4 w-4" />}</td>}
              <td className="px-3 py-2 text-xs text-fsl-slate whitespace-nowrap">{fmtDate(m.kickoff_at)}</td>
              <td className="px-2 py-2 num font-semibold">{m.kickoff_at.slice(11, 16)}</td>
              <td className="px-2 py-2 text-fsl-slate whitespace-nowrap">{m.field_name || "—"}</td>
              {showGroup && <td className="px-2 py-2 text-xs text-fsl-gold whitespace-nowrap">{m.is_grand_final && <Star className="inline h-3 w-3 mr-1 -mt-0.5 fill-fsl-gold" aria-label="Finalissima" />}{m.stage === "finals" ? m.round_name : m.series}{m.note && <span className="block text-[10px] text-fsl-slate normal-case whitespace-normal max-w-[220px]" data-testid={`match-note-${m.id}`}>{m.note}</span>}</td>}
              <td className="px-2 py-2 font-semibold">{m.home}</td>
              <td className="px-2 py-2 font-semibold">{m.away}</td>
              <td className="px-2 py-2 text-right whitespace-nowrap">
                {m.played ? <span className="num text-fsl-gold font-bold">{m.score?.home} - {m.score?.away}</span> : canWrite ? <button className="btn-ghost h-8 px-3 text-xs" onClick={(e) => { e.stopPropagation(); onEdit(m); }} data-testid={`simple-edit-${m.id}`}><Pencil className="h-3.5 w-3.5" /> Modifica</button> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </div>
  );
}

const WEEKDAYS = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
const dayLabel = (d) => (d ? `${WEEKDAYS[new Date(d + "T12:00").getDay()]} ${fmtDate(d)}` : "");

export function CalendarBlock({ tid, board, reload, canWrite, onEdit, onSwap, onMove, onBreaks, onSlots, onQuickTeam, onCreate }) {
  const [csvOpen, setCsvOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const clearCalendar = async () => {
    const finalsCount = (board.finals || []).length;
    if (!window.confirm(`Cancellare tutte le ${board.matches.length} gare del calendario della categoria ${board.category}? Gironi e squadre restano; nessuna gara giocata verrà toccata.`)) return;
    const withFinals = finalsCount > 0 && window.confirm(`Cancellare anche le ${finalsCount} gare della fase finale?`);
    setClearing(true);
    try { const { data } = await withForce((force) => api.delete(`/tournaments/${tid}/simple/calendar`, { params: { category: board.category, finals: withFinals, force } })); toast.success(`Calendario cancellato: ${data.deleted} gare${data.finals_deleted ? ` + ${data.finals_deleted} di fase finale` : ""}`); reload(); } catch (e) { toast.error(apiError(e)); } finally { setClearing(false); }
  };
  const c = board.calendar;
  const [view, setView] = useState("grid");
  const [overview, setOverview] = useState(null);
  useEffect(() => { if (view === "all") api.get(`/tournaments/${tid}/simple/overview`).then((r) => setOverview(r.data)).catch((e) => toast.error(apiError(e))); }, [view, tid, board]);
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
  const [pdfOpts, setPdfOpts] = useState({ end_time: true, referee: false });
  const downloadPdf = async (params, name) => {
    setPdfBusy(true);
    try {
      const r = await api.get(`/tournaments/${tid}/simple/calendar.pdf`, { params: { ...params, ...pdfOpts }, responseType: "blob" });
      const url = URL.createObjectURL(r.data); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
    } catch (e) { toast.error(apiError(e)); } finally { setPdfBusy(false); }
  };
  const pdf = () => downloadPdf({ category: board.category }, `FSL_Calendario_${board.category}.pdf`);
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
        <div className="flex flex-wrap items-center gap-3" data-testid="cal-empty-wrap">
          <p className="text-sm text-fsl-slate" data-testid="cal-empty">{board.groups.length ? "Indica quando si gioca (es. sabato 15:00→19:00 e domenica 08:30→12:30), campi e durata, poi premi «Genera calendario»." : "Crea prima i gironi."} Hai già il calendario in un file? Usa «Importa CSV / Excel»: carica tutte le categorie in un colpo solo.</p>
          {canWrite && <button className="btn-gold h-9" onClick={() => setCsvOpen(true)} title="Importa tutte le categorie da un file CSV o Excel «master gare»" data-testid="cal-import-csv"><FileUp className="h-4 w-4" /> Importa CSV / Excel</button>}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-xs text-fsl-slate">
            <span data-testid="cal-summary">{board.matches.length} partite · {days.map(dayLabel).join(" · ")}</span>
            {canWrite && <span className="inline-flex items-center gap-1 text-fsl-slate/80" data-testid="cal-drag-hint"><GripVertical className="h-3.5 w-3.5" /> {view === "grid" ? "Trascina una partita in uno slot libero (o su un'altra per scambiarle)" : "Trascina una partita su un'altra per scambiare orario e campo"}</span>}
            <div className="sm:ml-auto flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <div className="inline-flex rounded-md border border-white/15 overflow-hidden" role="tablist" data-testid="cal-view-toggle">
                <button type="button" role="tab" aria-selected={view === "grid"} onClick={() => setView("grid")} className={`h-9 px-3 text-xs inline-flex items-center gap-1 ${view === "grid" ? "bg-fsl-gold text-ink-950 font-semibold" : "hover:bg-white/5"}`} data-testid="cal-view-grid"><LayoutGrid className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Griglia ora × campo</span><span className="sm:hidden">Griglia</span></button>
                <button type="button" role="tab" aria-selected={view === "list"} onClick={() => setView("list")} className={`h-9 px-3 text-xs inline-flex items-center gap-1 ${view === "list" ? "bg-fsl-gold text-ink-950 font-semibold" : "hover:bg-white/5"}`} data-testid="cal-view-list"><List className="h-3.5 w-3.5" /> Per girone</button>
                <button type="button" role="tab" aria-selected={view === "rounds"} onClick={() => setView("rounds")} className={`h-9 px-3 text-xs inline-flex items-center gap-1 ${view === "rounds" ? "bg-fsl-gold text-ink-950 font-semibold" : "hover:bg-white/5"}`} data-testid="cal-view-rounds"><CalendarRange className="h-3.5 w-3.5" /> Per giornata</button>
                <button type="button" role="tab" aria-selected={view === "all"} onClick={() => setView("all")} className={`h-9 px-3 text-xs inline-flex items-center gap-1 ${view === "all" ? "bg-fsl-gold text-ink-950 font-semibold" : "hover:bg-white/5"}`} title="Calendario generale: tutte le categorie sugli stessi campi, weekend per weekend" data-testid="cal-view-all"><Layers className="h-3.5 w-3.5" /> Tutte le categorie</button>
              </div>
              {canWrite && <button className="btn-ghost h-9" onClick={() => onCreate({ stage: "qualification" })} data-testid="cal-add-match"><Plus className="h-4 w-4" /> Partita</button>}
              {canWrite && board.matches?.length > 0 && <button className="btn-ghost h-9 text-fsl-danger" disabled={clearing} onClick={clearCalendar} title="Elimina tutte le gare del calendario di questa categoria (gironi e squadre restano). Possibile solo se nessuna gara è stata giocata." data-testid="cal-clear-button"><Trash2 className="h-4 w-4" /> {clearing ? "Cancello…" : "Cancella calendario"}</button>}
              {canWrite && <button className="btn-ghost h-9" onClick={() => setCsvOpen(true)} title="Importa tutte le categorie da un file CSV o Excel «master gare»" data-testid="cal-import-csv"><FileUp className="h-4 w-4" /> Importa CSV / Excel</button>}
              <button className="btn-ghost h-9" disabled={pdfBusy} onClick={pdf} data-testid="cal-pdf-button"><FileDown className="h-4 w-4" /> {pdfBusy ? "Preparo il PDF…" : "Stampa PDF"}</button>
              <div className="inline-flex items-center gap-3 h-9 px-3 rounded-md border border-white/15 text-xs text-fsl-slate" title="Cosa stampare in ogni riquadro del PDF" data-testid="cal-pdf-options">
                <span className="uppercase tracking-wider text-[10px]">Nel PDF:</span>
                <label className="inline-flex items-center gap-1.5 cursor-pointer"><input type="checkbox" className="accent-[#F4AE2B]" checked={pdfOpts.end_time} onChange={(e) => setPdfOpts({ ...pdfOpts, end_time: e.target.checked })} data-testid="cal-pdf-opt-end" /> orario fine</label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer"><input type="checkbox" className="accent-[#F4AE2B]" checked={pdfOpts.referee} onChange={(e) => setPdfOpts({ ...pdfOpts, referee: e.target.checked })} data-testid="cal-pdf-opt-referee" /> arbitro</label>
              </div>
            </div>
          </div>
          {view === "grid" && <TimeGrid board={board} canWrite={canWrite} onMove={onMove} onEdit={onEdit} onBreaks={onBreaks} onSlots={onSlots} onQuickTeam={onQuickTeam} />}
          {view === "all" && (overview ? <AllCategoriesView overview={overview} onPdf={downloadPdf} pdfBusy={pdfBusy} canWrite={canWrite} onMove={onMove} onEdit={onEdit} onBreaks={onBreaks} onSlots={onSlots} onQuickTeam={onQuickTeam} /> : <p className="text-sm text-fsl-slate">Carico il calendario generale…</p>)}
          {view === "rounds" && <RoundsView board={board} onEdit={onEdit} onSwap={onSwap} canWrite={canWrite} onPdf={downloadPdf} pdfBusy={pdfBusy} />}
          {view === "list" && board.groups.map((g) => <div key={g.id}><h3 className="fsl-section-title mb-2">{g.name} <span className="text-fsl-slate text-sm font-sans normal-case">· {board.matches.filter((m) => m.competition_id === g.id).length} partite</span></h3><MatchTable rows={board.matches.filter((m) => m.competition_id === g.id)} onEdit={onEdit} onSwap={onSwap} canWrite={canWrite} showGroup={false} testId={`cal-table-${g.name.replace(/\s+/g, "-")}`} /></div>)}
        </div>
      )}
      {csvOpen && <CsvImportDialog tid={tid} onClose={() => setCsvOpen(false)} onDone={() => { setCsvOpen(false); reload(); }} />}
    </section>
  );
}

function RoundsView({ board, onEdit, onSwap, canWrite, onPdf, pdfBusy }) {
  const rounds = [...new Set(board.matches.map((m) => m.match_day || 0))].sort((a, b) => a - b);
  return (
    <div className="space-y-6" data-testid="cal-rounds">
      <p className="text-xs text-fsl-slate">Tutto il calendario della categoria, giornata per giornata: {rounds.length} giornate · {board.matches.length} partite.</p>
      {rounds.map((r) => {
        const rows = board.matches.filter((m) => (m.match_day || 0) === r).sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at) || (a.field_name || "").localeCompare(b.field_name || ""));
        const days = [...new Set(rows.map((m) => m.kickoff_at.slice(0, 10)))].sort();
        return (
          <div key={r} data-testid={`cal-round-${r}`}>
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <h3 className="fsl-section-title">{r ? `Giornata ${r}` : "Senza giornata"} <span className="text-fsl-slate text-sm font-sans normal-case">· {days.map((d) => fmtDate(d)).join(" – ")} · {rows.length} partite</span></h3>
              {r > 0 && <button type="button" className="btn-ghost h-8 px-3 text-xs" disabled={pdfBusy} onClick={() => onPdf({ category: board.category, match_day: r }, `FSL_Calendario_${board.category}_Giornata${r}.pdf`)} title={`Stampa solo la giornata ${r} di ${board.category}`} data-testid={`cal-round-pdf-${r}`}><Printer className="h-3.5 w-3.5" /> Stampa giornata {r}</button>}
            </div>
            <MatchTable rows={rows} onEdit={onEdit} onSwap={onSwap} canWrite={canWrite} showGroup testId={`cal-round-table-${r}`} />
          </div>
        );
      })}
    </div>
  );
}

const roundsOf = (matches) => {
  const map = {};
  matches.forEach((m) => { const r = m.match_day || 0; (map[r] ||= { round: r, dates: new Set(), n: 0 }); map[r].dates.add(m.kickoff_at.slice(0, 10)); map[r].n += 1; });
  return Object.values(map).map((x) => ({ ...x, dates: [...x.dates].sort() })).sort((a, b) => a.round - b.round);
};

function AllCategoriesView({ overview, onPdf, pdfBusy, canWrite, onMove, onEdit, onBreaks, onSlots, onQuickTeam }) {
  const [round, setRound] = useState("all");
  const rounds = useMemo(() => roundsOf(overview.matches), [overview.matches]);
  const cur = round === "all" ? null : rounds.find((r) => r.round === round);
  const idx = cur ? rounds.indexOf(cur) : -1;
  const dates = cur ? new Set(cur.dates) : null;
  const matches = cur ? overview.matches.filter((m) => (m.match_day || 0) === cur.round) : overview.matches;
  const board = useMemo(() => ({ ...overview, matches, finals: [], calendar: { ...overview.calendar, sessions: (overview.calendar.sessions || []).filter((s) => !dates || dates.has(s.date)), breaks: (overview.calendar.breaks || []).filter((b) => !dates || dates.has(b.date)) } }), [overview, matches, round]); // eslint-disable-line react-hooks/exhaustive-deps
  const perCat = overview.categories.map((c) => ({ c, n: matches.filter((m) => m.category === c).length }));
  const roundLabel = (r) => (r.round ? `Giornata ${r.round}` : "Senza giornata");
  return (
    <div className="space-y-4" data-testid="cal-all">
      <div className="flex flex-wrap items-center gap-2" data-testid="cal-all-rounds">
        <div className="inline-flex items-center rounded-md border border-white/15 overflow-hidden">
          <button type="button" className="h-9 px-2 hover:bg-white/5 disabled:opacity-30" disabled={round === "all" || idx <= 0} onClick={() => setRound(rounds[idx - 1].round)} aria-label="Giornata precedente" data-testid="cal-all-prev"><ChevronLeft className="h-4 w-4" /></button>
          <select className="fsl-input h-9 rounded-none border-0 border-x border-white/15 text-sm min-w-[200px]" value={round} onChange={(e) => setRound(e.target.value === "all" ? "all" : Number(e.target.value))} aria-label="Giornata" data-testid="cal-all-round-select">
            <option value="all">Tutte le giornate · {overview.matches.length} gare</option>
            {rounds.map((r) => <option key={r.round} value={r.round}>{roundLabel(r)} · {r.dates.map(dayLabel).join(" + ")} · {r.n} gare</option>)}
          </select>
          <button type="button" className="h-9 px-2 hover:bg-white/5 disabled:opacity-30" disabled={round === "all" || idx >= rounds.length - 1} onClick={() => setRound(rounds[idx + 1].round)} aria-label="Giornata successiva" data-testid="cal-all-next"><ChevronRight className="h-4 w-4" /></button>
        </div>
        {round !== "all" && <button type="button" className="btn-ghost h-9 text-xs" onClick={() => setRound("all")} data-testid="cal-all-reset">Tutte</button>}
        <div className="sm:ml-auto flex flex-wrap gap-2">
          {cur && cur.round > 0 && <button type="button" className="btn-gold h-9" disabled={pdfBusy} onClick={() => onPdf({ category: "all", match_day: cur.round }, `FSL_Programma_Globale_Giornata${cur.round}.pdf`)} title="PDF della sola giornata selezionata, tutte le categorie insieme (una pagina per data)" data-testid="cal-all-pdf-round"><Printer className="h-4 w-4" /> {pdfBusy ? "Preparo…" : `Stampa giornata ${cur.round}`}</button>}
          <button type="button" className="btn-ghost h-9" disabled={pdfBusy} onClick={() => onPdf({ category: "all" }, "FSL_Programma_Globale.pdf")} title="PDF completo: tutte le categorie insieme, una pagina per ogni data di gioco" data-testid="cal-all-pdf-full"><FileDown className="h-4 w-4" /> {pdfBusy ? "Preparo…" : "Stampa programma globale"}</button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-xs" data-testid="cal-all-summary">
        <span className="rounded-full border border-fsl-gold/40 px-3 py-1 num">{cur ? `${roundLabel(cur)} · ` : ""}{matches.length} gare · {cur ? cur.dates.length : overview.days.length} date · {overview.calendar.fields_count} campi</span>
        {perCat.map(({ c, n }) => <span key={c} className="rounded-full border border-white/15 px-3 py-1 num" data-testid={`cal-all-cat-${c}`}><span className="text-fsl-gold font-bold">{c}</span> · {n} gare · {overview.per_category?.[c]?.match_minutes}'+{overview.per_category?.[c]?.buffer_minutes}'</span>)}
        {round === "all" && overview.days.some((d) => d.categories.length < overview.categories.length) && <span className="rounded-full border border-fsl-warning/50 text-fsl-warning px-3 py-1">Alcune date non hanno tutte le categorie</span>}
      </div>
      <p className="text-xs text-fsl-slate">Tutte le categorie insieme, come si vive il weekend al campo.{canWrite ? " Trascina una gara in uno slot libero (o su un'altra per scambiarle, anche di categoria diversa), clicca una squadra per cambiarla o la matita per modificare data, ora e campo." : ""}</p>
      <TimeGrid board={board} canWrite={canWrite} onMove={onMove} onEdit={onEdit} onBreaks={onBreaks} onSlots={onSlots} onQuickTeam={onQuickTeam} />
    </div>
  );
}
