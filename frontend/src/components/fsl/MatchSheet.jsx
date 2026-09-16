import { ClubCrest } from "@/components/fsl/ClubCrest";
import { SheetRow } from "@/components/fsl/SheetRow";
import { bonusFor, scoreFromStats } from "@/lib/fanta";

const NEXT = { undefined: "present", null: "present", present: "absent", absent: null };

export function MatchSheet({ m, mode, callups, sheet, onCallups, onSheet, canEdit, onOpen }) {
  const score = scoreFromStats(sheet.stats, callups);
  const toggleCallup = (side) => (pid) => onCallups({ ...callups, [side]: callups[side].includes(pid) ? callups[side].filter((x) => x !== pid) : [...callups[side], pid] });
  const cycle = (pid) => { const next = NEXT[sheet.attendance[pid]]; const attendance = { ...sheet.attendance }; if (next) attendance[pid] = next; else delete attendance[pid]; onSheet({ ...sheet, attendance }); };
  const vote = (pid, d) => onSheet({ ...sheet, ratings: { ...sheet.ratings, [pid]: Math.min(10, Math.max(4, (sheet.ratings[pid] ?? 6) + d)) } });
  const stat = (pid, k, d) => {
    const stats = { ...sheet.stats };
    if (k === "mvp" && d > 0) Object.keys(stats).forEach((o) => { if (o !== pid && stats[o]?.mvp) stats[o] = { ...stats[o], mvp: 0 }; });
    const st = { ...(stats[pid] || {}) }; st[k] = Math.max(0, (st[k] || 0) + d); if (k === "mvp" && st[k] > 1) st[k] = 1;
    onSheet({ ...sheet, stats: { ...stats, [pid]: st } });
  };
  const allPresent = (side) => { const attendance = { ...sheet.attendance }; (callups[side] || []).forEach((pid) => { attendance[pid] = "present"; }); onSheet({ ...sheet, attendance }); };

  return (
    <div className="grid md:grid-cols-2 gap-3" data-testid={`match-sheet-${mode}`}>
      {["home", "away"].map((side) => {
        const ids = callups[side] || [];
        const conceded = side === "home" ? score.away : score.home;
        const counts = ids.reduce((c, pid) => { const a = sheet.attendance[pid]; c[a === "present" ? "present" : a === "absent" ? "absent" : "pending"]++; return c; }, { present: 0, absent: 0, pending: 0 });
        const editable = canEdit(side);
        return (
          <div key={side} className="fsl-card overflow-hidden" data-testid={`sheet-${side}`}>
            <div className="h-12 px-3 flex items-center gap-2 bg-navy-700/60">
              <button type="button" disabled={mode !== "gara" || !editable || ids.length === 0} onClick={() => allPresent(side)} className="inline-flex items-center gap-2 min-w-0 rounded-md px-1 -ml-1 disabled:cursor-default enabled:hover:bg-white/[0.06] enabled:active:bg-fsl-success/30 transition-colors" title={mode === "gara" ? "Tocca il logo: tutti i convocati presenti" : undefined} aria-label={mode === "gara" ? `Segna tutti presenti ${m[side].club?.name}` : m[side].club?.name} data-testid={`all-present-${side}`}>
                <ClubCrest club={m[side].club} size={28} />
                <span className="font-display font-bold uppercase text-sm truncate">{m[side].club?.name}</span>
              </button>
              <span className="ml-auto text-[10px] uppercase tracking-wider text-fsl-slate num shrink-0" data-testid={`sheet-${side}-counts`}>
                {mode === "distinta" ? `${ids.length} in distinta` : <><span className="text-fsl-success">{counts.present} pres.</span> · <span className="text-fsl-danger">{counts.absent} ass.</span>{counts.pending > 0 && <> · <span className="text-fsl-warning">{counts.pending} da conf.</span></>}</>}
              </span>
            </div>
            {m.players[side].length === 0 && <p className="p-4 text-xs text-fsl-slate">Rosa vuota: la società deve inserire i giocatori.</p>}
            {mode === "gara" && ids.length === 0 && m.players[side].length > 0 && <p className="p-4 text-xs text-fsl-warning" data-testid={`sheet-${side}-missing`}>Distinta non preparata: passa a «Prepara distinta».</p>}
            {mode === "gara" && editable && ids.length > 0 && counts.pending > 0 && <p className="px-3 py-1.5 text-[11px] text-fsl-slate border-b border-white/[0.06]">Tocca il logo per segnare tutti presenti, poi correggi gli assenti.</p>}
            {m.players[side].map((p) => {
              const st = sheet.stats[p.id] || {};
              const v = sheet.ratings[p.id] ?? 6;
              const b = bonusFor(st, p.role, conceded, true);
              return <SheetRow key={p.id} p={p} mode={mode} inList={ids.includes(p.id)} att={sheet.attendance[p.id]} vote={v} st={st} bonus={b} fanta={Math.round((v + b) * 10) / 10} editable={editable} onCallup={toggleCallup(side)} onPresence={cycle} onVote={vote} onStat={stat} onOpen={onOpen} />;
            })}
          </div>
        );
      })}
    </div>
  );
}
