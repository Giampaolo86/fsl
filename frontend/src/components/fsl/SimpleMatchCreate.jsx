import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, apiError } from "@/lib/api";

const NEW = "__new__";

export function SimpleMatchCreate({ tid, board, defaults = {}, onClose, onDone }) {
  const today = board.matches[board.matches.length - 1]?.kickoff_at.slice(0, 10) || new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({ stage: defaults.stage || "finals", competition_id: defaults.competition_id || "", home_team_id: NEW, away_team_id: NEW, home_name: "", away_name: "", date: defaults.date || today, time: defaults.time || "15:00", field_id: defaults.field_id || board.fields[0]?.id || "", round_name: defaults.stage === "qualification" ? "" : "Finale", note: "", is_grand_final: false });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const save = async (force = false) => {
    setBusy(true);
    try {
      const body = { ...f, category: board.category, force, home_team_id: f.home_team_id === NEW ? null : f.home_team_id, away_team_id: f.away_team_id === NEW ? null : f.away_team_id, competition_id: f.stage === "qualification" ? f.competition_id || null : null, field_id: f.field_id || null };
      const { data } = await api.post(`/tournaments/${tid}/simple/matches`, body);
      toast.success(data.warnings?.length ? `Partita creata · ${data.warnings[0]}` : "Partita creata"); onDone(); onClose();
    } catch (e) {
      if (e?.response?.status === 409 && !force && window.confirm(`${apiError(e)}\n\nCreare comunque?`)) return save(true);
      toast.error(apiError(e));
    } finally { setBusy(false); }
  };
  const teamOpts = board.teams.map((x) => <option key={x.id} value={x.id}>{x.name}{x.series && x.series !== "Fase finale" ? ` · ${x.series}` : ""}</option>);
  const TeamPick = ({ side }) => (
    <label><span className="fsl-label">Squadra {side === "home" ? "casa" : "ospite"}</span>
      <select className="fsl-input mt-1" value={f[`${side}_team_id`]} onChange={set(`${side}_team_id`)} data-testid={`create-${side}`}><option value={NEW}>✎ Scrivi un nome / segnaposto…</option>{teamOpts}</select>
      {f[`${side}_team_id`] === NEW && <input className="fsl-input mt-1" placeholder={side === "home" ? "es. Vincente spareggio" : "es. Da definire"} value={f[`${side}_name`]} onChange={set(`${side}_name`)} data-testid={`create-${side}-name`} />}
    </label>
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-navy-800 border-white/20 text-fsl-white rounded-xl max-w-lg" aria-describedby={undefined} data-testid="simple-match-create">
        <DialogHeader><DialogTitle className="font-display uppercase text-2xl">Nuova partita</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <label className="col-span-2"><span className="fsl-label">Dove va</span>
            <div className="mt-1 flex gap-2">
              <select className="fsl-input" value={f.stage} onChange={set("stage")} data-testid="create-stage"><option value="finals">Fase finale</option><option value="qualification">Girone</option></select>
              {f.stage === "qualification" && <select className="fsl-input" value={f.competition_id} onChange={set("competition_id")} data-testid="create-group"><option value="">Scegli girone…</option>{board.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>}
            </div>
          </label>
          <TeamPick side="home" />
          <TeamPick side="away" />
          <label><span className="fsl-label">Data</span><input type="date" className="fsl-input mt-1" value={f.date} onChange={set("date")} data-testid="create-date" /></label>
          <label><span className="fsl-label">Orario</span><input type="time" className="fsl-input mt-1" value={f.time} onChange={set("time")} data-testid="create-time" /></label>
          <label><span className="fsl-label">Campo</span><select className="fsl-input mt-1" value={f.field_id} onChange={set("field_id")} data-testid="create-field"><option value="">— senza campo —</option>{board.fields.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          <label><span className="fsl-label">Nome gara</span><input className="fsl-input mt-1" placeholder="es. Finale 5°/6° posto" value={f.round_name} onChange={set("round_name")} data-testid="create-round" /></label>
          <label className="col-span-2"><span className="fsl-label">Commento (visibile nel programma)</span><input className="fsl-input mt-1" placeholder="es. Premiazione a seguire · portare 2 mute" value={f.note} onChange={set("note")} data-testid="create-note" /></label>
          {f.stage === "finals" && <label className="col-span-2 inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={f.is_grand_final} onChange={set("is_grand_final")} data-testid="create-grand-final" /> ★ Questa è la <b>finalissima</b> (una sola per categoria)</label>}
        </div>
        <DialogFooter><button className="btn-ghost" onClick={onClose} data-testid="create-cancel">Annulla</button><button className="btn-primary" disabled={busy || (f.stage === "qualification" && !f.competition_id) || (f.home_team_id !== NEW && f.home_team_id === f.away_team_id)} onClick={() => save(false)} data-testid="create-save">{busy ? "Creo…" : "Crea partita"}</button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
