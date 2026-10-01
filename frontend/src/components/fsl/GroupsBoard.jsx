import { useEffect, useState } from "react";
import { AlertTriangle, Dice5, Pencil, Plus, Shuffle, Users } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, apiError } from "@/lib/api";

export const STATE_LABEL = { draft: "Bozza", groups_ready: "Gironi configurati", calendar_draft: "Calendario in bozza", calendar_published: "Calendario pubblicato", groups_running: "Fase a gironi in corso", groups_done: "Gironi conclusi", finals_ready: "Fase finale configurata", finals_running: "Fase finale in corso", completed: "Torneo concluso" };
const TEAM_STATUS = { active: null, withdrawn: ["Ritirata", "text-fsl-warning border-fsl-warning/50"], disqualified: ["Squalificata", "text-fsl-danger border-fsl-danger/50"] };

export function useBoard(tid, category) {
  const [board, setBoard] = useState(null);
  const load = () => { if (!tid) return; api.get(`/tournaments/${tid}/groups/board`, { params: category ? { category } : {} }).then((r) => setBoard(r.data)).catch((e) => toast.error(apiError(e))); };
  useEffect(() => { load(); }, [tid, category]); // eslint-disable-line react-hooks/exhaustive-deps
  return [board, load];
}

function TeamEditDialog({ tid, team, groups, clubs, onClose, onDone }) {
  const [form, setForm] = useState({ name: team.name, club_id: "", status: team.status, competition_id: team.competition_id || "", reason: "" });
  const [busy, setBusy] = useState(false);
  const save = async (force = false) => {
    setBusy(true);
    try {
      const body = { force, reason: form.reason };
      if (form.name !== team.name) body.name = form.name;
      if (form.club_id) body.club_id = form.club_id;
      if (form.status !== team.status) body.status = form.status;
      if (form.competition_id !== (team.competition_id || "")) body.competition_id = form.competition_id;
      await api.patch(`/tournaments/${tid}/groups/teams/${team.id}`, body);
      toast.success("Squadra aggiornata: le gare già create restano invariate"); onDone(); onClose();
    } catch (e) {
      const msg = apiError(e);
      if (e?.response?.status === 409 && msg.includes("programmate") && window.confirm(`${msg}\n\nProcedere comunque?`)) return save(true);
      toast.error(msg);
    } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!window.confirm(`Rimuovere «${team.name}» con le sue gare in programma? Le gare giocate bloccano l'operazione.`)) return;
    try { await api.delete(`/tournaments/${tid}/teams/${team.id}`); toast.success("Squadra rimossa"); onDone(); onClose(); } catch (e) { toast.error(apiError(e)); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-navy-800 border-white/20 text-fsl-white rounded-xl" aria-describedby={undefined} data-testid="team-edit-dialog">
        <DialogHeader><DialogTitle className="font-display uppercase text-2xl">Modifica / Sostituisci · {team.name}</DialogTitle></DialogHeader>
        <div className="grid gap-3 text-sm">
          <label><span className="fsl-label">Nome {team.placeholder ? "(segnaposto)" : ""}</span><input className="fsl-input mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="team-edit-name" /></label>
          <label><span className="fsl-label">Collega / sostituisci con società reale</span>
            <select className="fsl-input mt-1" value={form.club_id} onChange={(e) => setForm({ ...form, club_id: e.target.value })} data-testid="team-edit-club"><option value="">— nessuna modifica —</option>{clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <span className="text-xs text-fsl-slate">Le gare, gli slot e i campi già creati si aggiornano da soli con il nuovo nome.</span></label>
          <label><span className="fsl-label">Girone</span><select className="fsl-input mt-1" value={form.competition_id} onChange={(e) => setForm({ ...form, competition_id: e.target.value })} data-testid="team-edit-group"><option value="">Non assegnata</option>{groups.map((g) => <option key={g.competition.id} value={g.competition.id}>{g.competition.series}</option>)}</select></label>
          <label><span className="fsl-label">Stato</span><select className="fsl-input mt-1" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} data-testid="team-edit-status"><option value="active">Attiva</option><option value="withdrawn">Ritirata</option><option value="disqualified">Squalificata</option></select></label>
          {(form.status !== team.status) && <input className="fsl-input" placeholder="Motivazione (obbligatoria)" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} data-testid="team-edit-reason" />}
        </div>
        <DialogFooter className="flex-wrap gap-2">
          <button className="btn-ghost text-fsl-danger mr-auto" onClick={remove} data-testid="team-edit-remove">Rimuovi</button>
          <button className="btn-ghost" onClick={onClose}>Annulla</button>
          <button className="btn-primary" disabled={busy} onClick={() => save(false)} data-testid="team-edit-save">Salva</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function GroupsBoard({ tid, category, board, reload, canWrite }) {
  const [clubs, setClubs] = useState([]);
  const [edit, setEdit] = useState(null);
  const [preview, setPreview] = useState(null);
  const [count, setCount] = useState(0);
  useEffect(() => { api.get(`/tournaments/${tid}/clubs`).then((r) => setClubs(r.data)).catch(() => {}); }, [tid]);
  if (!board) return null;
  const groups = board.groups;
  const needed = groups.reduce((a, g) => a + Math.max(0, (g.competition.teams_count || 0) - g.teams.length), 0);
  const placeholders = async () => {
    try {
      const n = Number(count) || 0;
      const { data } = await api.post(`/tournaments/${tid}/groups/placeholders`, n > 0 ? { category, count: n } : { category, fill_groups: true });
      toast.success(`${data.length} squadre segnaposto create`); reload();
    } catch (e) { toast.error(apiError(e)); }
  };
  const distribute = async (mode) => {
    try { const { data } = await api.post(`/tournaments/${tid}/groups/distribute/preview`, { category, mode }); setPreview({ mode, ...data }); } catch (e) { toast.error(apiError(e)); }
  };
  const confirm = async (force = false) => {
    try {
      const { data } = await api.post(`/tournaments/${tid}/groups/assign`, { assignments: preview.assignments, force });
      toast.success(`${data.moved} squadre assegnate${data.matches_removed ? ` · ${data.matches_removed} gare rimosse` : ""}`); setPreview(null); reload();
    } catch (e) {
      const msg = apiError(e);
      if (e?.response?.status === 409 && window.confirm(`${msg}\n\nConfermare comunque?`)) return confirm(true);
      toast.error(msg);
    }
  };
  const move = async (teamId, compId) => {
    try { await api.post(`/tournaments/${tid}/groups/assign`, { assignments: [{ team_id: teamId, competition_id: compId }] }); reload(); } catch (e) {
      const msg = apiError(e);
      if (e?.response?.status === 409 && window.confirm(`${msg}\n\nSpostare comunque?`)) { await api.post(`/tournaments/${tid}/groups/assign`, { assignments: [{ team_id: teamId, competition_id: compId }], force: true }); reload(); } else toast.error(msg);
    }
  };
  const TeamRow = ({ tm, g }) => {
    const st = TEAM_STATUS[tm.status];
    return (
      <li className="flex items-center gap-2 h-10 px-2 rounded-md bg-ink-950/50 text-sm" draggable={canWrite} onDragStart={(e) => e.dataTransfer.setData("team", tm.id)} data-testid={`group-team-${tm.id}`}>
        <span className={`flex-1 truncate ${tm.placeholder ? "text-fsl-slate italic" : "font-semibold"}`}>{tm.name}</span>
        {st && <span className={`h-6 px-2 rounded-full border text-[10px] font-bold ${st[1]}`}>{st[0]}</span>}
        {tm.matches > 0 && <span className="text-[10px] text-fsl-slate num">{tm.matches} gare</span>}
        {canWrite && <select className="fsl-input h-7 w-24 text-xs px-1" value={g?.competition.id || ""} onChange={(e) => move(tm.id, e.target.value)} aria-label="Sposta nel girone" data-testid={`group-team-move-${tm.id}`}><option value="">—</option>{groups.map((x) => <option key={x.competition.id} value={x.competition.id}>{x.competition.series}</option>)}</select>}
        {canWrite && <button className="btn-ghost h-7 w-7 p-0" onClick={() => setEdit(tm)} title="Modifica / Sostituisci" data-testid={`group-team-edit-${tm.id}`}><Pencil className="h-3.5 w-3.5" /></button>}
      </li>
    );
  };
  return (
    <div className="space-y-4" data-testid="groups-board">
      {canWrite && (
        <div className="fsl-card px-4 py-3 flex flex-wrap items-center gap-2">
          <input type="number" min="0" className="fsl-input h-10 w-24 num" value={count} onChange={(e) => setCount(e.target.value)} aria-label="Numero segnaposto" data-testid="groups-placeholder-count" />
          <button className="btn-ghost" onClick={placeholders} data-testid="groups-create-placeholders"><Plus className="h-4 w-4" /> {Number(count) > 0 ? `Crea ${count} segnaposto` : `Completa i gironi con segnaposto${needed ? ` (${needed})` : ""}`}</button>
          <button className="btn-ghost" onClick={() => distribute("auto")} data-testid="groups-distribute-auto"><Shuffle className="h-4 w-4" /> Distribuisci automaticamente</button>
          <button className="btn-ghost" onClick={() => distribute("random")} data-testid="groups-distribute-random"><Dice5 className="h-4 w-4" /> Sorteggio casuale</button>
          <span className="ml-auto text-xs text-fsl-slate">Trascina una squadra su un girone oppure usa il menu accanto al nome</span>
        </div>
      )}
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
        {groups.map((g) => (
          <section key={g.competition.id} className="fsl-card p-4" onDragOver={(e) => canWrite && e.preventDefault()} onDrop={(e) => { const id = e.dataTransfer.getData("team"); if (id) move(id, g.competition.id); }} data-testid={`group-${g.competition.code}`}>
            <div className="flex items-center justify-between mb-2"><h3 className="font-display font-extrabold uppercase text-xl leading-none">{g.competition.series}</h3><span className="text-xs text-fsl-slate num">{g.teams.length}/{g.competition.teams_count} · {g.matches.total} gare{g.matches.draft ? ` (${g.matches.draft} bozza)` : ""}</span></div>
            <ul className="space-y-1.5">{g.teams.map((tm) => <TeamRow key={tm.id} tm={tm} g={g} />)}{g.teams.length === 0 && <li className="text-xs text-fsl-slate py-3 text-center border border-dashed border-white/15 rounded-md">Trascina qui le squadre</li>}</ul>
          </section>
        ))}
      </div>
      {board.unassigned.length > 0 && (
        <section className="fsl-card p-4 border-fsl-warning/40" onDragOver={(e) => canWrite && e.preventDefault()} onDrop={(e) => { const id = e.dataTransfer.getData("team"); if (id) move(id, ""); }} data-testid="groups-unassigned">
          <h3 className="font-display font-extrabold uppercase text-xl leading-none mb-2 inline-flex items-center gap-2"><Users className="h-5 w-5 text-fsl-warning" /> Non assegnate <span className="text-fsl-slate text-sm font-sans normal-case">· {board.unassigned.length}</span></h3>
          <ul className="grid md:grid-cols-2 xl:grid-cols-4 gap-1.5">{board.unassigned.map((tm) => <TeamRow key={tm.id} tm={tm} g={null} />)}</ul>
        </section>
      )}
      {preview && (
        <Dialog open onOpenChange={(o) => !o && setPreview(null)}>
          <DialogContent className="bg-navy-800 border-white/20 text-fsl-white rounded-xl max-w-3xl" aria-describedby={undefined} data-testid="groups-preview-dialog">
            <DialogHeader><DialogTitle className="font-display uppercase text-2xl">{preview.mode === "random" ? "Sorteggio casuale" : "Distribuzione automatica"} · anteprima</DialogTitle></DialogHeader>
            <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3 text-sm">
              {preview.groups.map((g) => <div key={g.id} className="rounded-lg bg-ink-950/50 p-3"><div className="font-display font-extrabold uppercase text-lg mb-1">{g.series}</div><ol className="space-y-1 text-fsl-white/85">{preview.assignments.filter((a) => a.competition_id === g.id).map((a) => <li key={a.team_id} className={a.placeholder ? "italic text-fsl-slate" : ""}>{a.team_name}</li>)}</ol></div>)}
            </div>
            <p className="text-xs text-fsl-warning inline-flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Le squadre che cambiano girone perdono le gare programmate (mai quelle giocate).</p>
            <DialogFooter className="flex-wrap gap-2">
              <button className="btn-ghost" onClick={() => setPreview(null)}>Annulla</button>
              {preview.mode === "random" && <button className="btn-ghost" onClick={() => distribute("random")} data-testid="groups-preview-repeat"><Dice5 className="h-4 w-4" /> Ripeti sorteggio</button>}
              <button className="btn-primary" onClick={() => confirm(false)} data-testid="groups-preview-confirm">{preview.mode === "random" ? "Conferma sorteggio" : "Conferma"}</button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {edit && <TeamEditDialog tid={tid} team={edit} groups={groups} clubs={clubs} onClose={() => setEdit(null)} onDone={reload} />}
    </div>
  );
}
