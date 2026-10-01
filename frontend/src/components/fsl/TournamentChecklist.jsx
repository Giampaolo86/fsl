import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, CheckCircle2, Circle } from "lucide-react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";

export function TournamentChecklist({ data }) {
  const pct = data.steps.length ? Math.round((100 * data.steps_done) / data.steps.length) : 0;
  return (
    <div className="fsl-card p-5" data-testid="tournament-checklist">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <div className="fsl-kicker">Cose da fare</div>
          <h2 className="font-display font-extrabold uppercase text-lg leading-none">Preparazione torneo</h2>
        </div>
        <div className="text-right">
          <div className="font-display font-extrabold text-3xl num leading-none text-fsl-gold" data-testid="checklist-progress">{pct}%</div>
          <div className="text-[11px] uppercase tracking-wider text-fsl-slate">{data.steps_done}/{data.steps.length} completati</div>
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mb-4"><div className="h-full bg-fsl-gold transition-[width] duration-500" style={{ width: `${pct}%` }} /></div>
      <ol className="divide-y divide-white/[0.06]">
        {data.steps.map((s, i) => (
          <li key={s.key}>
            <Link to={s.to} className="flex items-center gap-3 py-2.5 group" data-testid={`checklist-step-${s.key}`}>
              {s.done ? <CheckCircle2 className="h-5 w-5 shrink-0 text-fsl-success" aria-hidden="true" /> : <Circle className={`h-5 w-5 shrink-0 ${data.next_step?.key === s.key ? "text-fsl-gold" : "text-fsl-slate/60"}`} aria-hidden="true" />}
              <div className="min-w-0 flex-1">
                <div className={`text-sm font-semibold ${s.done ? "text-fsl-slate line-through decoration-white/30" : "text-fsl-white"}`}>{i + 1}. {s.label}</div>
                <div className="text-xs text-fsl-slate truncate">{s.detail}</div>
              </div>
              {s.progress && s.progress.total > 0 && <span className="text-xs num text-fsl-slate">{s.progress.value}/{s.progress.total}</span>}
              <ArrowRight className="h-4 w-4 text-fsl-slate/50 group-hover:text-fsl-gold transition-colors" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ol>
      {data.next_step && (
        <Link to={data.next_step.to} className="btn-gold w-full mt-4" data-testid="checklist-next-button">
          Prossimo passo: {data.next_step.label} <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

export function AttentionList({ items, tid, canAssign = false, onChanged }) {
  const [referees, setReferees] = useState([]);
  const needRefs = canAssign && items.some((a) => a.key === "no_referee");
  useEffect(() => {
    if (needRefs) api.get("/users").then((r) => setReferees(r.data.filter((u) => u.role === "referee"))).catch(() => {});
  }, [needRefs]);
  if (!items.length) return null;
  return (
    <div className="fsl-card p-5 border-fsl-warning/40" data-testid="attention-list">
      <div className="fsl-kicker mb-2 text-fsl-warning">Richiede attenzione</div>
      <div className="grid gap-2">
        {items.map((a) => (
          <div key={a.key}>
            <Link to={a.to} className={`flex items-center gap-3 rounded-md px-3 h-11 text-sm transition-colors ${a.key === "no_referee" ? "bg-fsl-danger/15 hover:bg-fsl-danger/25" : "bg-fsl-warning/10 hover:bg-fsl-warning/20"}`} data-testid={`attention-${a.key}`}>
              <AlertTriangle className={`h-4 w-4 shrink-0 ${a.key === "no_referee" ? "text-fsl-danger" : "text-fsl-warning"}`} aria-hidden="true" />
              <span className="flex-1 truncate">{a.label}</span>
              <span className={`font-display font-extrabold num ${a.key === "no_referee" ? "text-fsl-danger" : "text-fsl-warning"}`}>{a.count}</span>
            </Link>
            {a.matches?.length > 0 && (
              <ul className="mt-1 ml-3 pl-4 border-l border-fsl-danger/30 space-y-1.5" data-testid="attention-no-referee-list">
                {a.matches.map((m) => (
                  <li key={m.id} className="flex items-center gap-2">
                    <Link to={a.to.replace(/\/partite$/, `/partite/${m.id}`)} className="min-w-0 flex-1 truncate text-xs text-fsl-slate hover:text-fsl-white num" data-testid={`no-referee-match-${m.id}`}>{m.kickoff_at.slice(11, 16)} · {m.home} vs {m.away}{m.field_name ? ` · ${m.field_name}` : ""}</Link>
                    {canAssign && <RefereeSelect tid={tid} matchId={m.id} referees={referees} onAssigned={onChanged} />}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function RefereeSelect({ tid, matchId, referees, onAssigned }) {
  const [busy, setBusy] = useState(false);
  const assign = async (uid) => {
    if (!uid) return;
    setBusy(true);
    try {
      await api.patch(`/tournaments/${tid}/matches/${matchId}`, { referee_user_id: uid });
      toast.success("Arbitro designato");
      onAssigned?.();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  return (
    <select className="fsl-input h-8 w-40 text-xs py-0" defaultValue="" disabled={busy || !referees.length} onChange={(e) => assign(e.target.value)} aria-label="Designa arbitro" data-testid={`quick-assign-referee-${matchId}`}>
      <option value="" disabled>{referees.length ? "Designa arbitro…" : "Nessun arbitro"}</option>
      {referees.map((r) => <option key={r.id} value={r.id}>{r.full_name}</option>)}
    </select>
  );
}
