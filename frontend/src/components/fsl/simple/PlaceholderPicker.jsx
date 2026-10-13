import { useMemo, useState } from "react";
import { ArrowRightLeft, Check, Search, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { ClubCrest } from "@/components/fsl/ClubCrest";
import { api, apiError } from "@/lib/api";

export function PlaceholderPicker({ tid, team, registry, unassigned, onDone, onCancel }) {
  const [q, setQ] = useState("");
  const [name, setName] = useState(team.name);
  const [busy, setBusy] = useState(false);
  const rows = useMemo(() => { const s = q.trim().toLowerCase(); return s.length < 2 ? [] : (registry || []).filter((c) => c.name.toLowerCase().includes(s) || (c.city || "").toLowerCase().includes(s)).slice(0, 6); }, [registry, q]);
  const free = (unassigned || []).filter((tm) => tm.category === team.category && !tm.placeholder);
  const assign = async (body, label) => {
    setBusy(true);
    try { const { data } = await api.post(`/tournaments/${tid}/simple/teams/${team.id}/assign`, body); toast.success(`${label} prende il posto di «${data.replaced}»`); onDone(); } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  const rename = async () => {
    setBusy(true);
    try { await api.patch(`/tournaments/${tid}/groups/teams/${team.id}`, { name: name.trim() }); toast.success("Nome aggiornato"); onDone(); } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  return (
    <li className="py-2 flex flex-col gap-2 rounded-md bg-fsl-gold/5 -mx-1 px-1" data-testid={`placeholder-picker-${team.id}`}>
      <div className="text-[11px] text-fsl-slate">Chi gioca al posto di <span className="italic">«{team.name}»</span>? Le sue {" "}gare passano alla società scelta.</div>
      <div className="relative"><Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-fsl-slate" /><input className="fsl-input h-9 text-sm pl-8" autoFocus placeholder="Cerca società nell'anagrafe FSL…" value={q} onChange={(e) => setQ(e.target.value)} data-testid={`placeholder-search-${team.id}`} /></div>
      {rows.length > 0 && (
        <ul className="rounded-md border border-white/10 divide-y divide-white/5 bg-ink-950/60" data-testid={`placeholder-results-${team.id}`}>
          {rows.map((c) => (
            <li key={c.org_key}>
              <button type="button" disabled={busy} onClick={() => assign({ org_key: c.org_key }, c.name)} className="w-full text-left px-2.5 py-1.5 flex items-center gap-2 hover:bg-white/5 text-sm" data-testid={`placeholder-pick-${team.id}-${c.org_key}`}>
                <ClubCrest club={c} size={22} />
                <span className="flex-1 min-w-0 truncate">{c.name}<span className="text-[11px] text-fsl-slate"> · {c.city || "—"}{c.manager ? <> · <UserRound className="inline h-3 w-3 text-fsl-gold" /> {c.manager.full_name || c.manager.email}</> : ""}</span></span>
                <Check className="h-3.5 w-3.5 text-fsl-gold" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.trim().length >= 2 && rows.length === 0 && <p className="text-[11px] text-fsl-warning">Nessuna società trovata: registrala prima da Società → «Aggiungi società».</p>}
      {free.length > 0 && (
        <select className="fsl-input h-9 text-xs" value="" disabled={busy} onChange={(e) => { const tm = free.find((x) => x.id === e.target.value); if (tm) assign({ team_id: tm.id }, tm.name); }} data-testid={`placeholder-unassigned-${team.id}`}>
          <option value="">…oppure una squadra fuori girone ({free.length})</option>
          {free.map((tm) => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
        </select>
      )}
      <div className="flex gap-1.5 items-center">
        <input className="fsl-input h-8 text-xs flex-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="…o rinomina il segnaposto" data-testid={`team-name-input-${team.id}`} />
        <button className="btn-ghost h-8 px-2 text-xs" disabled={busy || name.trim().length < 2 || name === team.name} onClick={rename} data-testid={`team-save-${team.id}`}><Check className="h-3.5 w-3.5" /></button>
        <button className="btn-ghost h-8 px-2 text-xs" onClick={onCancel} data-testid={`team-cancel-${team.id}`}><X className="h-3.5 w-3.5" /></button>
      </div>
      <span className="sr-only"><ArrowRightLeft className="h-3 w-3" /></span>
    </li>
  );
}
