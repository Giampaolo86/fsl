import { useState } from "react";
import { ArrowRightLeft, Check, Pencil, Shuffle, X } from "lucide-react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";

function TeamRow({ tid, team, groups, clubs, onDone, canWrite }) {
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(team.name);
  const [clubId, setClubId] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api.patch(`/tournaments/${tid}/groups/teams/${team.id}`, clubId ? { club_id: clubId } : { name: name.trim() });
      toast.success("Nome aggiornato: tutte le partite sono allineate"); setEdit(false); onDone();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  const move = async (gid) => {
    if (!gid) return;
    try {
      const { data } = await api.post(`/tournaments/${tid}/simple/teams/${team.id}/move`, { competition_id: gid });
      toast.success(data.regenerated ? "Squadra spostata · calendario rigenerato" : "Squadra spostata"); onDone();
    } catch (e) { toast.error(apiError(e)); }
  };
  if (edit) {
    return (
      <li className="py-1.5 flex flex-col gap-1.5" data-testid={`team-edit-${team.id}`}>
        <input className="fsl-input h-9 text-sm" value={name} onChange={(e) => { setName(e.target.value); setClubId(""); }} placeholder="Nome squadra" autoFocus data-testid={`team-name-input-${team.id}`} />
        {clubs.length > 0 && <select className="fsl-input h-9 text-xs" value={clubId} onChange={(e) => setClubId(e.target.value)} data-testid={`team-club-select-${team.id}`}><option value="">…oppure scegli una società registrata</option>{clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
        <div className="flex gap-1.5">
          <button className="btn-gold h-8 px-3 text-xs" disabled={busy || (!clubId && name.trim().length < 2)} onClick={save} data-testid={`team-save-${team.id}`}><Check className="h-3.5 w-3.5" /> Salva</button>
          <button className="btn-ghost h-8 px-3 text-xs" onClick={() => { setEdit(false); setName(team.name); }} data-testid={`team-cancel-${team.id}`}><X className="h-3.5 w-3.5" /></button>
        </div>
      </li>
    );
  }
  return (
    <li className="py-1.5 flex items-center gap-2 group" data-testid={`team-row-${team.id}`}>
      {team.crest_url && <img src={team.crest_url} alt="" className="h-5 w-5 rounded-full object-cover" />}
      <button type="button" className={`flex-1 text-left text-sm truncate hover:text-fsl-gold ${team.placeholder ? "text-fsl-slate italic" : "font-semibold"}`} onClick={() => canWrite && setEdit(true)} title="Clicca per rinominare o sostituire con la squadra reale" data-testid={`team-name-${team.id}`}>
        {team.name} {canWrite && <Pencil className="inline h-3 w-3 opacity-0 group-hover:opacity-70" aria-hidden="true" />}
      </button>
      {canWrite && groups.length > 1 && (
        <select className="fsl-input h-7 w-24 text-[11px] py-0 px-1 opacity-60 group-hover:opacity-100" value="" onChange={(e) => move(e.target.value)} aria-label="Sposta in" data-testid={`team-move-${team.id}`}>
          <option value="">Sposta…</option>
          {groups.filter((g) => g.id !== team.competition_id).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      )}
    </li>
  );
}

export function GroupsBlock({ tid, board, reload, canWrite }) {
  const [n, setN] = useState(board.groups.length || 2);
  const [size, setSize] = useState(board.groups[0]?.size || 4);
  const [busy, setBusy] = useState(false);
  const run = async (fn, ok) => { setBusy(true); try { await fn(); toast.success(ok); reload(); } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); } };
  const create = () => {
    if (board.matches.length && !window.confirm("Il calendario esistente dei gironi verrà eliminato (le squadre e i nomi restano). Continuare?")) return;
    run(() => api.post(`/tournaments/${tid}/simple/groups`, { category: board.category, groups: Number(n), teams_per_group: Number(size) }), "Gironi pronti");
  };
  const shuffle = () => {
    if (board.matches.length && !window.confirm("Sorteggiando, il calendario dei gironi verrà eliminato: dovrai rigenerarlo. Continuare?")) return;
    run(() => api.post(`/tournaments/${tid}/simple/groups/shuffle`, null, { params: { category: board.category } }), "Gironi sorteggiati");
  };
  return (
    <section className="fsl-card p-5" data-testid="block-groups">
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div><div className="fsl-kicker">A</div><h2 className="font-display font-extrabold uppercase text-2xl leading-none">Gironi</h2></div>
        {canWrite && (
          <div className="flex flex-wrap items-end gap-2 ml-auto">
            <label className="text-xs text-fsl-slate">Gironi<input type="number" min="1" max="26" className="fsl-input h-10 w-20 mt-1" value={n} onChange={(e) => setN(e.target.value)} data-testid="groups-count-input" /></label>
            <label className="text-xs text-fsl-slate">Squadre per girone<input type="number" min="2" max="20" className="fsl-input h-10 w-24 mt-1" value={size} onChange={(e) => setSize(e.target.value)} data-testid="groups-size-input" /></label>
            <button className="btn-gold h-10" disabled={busy} onClick={create} data-testid="groups-create-button">Crea gironi</button>
            {board.groups.length > 0 && <button className="btn-ghost h-10" disabled={busy} onClick={shuffle} data-testid="groups-shuffle-button"><Shuffle className="h-4 w-4" /> Sorteggia gironi</button>}
          </div>
        )}
      </div>
      {board.groups.length === 0 ? (
        <p className="text-sm text-fsl-slate" data-testid="groups-empty">Scegli quanti gironi e quante squadre per girone, poi premi «Crea gironi»: le squadre «Squadra 1, 2, 3…» sono segnaposto che sostituirai con i nomi reali cliccandoci sopra.</p>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3" data-testid="groups-grid">
          {board.groups.map((g) => (
            <div key={g.id} className="rounded-lg border border-white/10 bg-ink-950/40 p-3" data-testid={`group-card-${g.name.replace(/\s+/g, "-")}`}>
              <div className="flex items-center justify-between mb-1"><div className="font-display font-extrabold uppercase text-fsl-gold">{g.name}</div><span className="text-[11px] text-fsl-slate num">{g.teams.length} squadre</span></div>
              <ul className="divide-y divide-white/[0.06]">{g.teams.map((tm) => <TeamRow key={tm.id} tid={tid} team={tm} groups={board.groups} clubs={board.clubs} onDone={reload} canWrite={canWrite} />)}</ul>
            </div>
          ))}
        </div>
      )}
      {board.unassigned.length > 0 && (
        <div className="mt-3 text-xs text-fsl-slate flex flex-wrap items-center gap-2" data-testid="groups-unassigned">
          <ArrowRightLeft className="h-3.5 w-3.5" /> Fuori dai gironi: {board.unassigned.map((tm) => <TeamRow key={tm.id} tid={tid} team={tm} groups={board.groups} clubs={board.clubs} onDone={reload} canWrite={canWrite} />)}
        </div>
      )}
    </section>
  );
}
