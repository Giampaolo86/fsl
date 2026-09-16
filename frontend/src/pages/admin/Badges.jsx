import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { BadgeChip } from "@/components/fsl/BadgeChips";
import { PlayerCardDialog } from "@/components/fsl/PlayerCard";
import { SectionTitle } from "@/components/fsl/Primitives";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, apiError } from "@/lib/api";
import { fmtDate } from "@/lib/format";

export function BadgesAdmin({ tournamentId, canManage }) {
  const [list, setList] = useState(null);
  const [scope, setScope] = useState("");
  const [players, setPlayers] = useState([]);
  const [open, setOpen] = useState(false);
  const [openPlayer, setOpenPlayer] = useState(null);
  const [form, setForm] = useState({ player_id: "", label: "", note: "" });
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.get(`/tournaments/${tournamentId}/badges`, { params: scope ? { scope } : {} }).then((r) => setList(r.data)), [tournamentId, scope]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (canManage) Promise.all([api.get(`/tournaments/${tournamentId}/players`), api.get(`/tournaments/${tournamentId}/teams`)]).then(([p, t]) => { const tn = Object.fromEntries(t.data.map((x) => [x.id, x.name])); const seen = new Set(); const out = []; for (const x of p.data) { const key = `${x.first_name}|${x.last_name}|${x.team_id}`.toLowerCase(); if (seen.has(key)) continue; seen.add(key); out.push({ id: x.id, label: `${x.last_name} ${x.first_name}`, team: tn[x.team_id] || "", shirt: x.shirt_number }); } out.sort((a, b) => a.label.localeCompare(b.label) || a.team.localeCompare(b.team)); setPlayers(out); }).catch(() => {}); }, [tournamentId, canManage]);
  const [pq, setPq] = useState("");
  const options = players.filter((p) => !pq || `${p.label} ${p.team}`.toLowerCase().includes(pq.toLowerCase()));
  const fetchCard = useCallback((pid) => api.get(`/tournaments/${tournamentId}/players/${pid}/card`), [tournamentId]);
  const act = async (fn, ok) => { setBusy(true); try { await fn(); toast.success(ok); load(); } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); } };
  const recompute = () => act(async () => { const r = await api.post(`/tournaments/${tournamentId}/badges/recompute`); toast.message(`+${r.data.added} / −${r.data.removed} · ${r.data.total} badge attivi`); }, "Badge ricalcolati dai dati ufficiali");
  const assign = () => act(async () => { await api.post(`/tournaments/${tournamentId}/badges/manual`, form); setOpen(false); setForm({ player_id: "", label: "", note: "" }); }, "Premio speciale assegnato");
  const remove = (b) => act(() => api.delete(`/tournaments/${tournamentId}/badges/${b.id}`), "Premio rimosso");
  const counts = (list || []).reduce((acc, b) => { acc[b.scope] = (acc[b.scope] || 0) + 1; return acc; }, {});
  return (
    <section data-testid="badges-admin">
      <SectionTitle right={<div className="flex items-center gap-2">
        <select className="fsl-input h-9 w-36" value={scope} onChange={(e) => setScope(e.target.value)} data-testid="badges-scope-filter"><option value="">Tutti</option><option value="match">Gara</option><option value="season">Stagione</option><option value="career">Carriera</option></select>
        {canManage && <button className="btn-ghost h-9" disabled={busy} onClick={recompute} data-testid="badges-recompute"><RefreshCw className="h-4 w-4" /> Ricalcola</button>}
        {canManage && <button className="btn-gold h-9" onClick={() => setOpen(true)} data-testid="badges-manual-open"><Plus className="h-4 w-4" /> Premio speciale</button>}
      </div>}>Badge e premi</SectionTitle>
      <p className="text-xs text-fsl-slate mb-3 num">Assegnati automaticamente all'ufficializzazione e ricalcolati dopo ogni rettifica · {counts.match || 0} gara · {counts.season || 0} stagione · {counts.career || 0} carriera</p>
      <div className="fsl-card divide-y divide-white/[0.06] max-h-[520px] overflow-y-auto" data-testid="badges-list">
        {list?.length === 0 && <p className="p-6 text-center text-sm text-fsl-slate">Nessun badge: si sbloccano con le gare ufficiali.</p>}
        {(list || []).map((b) => (
          <div key={b.id} className="h-12 px-3 flex items-center gap-3 text-sm" data-testid={`badge-row-${b.id}`}>
            <BadgeChip b={b} small />
            <button onClick={() => setOpenPlayer(b.player_id)} className="font-semibold truncate hover:text-fsl-gold" data-testid={`badge-player-${b.id}`}>{b.player_name}</button>
            <span className="text-xs text-fsl-slate truncate hidden sm:inline">{b.team_name}</span>
            {b.value != null && <span className="num text-xs text-fsl-blue-light">{b.value}</span>}
            <span className="ml-auto text-xs text-fsl-slate num shrink-0">{b.earned_at ? fmtDate(b.earned_at) : ""}</span>
            {canManage && b.manual && <button className="text-fsl-danger" onClick={() => remove(b)} aria-label="Rimuovi premio" data-testid={`badge-delete-${b.id}`}><Trash2 className="h-4 w-4" /></button>}
          </div>
        ))}
      </div>
      <PlayerCardDialog playerId={openPlayer} onClose={() => setOpenPlayer(null)} fetcher={fetchCard} />
      <Dialog open={open} onOpenChange={setOpen}><DialogContent className="bg-navy-800 border-white/20 text-fsl-white rounded-xl" aria-describedby={undefined} data-testid="manual-badge-dialog">
        <DialogHeader><DialogTitle className="font-display uppercase text-2xl">Premio speciale</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <input className="fsl-input" placeholder="Cerca giocatore o squadra…" value={pq} onChange={(e) => setPq(e.target.value)} data-testid="manual-badge-search" />
          <select className="fsl-input" value={form.player_id} onChange={(e) => setForm({ ...form, player_id: e.target.value })} data-testid="manual-badge-player"><option value="">Giocatore… ({options.length})</option>{options.map((p) => <option key={p.id} value={p.id}>{p.label} · {p.team}{p.shirt != null ? ` · n. ${p.shirt}` : ""}</option>)}</select>
          <input className="fsl-input" placeholder="Nome del premio (es. Fair Play del Direttore)" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} data-testid="manual-badge-label" />
          <input className="fsl-input" placeholder="Motivazione (opzionale)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} data-testid="manual-badge-note" />
        </div>
        <DialogFooter><button className="btn-ghost" onClick={() => setOpen(false)}>Annulla</button><button className="btn-gold" disabled={!form.player_id || !form.label || busy} onClick={assign} data-testid="manual-badge-save">Assegna</button></DialogFooter>
      </DialogContent></Dialog>
    </section>
  );
}
