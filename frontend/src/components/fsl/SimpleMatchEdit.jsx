import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, apiError } from "@/lib/api";

export function SimpleMatchEdit({ tid, m, teams, fields, onClose, onDone }) {
  const [f, setF] = useState({ date: m.kickoff_at.slice(0, 10), time: m.kickoff_at.slice(11, 16), field_id: m.field_id || "", home_team_id: m.home_team_id, away_team_id: m.away_team_id });
  const [busy, setBusy] = useState(false);
  const save = async (force = false) => {
    setBusy(true);
    try {
      const body = { force };
      const kickoff = `${f.date}T${f.time}`;
      if (kickoff !== m.kickoff_at) body.kickoff_at = kickoff;
      if (f.field_id && f.field_id !== m.field_id) body.field_id = f.field_id;
      if (f.home_team_id !== m.home_team_id) body.home_team_id = f.home_team_id;
      if (f.away_team_id !== m.away_team_id) body.away_team_id = f.away_team_id;
      await api.patch(`/tournaments/${tid}/groups/matches/${m.id}`, body);
      toast.success("Partita aggiornata"); onDone(); onClose();
    } catch (e) {
      if (e?.response?.status === 409 && !force && window.confirm(`${apiError(e)}\n\nSalvare comunque?`)) return save(true);
      toast.error(apiError(e));
    } finally { setBusy(false); }
  };
  const opt = (x) => <option key={x.id} value={x.id}>{x.name}{x.series && x.series !== "Fase finale" ? ` · ${x.series}` : ""}</option>;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-navy-800 border-white/20 text-fsl-white rounded-xl" aria-describedby={undefined} data-testid="simple-match-edit">
        <DialogHeader><DialogTitle className="font-display uppercase text-2xl">Modifica partita</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <label><span className="fsl-label">Squadra casa</span><select className="fsl-input mt-1" value={f.home_team_id} onChange={(e) => setF({ ...f, home_team_id: e.target.value })} data-testid="edit-home">{teams.map(opt)}</select></label>
          <label><span className="fsl-label">Squadra ospite</span><select className="fsl-input mt-1" value={f.away_team_id} onChange={(e) => setF({ ...f, away_team_id: e.target.value })} data-testid="edit-away">{teams.map(opt)}</select></label>
          <label><span className="fsl-label">Campo</span><select className="fsl-input mt-1" value={f.field_id} onChange={(e) => setF({ ...f, field_id: e.target.value })} data-testid="edit-field">{fields.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          <label><span className="fsl-label">Orario</span><input type="time" className="fsl-input mt-1" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} data-testid="edit-time" /></label>
          <label className="col-span-2"><span className="fsl-label">Data</span><input type="date" className="fsl-input mt-1" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} data-testid="edit-date" /></label>
        </div>
        <DialogFooter><button className="btn-ghost" onClick={onClose} data-testid="edit-cancel">Annulla</button><button className="btn-primary" disabled={busy || f.home_team_id === f.away_team_id} onClick={() => save(false)} data-testid="edit-save">Salva e chiudi</button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
