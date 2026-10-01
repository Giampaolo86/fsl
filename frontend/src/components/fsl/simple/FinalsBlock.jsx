import { useState } from "react";
import { Users } from "lucide-react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { MatchTable } from "./CalendarBlock";

export function FinalsBlock({ tid, board, reload, canWrite, onEdit }) {
  const lastGroupDay = board.matches.length ? board.matches[board.matches.length - 1].kickoff_at.slice(0, 10) : new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({ teams: 4, date: board.finals[0]?.kickoff_at.slice(0, 10) || lastGroupDay, start_time: board.finals[0]?.kickoff_at.slice(11, 16) || "15:00", third_place: false });
  const [busy, setBusy] = useState(false);
  const generate = async () => {
    if (board.finals.length && !window.confirm("La fase finale attuale verrà sostituita. Continuare?")) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/tournaments/${tid}/simple/finals`, { ...f, teams: Number(f.teams), category: board.category });
      toast.success(`Fase finale creata: ${data.count} partite`); reload();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  const fill = async (force = false) => {
    setBusy(true);
    try {
      const { data } = await api.post(`/tournaments/${tid}/simple/finals/fill`, null, { params: { category: board.category, force } });
      toast.success(`${data.replaced} caselle compilate${data.missing.length ? ` · da definire: ${data.missing.join(", ")}` : ""}`); reload();
    } catch (e) {
      if (e?.response?.status === 409 && !force && window.confirm(`${apiError(e)}\n\nPotrai comunque correggere a mano con Modifica.`)) return fill(true);
      toast.error(apiError(e));
    } finally { setBusy(false); }
  };
  return (
    <section className="fsl-card p-5" data-testid="block-finals">
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div><div className="fsl-kicker">C</div><h2 className="font-display font-extrabold uppercase text-2xl leading-none">Fase finale</h2><p className="text-xs text-fsl-slate mt-1">Da generare quando i gironi sono finiti. Le squadre («1ª Girone A», «Vincente QF1»…) si sostituiscono con Modifica.</p></div>
        {canWrite && board.groups.length > 0 && (
          <div className="flex flex-wrap items-end gap-2 ml-auto">
            <label className="text-xs text-fsl-slate">Si parte da<select className="fsl-input h-10 w-44 mt-1" value={f.teams} onChange={(e) => setF({ ...f, teams: e.target.value })} data-testid="finals-start-select"><option value={8}>Quarti di finale (8)</option><option value={4}>Semifinali (4)</option><option value={2}>Finale (2)</option></select></label>
            <label className="text-xs text-fsl-slate">Data<input type="date" className="fsl-input h-10 w-40 mt-1" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} data-testid="finals-date" /></label>
            <label className="text-xs text-fsl-slate">Prima partita<input type="time" className="fsl-input h-10 w-28 mt-1" value={f.start_time} onChange={(e) => setF({ ...f, start_time: e.target.value })} data-testid="finals-time" /></label>
            <label className="text-xs text-fsl-slate inline-flex items-center gap-2 h-10"><input type="checkbox" checked={f.third_place} onChange={(e) => setF({ ...f, third_place: e.target.checked })} disabled={Number(f.teams) < 4} data-testid="finals-third" /> Finale 3°/4°</label>
            <button className="btn-gold h-10" disabled={busy} onClick={generate} data-testid="finals-generate-button">Genera fase finale</button>
          </div>
        )}
      </div>
      {board.finals.length === 0 ? (
        <p className="text-sm text-fsl-slate" data-testid="finals-empty">Nessuna fase finale generata.</p>
      ) : (
        <div className="space-y-3">
          {canWrite && <div className="flex flex-wrap items-center gap-3"><button className="btn-ghost h-10" disabled={busy} onClick={() => fill(false)} data-testid="finals-fill-button"><Users className="h-4 w-4" /> Inserisci le qualificate</button><span className="text-xs text-fsl-slate">Prende 1ª/2ª dalle classifiche e vincenti/perdenti dai risultati ufficiali. Puoi sempre correggere con Modifica.</span></div>}
          <MatchTable rows={board.finals} onEdit={onEdit} canWrite={canWrite} testId="finals-table" />
        </div>
      )}
    </section>
  );
}
