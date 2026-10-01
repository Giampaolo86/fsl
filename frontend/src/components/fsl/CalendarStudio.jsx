import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Pencil, Send, Wand2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FinalsDialog } from "@/components/fsl/FinalsDialog";
import { api, apiError } from "@/lib/api";

const G = (tid) => `/tournaments/${tid}/groups`;

async function withForce(fn, label = "Procedere comunque?") {
  try { return await fn(false); } catch (e) {
    const msg = apiError(e);
    if (e?.response?.status === 409 && window.confirm(`${msg}\n\n${label}`)) return fn(true);
    toast.error(msg); throw e;
  }
}

export function MatchEditDialog({ tid, m, teams, fields, comps, onClose, onDone }) {
  const [f, setF] = useState({ kickoff_at: m.kickoff_at, field_id: m.field_id || "", home_team_id: m.home_team_id, away_team_id: m.away_team_id, competition_id: m.competition_id, reason: "" });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const body = { reason: f.reason };
      Object.entries(f).forEach(([k, v]) => { if (k !== "reason" && v && v !== (m[k] || "")) body[k] = v; });
      const { data } = await withForce((force) => api.patch(`${G(tid)}/matches/${m.id}`, { ...body, force }), "Salvare comunque la modifica?");
      data.warnings?.forEach((w) => toast.warning(w));
      toast.success("Gara aggiornata"); onDone(); onClose();
    } catch (e) { /* già notificato */ } finally { setBusy(false); }
  };
  const name = (id) => teams.find((x) => x.id === id)?.name || "?";
  const cross = teams.find((x) => x.id === f.home_team_id)?.competition_id !== teams.find((x) => x.id === f.away_team_id)?.competition_id;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-navy-800 border-white/20 text-fsl-white rounded-xl" aria-describedby={undefined} data-testid="match-edit-dialog">
        <DialogHeader><DialogTitle className="font-display uppercase text-2xl">Modifica gara · {name(m.home_team_id)} – {name(m.away_team_id)}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <label className="col-span-2 sm:col-span-1"><span className="fsl-label">Data e ora</span><input type="datetime-local" className="fsl-input mt-1" value={f.kickoff_at} onChange={(e) => setF({ ...f, kickoff_at: e.target.value })} data-testid="match-edit-kickoff" /></label>
          <label className="col-span-2 sm:col-span-1"><span className="fsl-label">Campo</span><select className="fsl-input mt-1" value={f.field_id} onChange={(e) => setF({ ...f, field_id: e.target.value })} data-testid="match-edit-field">{fields.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          <label><span className="fsl-label">Casa</span><select className="fsl-input mt-1" value={f.home_team_id} onChange={(e) => setF({ ...f, home_team_id: e.target.value })} data-testid="match-edit-home">{teams.map((x) => <option key={x.id} value={x.id}>{x.name}{x.series ? ` (${x.series})` : ""}</option>)}</select></label>
          <label><span className="fsl-label">Ospite</span><select className="fsl-input mt-1" value={f.away_team_id} onChange={(e) => setF({ ...f, away_team_id: e.target.value })} data-testid="match-edit-away">{teams.map((x) => <option key={x.id} value={x.id}>{x.name}{x.series ? ` (${x.series})` : ""}</option>)}</select></label>
          <label className="col-span-2"><span className="fsl-label">Competizione / girone</span><select className="fsl-input mt-1" value={f.competition_id} onChange={(e) => setF({ ...f, competition_id: e.target.value })} data-testid="match-edit-competition">{comps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          {cross && m.stage === "qualification" && <p className="col-span-2 text-xs text-fsl-warning inline-flex items-center gap-1" data-testid="match-edit-cross-warning"><AlertTriangle className="h-3.5 w-3.5" /> Attenzione: le due squadre appartengono a gironi diversi.</p>}
          <input className="fsl-input col-span-2" placeholder="Motivazione (facoltativa, finisce nello storico)" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} data-testid="match-edit-reason" />
        </div>
        <DialogFooter><button className="btn-ghost" onClick={onClose}>Annulla</button><button className="btn-primary" disabled={busy} onClick={save} data-testid="match-edit-save">Salva</button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CalendarGrid({ list, slots, fields, onPick }) {
  const days = useMemo(() => [...new Set(list.map((m) => m.kickoff_at.slice(0, 10)))].sort(), [list]);
  const [day, setDay] = useState(days[0]);
  useEffect(() => { if (!days.includes(day)) setDay(days[0]); }, [days, day]);
  const cell = {};
  list.filter((m) => m.kickoff_at.startsWith(day || "")).forEach((m) => { (cell[`${m.kickoff_at.slice(11, 16)}|${m.field_id}`] = cell[`${m.kickoff_at.slice(11, 16)}|${m.field_id}`] || []).push(m); });
  const times = [...new Set([...slots, ...Object.keys(cell).map((k) => k.split("|")[0])])].sort();
  const label = (m) => `${m.home?.name || "?"} – ${m.away?.name || "?"}`;
  return (
    <div className="fsl-card overflow-hidden" data-testid="calendar-grid">
      <div className="flex gap-1 p-2 border-b border-white/10 overflow-x-auto">{days.map((d) => <button key={d} className={`h-9 px-3 rounded-full text-sm whitespace-nowrap ${d === day ? "bg-fsl-gold text-ink-950 font-bold" : "border border-white/15 text-fsl-white/80"}`} onClick={() => setDay(d)} data-testid={`calendar-grid-day-${d}`}>{new Date(d).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "short" })}</button>)}</div>
      <div className="overflow-x-auto"><table className="w-full table-dark text-xs" data-testid="calendar-grid-table"><thead><tr><th className="w-20">Ora</th>{fields.map((f) => <th key={f.id}>{f.name}</th>)}</tr></thead><tbody>
        {times.map((tm) => <tr key={tm}><td className="num font-bold text-fsl-gold">{tm}</td>{fields.map((f) => { const ms = cell[`${tm}|${f.id}`] || []; return <td key={f.id} className={`align-top ${ms.length > 1 ? "bg-fsl-danger/15" : ""}`}>{ms.map((m) => <button key={m.id} onClick={() => onPick(m)} className={`block w-full text-left rounded-md px-2 py-1.5 mb-1 border transition-colors hover:border-fsl-gold/70 ${m.status === "draft" ? "border-dashed border-white/25" : "border-white/10 bg-ink-950/50"}`} data-testid={`calendar-cell-${m.id}`}><span className="block font-semibold truncate">{label(m)}</span><span className="block text-[10px] text-fsl-slate truncate">{m.series} · {m.round_name}{m.status === "draft" ? " · bozza" : ""}</span></button>)}</td>; })}</tr>)}
      </tbody></table></div>
    </div>
  );
}

export function CalendarTools({ tid, groups, fields, teams, comps, onDone, draftCount, conflicts }) {
  const [bulk, setBulk] = useState(null);
  const [b, setB] = useState({ type: "set_field", scope: "date", field_id: "", date: "", competition_id: "", minutes: 35, new_date: "", from_team_id: "", to_team_id: "" });
  const [gen, setGen] = useState("");
  const generate = async () => {
    try {
      const body = gen ? { competition_ids: [gen] } : {};
      const { data } = await withForce(() => api.post(`/tournaments/${tid}/calendar/generate`, body), "");
      toast.success(`Bozza calendario: ${data.count} gare${gen ? " nel girone selezionato" : ""} · qualità ${data.quality.score}/100`);
      data.quality.warnings.forEach((w) => toast.warning(w)); onDone();
    } catch (e) { /* notificato */ }
  };
  const publish = async () => { try { const { data } = await api.post(`${G(tid)}/publish`, {}); toast.success(`${data.published} gare pubblicate`); onDone(); } catch (e) { toast.error(apiError(e)); } };
  const runBulk = async () => {
    const filter = b.scope === "date" ? { date: b.date } : b.scope === "field" ? { field_id: b.field_id } : { competition_id: b.competition_id };
    const action = b.type === "set_field" ? { type: "set_field", field_id: b.field_id } : b.type === "shift_minutes" ? { type: "shift_minutes", minutes: Number(b.minutes) } : b.type === "move_date" ? { type: "move_date", date: b.new_date } : { type: "replace_team", from_team_id: b.from_team_id, to_team_id: b.to_team_id };
    if (b.type === "replace_team") { filter.team_id = b.from_team_id; }
    try {
      const { data } = await withForce((force) => api.post(`${G(tid)}/matches/bulk`, { filter, action, force }), "Applicare comunque?");
      data.warnings?.forEach((w) => toast.warning(w)); toast.success(`${data.count} gare aggiornate`); setBulk(null); onDone();
    } catch (e) { /* notificato */ }
  };
  return (
    <>
      <div className="fsl-card px-4 py-3 flex flex-wrap items-center gap-2" data-testid="calendar-tools">
        <select className="fsl-input h-10 w-56" value={gen} onChange={(e) => setGen(e.target.value)} data-testid="calendar-generate-scope"><option value="">Tutti i gironi</option>{groups.map((g) => <option key={g.competition.id} value={g.competition.id}>Solo {g.competition.series}</option>)}</select>
        <button className="btn-gold" onClick={() => window.confirm(`Generare la bozza del calendario${gen ? " per il girone selezionato" : ""}? Le gare in bozza/programmate di quei gironi vengono sostituite, quelle giocate restano.`) && generate()} data-testid="calendar-generate-button"><Wand2 className="h-4 w-4" /> Genera calendario gironi</button>
        <button className="btn-ghost" onClick={() => setBulk(true)} data-testid="calendar-bulk-button"><Wrench className="h-4 w-4" /> Modifiche massive</button>
        <span className="ml-auto flex items-center gap-2">
          {conflicts.length > 0 ? <span className="h-9 px-3 rounded-full border border-fsl-danger/50 text-fsl-danger text-xs inline-flex items-center gap-1" data-testid="calendar-conflicts-badge"><AlertTriangle className="h-3.5 w-3.5" /> {conflicts.length} conflitti</span> : <span className="h-9 px-3 rounded-full border border-fsl-success/40 text-fsl-success text-xs inline-flex items-center gap-1" data-testid="calendar-no-conflicts"><CheckCircle2 className="h-3.5 w-3.5" /> Nessun conflitto</span>}
          {draftCount > 0 && <button className="btn-primary" onClick={publish} data-testid="calendar-publish-button"><Send className="h-4 w-4" /> Pubblica aggiornamenti ({draftCount})</button>}
        </span>
      </div>
      {conflicts.length > 0 && <ul className="fsl-card border-fsl-danger/40 p-3 space-y-1 text-xs" data-testid="calendar-conflicts-list">{conflicts.slice(0, 12).map((c, i) => <li key={i} className="text-fsl-danger inline-flex items-start gap-1 w-full"><AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> <span><b>Conflitto rilevato:</b> {c.message}</span></li>)}</ul>}
      {bulk && (
        <Dialog open onOpenChange={(o) => !o && setBulk(null)}>
          <DialogContent className="bg-navy-800 border-white/20 text-fsl-white rounded-xl" aria-describedby={undefined} data-testid="bulk-dialog">
            <DialogHeader><DialogTitle className="font-display uppercase text-2xl">Modifiche massive</DialogTitle></DialogHeader>
            <div className="grid gap-3 text-sm">
              <select className="fsl-input" value={b.type} onChange={(e) => setB({ ...b, type: e.target.value })} data-testid="bulk-type"><option value="set_field">Cambia campo</option><option value="shift_minutes">Sposta orario (minuti)</option><option value="move_date">Cambia data</option><option value="replace_team">Sostituisci squadra</option></select>
              {b.type !== "replace_team" && <div className="grid grid-cols-2 gap-2">
                <select className="fsl-input" value={b.scope} onChange={(e) => setB({ ...b, scope: e.target.value })} data-testid="bulk-scope"><option value="date">Tutte le gare del giorno…</option><option value="field">Tutte le gare del campo…</option><option value="competition">Tutte le gare del girone…</option></select>
                {b.scope === "date" && <input type="date" className="fsl-input" value={b.date} onChange={(e) => setB({ ...b, date: e.target.value })} data-testid="bulk-date" />}
                {b.scope === "field" && <select className="fsl-input" value={b.field_id} onChange={(e) => setB({ ...b, field_id: e.target.value })}><option value="">Campo…</option>{fields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>}
                {b.scope === "competition" && <select className="fsl-input" value={b.competition_id} onChange={(e) => setB({ ...b, competition_id: e.target.value })}><option value="">Girone…</option>{comps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
              </div>}
              {b.type === "set_field" && <select className="fsl-input" value={b.field_id} onChange={(e) => setB({ ...b, field_id: e.target.value })} data-testid="bulk-field"><option value="">Nuovo campo…</option>{fields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>}
              {b.type === "shift_minutes" && <input type="number" className="fsl-input num" value={b.minutes} onChange={(e) => setB({ ...b, minutes: e.target.value })} data-testid="bulk-minutes" />}
              {b.type === "move_date" && <input type="date" className="fsl-input" value={b.new_date} onChange={(e) => setB({ ...b, new_date: e.target.value })} data-testid="bulk-newdate" />}
              {b.type === "replace_team" && <div className="grid grid-cols-2 gap-2"><select className="fsl-input" value={b.from_team_id} onChange={(e) => setB({ ...b, from_team_id: e.target.value })} data-testid="bulk-from"><option value="">Sostituisci…</option>{teams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select><select className="fsl-input" value={b.to_team_id} onChange={(e) => setB({ ...b, to_team_id: e.target.value })} data-testid="bulk-to"><option value="">…con</option>{teams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>}
            </div>
            <DialogFooter><button className="btn-ghost" onClick={() => setBulk(null)}>Annulla</button><button className="btn-primary" onClick={runBulk} data-testid="bulk-apply">Applica</button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

export function FinalsPanel({ tid, board, reload, canWrite, onEdit, list }) {
  const [dlg, setDlg] = useState(null);
  if (!board) return null;
  const run = async (fn, ok) => { try { const { data } = await withForce(fn, "Procedere comunque?"); toast.success(ok(data)); reload(); } catch (e) { /* notificato */ } };
  return (
    <div className="space-y-4" data-testid="finals-panel">
      {board.finals.length === 0 && <p className="text-sm text-fsl-slate">Questo torneo non prevede una fase finale (formula campionato). Puoi aggiungerla cambiando formula in Impostazioni → Struttura.</p>}
      {board.finals.map((f) => {
        const ms = list.filter((m) => m.competition_id === f.competition.id);
        const groupsDone = board.groups.every((g) => g.complete);
        return (
          <section key={f.competition.id} className="fsl-card p-4" data-testid={`finals-${f.competition.code}`}>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <h3 className="font-display font-extrabold uppercase text-xl leading-none">{f.competition.name}</h3>
              <span className="text-xs text-fsl-slate">Prime {f.competition.finals?.qualifiers_per_group} di ogni girone · incroci 1ª–2ª{f.competition.finals?.third_place ? " · finale 3°/4°" : ""}</span>
              <span className={`ml-auto h-8 px-3 rounded-full border text-xs inline-flex items-center ${ms.length ? "border-fsl-gold/50 text-fsl-gold" : "border-white/20 text-fsl-slate"}`} data-testid="finals-state">{ms.length ? (groupsDone ? "Fase finale configurata" : "Struttura con segnaposto") : groupsDone ? "Gironi conclusi · pronta" : "Non ancora generata · in attesa dei gironi"}</span>
            </div>
            {canWrite && <div className="flex flex-wrap gap-2 mb-3">
              {!ms.length && <button className="btn-ghost" onClick={() => run(() => api.post(`${G(tid)}/finals/structure`, { competition_id: f.competition.id }), (d) => `${d.round_name}: ${d.count} gare con segnaposto «1ª Girone A»…`)} data-testid="finals-structure-button">Configura struttura (1ª Girone A, 2ª Girone B…)</button>}
              {ms.some((m) => m.home?.name?.match(/^\dª /) || m.away?.name?.match(/^\dª /)) && <button className="btn-primary" onClick={() => run((force) => api.post(`${G(tid)}/finals/resolve`, null, { params: { competition_id: f.competition.id, force } }), (d) => `${d.resolved} riferimenti risolti con le squadre reali${d.missing.length ? ` · mancanti: ${d.missing.join(", ")}` : ""}`)} data-testid="finals-resolve-button">Risolvi con le classifiche</button>}
              <button className="btn-gold" onClick={() => setDlg(f.competition)} data-testid="finals-generate-button"><Wand2 className="h-4 w-4" /> {ms.length ? "Genera / avanza turno (accoppiamenti modificabili)" : "Genera accoppiamenti dalle classifiche"}</button>
            </div>}
            {ms.length === 0 ? <p className="text-sm text-fsl-slate" data-testid="finals-empty">Non ancora generate.</p> : (
              <ul className="grid md:grid-cols-2 gap-2">{ms.map((m) => <li key={m.id} className="flex items-center gap-2 rounded-md bg-ink-950/50 px-3 h-11 text-sm" data-testid={`finals-match-${m.id}`}><span className="text-[10px] uppercase text-fsl-gold w-24 truncate">{m.round_name}</span><span className="flex-1 truncate font-semibold">{m.home?.name} – {m.away?.name}</span><span className="num text-xs text-fsl-slate">{m.kickoff_at.slice(5, 16).replace("T", " ")} · {m.field_name}</span>{canWrite && <button className="btn-ghost h-7 w-7 p-0" onClick={() => onEdit(m)} data-testid={`finals-edit-${m.id}`}><Pencil className="h-3.5 w-3.5" /></button>}</li>)}</ul>
            )}
          </section>
        );
      })}
      {dlg && <FinalsDialog tid={tid} competition={dlg} onClose={() => setDlg(null)} onDone={reload} />}
    </div>
  );
}
