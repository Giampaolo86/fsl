import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Clock, Flag, Play, RotateCcw, Search, XCircle } from "lucide-react";
import { ClubCrest } from "./ClubCrest";

export const MATCH_STATUS = {
  scheduled: ["Programmata", "text-fsl-slate border-white/20", Clock],
  confirmed: ["Confermata", "text-fsl-blue-light border-fsl-blue-light/40", Clock],
  in_progress: ["In corso", "text-fsl-warning border-fsl-warning/40", Play],
  finished: ["Fine gara", "text-fsl-warning border-fsl-warning/40", Flag],
  report_submitted: ["Referto inviato", "text-fsl-warning border-fsl-warning/40", Flag],
  official: ["Ufficiale", "text-fsl-success border-fsl-success/40", CheckCircle2],
  under_review: ["In revisione", "text-fsl-warning border-fsl-warning/40", Search],
  rectified: ["Rettificato", "text-fsl-success border-fsl-success/40", RotateCcw],
  postponed: ["Rinviata", "text-fsl-slate border-white/20", AlertTriangle],
  cancelled: ["Annullata", "text-fsl-danger border-fsl-danger/40", XCircle],
};

export function MatchStatusBadge({ status, label }) {
  const [l, cls, Icon] = MATCH_STATUS[status] || MATCH_STATUS.scheduled;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border bg-ink-950/60 px-2 h-6 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap shrink-0 ${cls}`} data-testid={`match-status-${status}`}>
      <Icon className="h-3 w-3" aria-hidden="true" /> {label || l}
    </span>
  );
}

export function kickoffLabel(k) {
  if (!k) return "";
  const d = new Date(k);
  return `${["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"][d.getDay()]} ${String(d.getDate()).padStart(2, "0")} ${["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"][d.getMonth()]} · ${k.slice(11, 16)}`;
}

export function MatchCard({ m, to, compact = false }) {
  const hasScore = m.score?.home !== null && m.score?.home !== undefined;
  const body = (
    <>
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-fsl-slate mb-2">
        <span className="truncate">{m.competition_name || `${m.category} · ${m.series}`} · {m.round_name}</span>
        <MatchStatusBadge status={m.status} label={m.display_status} />
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <ClubCrest club={m.home?.club} size={compact ? 28 : 36} />
          <span className="text-sm font-semibold truncate">{m.home?.club?.name || m.home?.name}</span>
        </div>
        <div className="text-center px-2">
          {hasScore ? (
            <div className="font-display font-extrabold text-3xl num leading-none" data-testid="match-score">
              {m.score.home} - {m.score.away}
              {m.score.home_pen !== null && m.score.home_pen !== undefined && <div className="text-[10px] text-fsl-slate font-sans font-medium">d.c.r. {m.score.home_pen}-{m.score.away_pen}</div>}
            </div>
          ) : (
            <div className="font-display font-extrabold text-2xl num leading-none text-fsl-gold">{m.kickoff_at?.slice(11, 16)}</div>
          )}
        </div>
        <div className="flex items-center gap-2 min-w-0 justify-end text-right">
          <span className="text-sm font-semibold truncate">{m.away?.club?.name || m.away?.name}</span>
          <ClubCrest club={m.away?.club} size={compact ? 28 : 36} />
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-fsl-slate num">
        <span>{kickoffLabel(m.kickoff_at)}</span>
        <span>{m.field_name}{m.referee_name ? ` · Arb. ${m.referee_name}` : ""}</span>
      </div>
    </>
  );
  const cls = "fsl-card p-3 block hover:border-fsl-gold/50 transition-colors";
  return to ? (
    <Link to={to} className={cls} data-testid={`match-card-${m.id}`}>{body}</Link>
  ) : (
    <div className={cls} data-testid={`match-card-${m.id}`}>{body}</div>
  );
}
