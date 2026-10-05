import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, apiError } from "@/lib/api";

export function SimpleMatchEdit({ tid, m, teams, fields, onClose, onDone }) {
  const [f, setF] = useState({ date: m.kickoff_at.slice(0, 10), time: m.kickoff_at.slice(11, 16), field_id: m.field_id || "", home_team_id: m.home_team_id, away_team_id: m.away_team_id, round_name: m.round_name || "", note: m.note || "", is_grand_final: !!m.is_grand_final });
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState({ home: false, away: false });
  const [names, setNames] = useState({ home: "", away: "" });
  const save = async (force = false) => {
    setBusy(true);
    try {
      const body = { force };
      const kickoff = `${f.date}T${f.time}`;
      if (kickoff !== m.kickoff_at) body.kickoff_at = kickoff;
      if (f.field_id && f.field_id !== m.field_id) body.field_id = f.field_id;
      if (custom.home) body.home_name = names.home.trim(); else if (f.home_team_id !== m.home_team_id) body.home_team_id = f.home_team_id;
      if (custom.away) body.away_name = names.away.trim(); else if (f.away_team_id !== m.away_team_id) body.away_team_id = f.away_team_id;
      if (f.round_name !== (m.round_name || "")) body.round_name = f.round_name;
      if (f.note !== (m.note || "")) body.note = f.note;
      if (f.is_grand_final !== !!m.is_grand_final) body.is_grand_final = f.is_grand_final;
      await api.patch(`/tournaments/${tid}/groups/matches/${m.id}`, body);
      toast.success("Partita aggiornata"); onDone(); onClose();
    } catch (e) {
      if (e?.response?.status === 409 && !force && window.confirm(`${apiError(e)}\n\nSalvare comunque?`)) return save(true);
      toast.error(apiError(e));
    } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!window.confirm(`Eliminare questa partita (${m.round_name || "gara"} · ${f.date} ${f.time})? L'operazione non è reversibile.`)) return;
    setBusy(true);
    try { await api.delete(`/tournaments/${tid}/simple/matches/${m.id}`); toast.success("Partita eliminata"); onDone(); onClose(); } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  const opt = (x) => <option key={x.id} value={x.id}>{x.name}{x.series && x.series !== "Fase finale" ? ` · ${x.series}` : ""}</option>;
  const CUSTOM = "__custom__";
  const sideField = (side, label, key) => (
    <label><span className="fsl-label">{label}</span>
      <select className="fsl-input mt-1" value={custom[side] ? CUSTOM : f[key]} onChange={(e) => { if (e.target.value === CUSTOM) setCustom({ ...custom, [side]: true }); else { setCustom({ ...custom, [side]: false }); setF({ ...f, [key]: e.target.value }); } }} data-testid={`edit-${side}`}>{teams.map(opt)}<option value={CUSTOM}>✎ Nome personalizzato…</option></select>
      {custom[side] && <>
        <input className="fsl-input mt-1" autoFocus placeholder="es. Perdente Semifinale 1°-4° (1)" value={names[side]} onChange={(e) => setNames({ ...names, [side]: e.target.value })} data-testid={`edit-${side}-name`} />
        <div className="mt-1 flex flex-wrap gap-1">{["Perdente SF1", "Perdente SF2", "Perdente QF1", "Perdente QF2", "Perdente QF3", "Perdente QF4", "3ª Girone A", "3ª Girone B", "4ª Girone A", "4ª Girone B"].map((n) => <button key={n} type="button" className="h-6 px-2 rounded-full border border-white/15 text-[10px] text-fsl-slate hover:border-fsl-gold hover:text-fsl-white" onClick={() => setNames({ ...names, [side]: n })} data-testid={`edit-${side}-suggest-${n}`}>{n}</button>)}</div>
      </>}
    </label>
  );
  const invalid = custom.home ? !names.home.trim() : custom.away ? !names.away.trim() : f.home_team_id === f.away_team_id;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-navy-800 border-white/20 text-fsl-white rounded-xl" aria-describedby={undefined} data-testid="simple-match-edit">
        <DialogHeader><DialogTitle className="font-display uppercase text-2xl">Modifica partita</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
          {sideField("home", "Squadra casa", "home_team_id")}
          {sideField("away", "Squadra ospite", "away_team_id")}
          <p className="col-span-2 text-[11px] text-fsl-slate -mt-1">Scegli una squadra o un segnaposto esistente, oppure «Nome personalizzato» per scrivere un nome libero (es. <i>Perdente SF1</i> per gli scontri di piazzamento). Potrai sostituirlo con la squadra vera appena nota.</p>
          <label><span className="fsl-label">Campo</span><select className="fsl-input mt-1" value={f.field_id} onChange={(e) => setF({ ...f, field_id: e.target.value })} data-testid="edit-field">{fields.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          <label><span className="fsl-label">Orario</span><input type="time" className="fsl-input mt-1" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} data-testid="edit-time" /></label>
          <label className="col-span-2"><span className="fsl-label">Data</span><input type="date" className="fsl-input mt-1" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} data-testid="edit-date" /></label>
          <label><span className="fsl-label">Nome gara</span><input className="fsl-input mt-1" placeholder="es. Finale 5°/6° posto" value={f.round_name} onChange={(e) => setF({ ...f, round_name: e.target.value })} data-testid="edit-round" /></label>
          <label><span className="fsl-label">Commento</span><input className="fsl-input mt-1" placeholder="es. Premiazione a seguire" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} data-testid="edit-note" /></label>
          {m.stage === "finals" && <label className="col-span-2 inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={f.is_grand_final} onChange={(e) => setF({ ...f, is_grand_final: e.target.checked })} data-testid="edit-grand-final" /> ★ Questa è la <b>finalissima</b> (una sola per categoria)</label>}
        </div>
        <DialogFooter className="sm:justify-between gap-2"><button className="btn-ghost text-fsl-danger sm:mr-auto" disabled={busy} onClick={remove} data-testid="edit-delete"><Trash2 className="h-4 w-4" /> Elimina partita</button><button className="btn-ghost" onClick={onClose} data-testid="edit-cancel">Annulla</button><button className="btn-primary" disabled={busy || invalid} onClick={() => save(false)} data-testid="edit-save">Salva e chiudi</button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
