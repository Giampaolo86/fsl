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
  const live = m.status === "in_progress";
  const finals = m.stage === "finals";
  const hc = m.home?.club?.colors?.primary || "#0B57D9";
  const ac = m.away?.club?.colors?.primary || "#F4AE2B";
  const Team = ({ t, side }) => (
    <div className={`flex flex-col items-center gap-1.5 min-w-0 flex-1 ${side === "away" ? "" : ""}`}>
      <span className="relative inline-flex">
        <span className="absolute inset-0 rounded-full blur-md opacity-40" style={{ background: side === "home" ? hc : ac }} />
        <ClubCrest club={t?.club} size={compact ? 32 : 40} className="relative drop-shadow-[0_3px_6px_rgba(0,0,0,0.6)]" />
      </span>
      <span className={`font-sans font-bold tracking-tight text-center leading-tight line-clamp-2 ${compact ? "text-xs" : "text-sm"}`}>{t?.club?.name || t?.name}</span>
    </div>
  );
  const body = (
    <>
      <div className="flex items-center justify-between gap-2 px-3 h-8 bg-black/25 border-b border-white/[0.06]">
        <span className={`font-display text-[11px] font-bold uppercase tracking-[0.16em] truncate ${finals ? "text-fsl-gold" : "text-fsl-gold/80"}`}>{finals ? `Fase finale · ${m.round_name}` : `${m.competition_name || `${m.category} · ${m.series}`} · ${m.round_name}`}</span>
        <MatchStatusBadge status={m.status} label={m.display_status} />
      </div>
      <div className={`relative flex items-center gap-2 ${compact ? "px-3 py-3" : "px-4 py-4"}`}>
        <span className="absolute inset-y-0 left-0 w-1" style={{ background: hc }} />
        <span className="absolute inset-y-0 right-0 w-1" style={{ background: ac }} />
        <Team t={m.home} side="home" />
        <div className="w-[88px] shrink-0 flex flex-col items-center justify-center">
          {hasScore ? (
            <>
              <div className={`font-display font-black num leading-none tracking-tighter ${compact ? "text-3xl" : "text-[40px]"}`} data-testid="match-score">{m.score.home}<span className="text-fsl-slate/60 mx-1">–</span>{m.score.away}</div>
              {m.score.home_pen !== null && m.score.home_pen !== undefined && <div className="text-[10px] text-fsl-slate num mt-1">dcr {m.score.home_pen}–{m.score.away_pen}</div>}
              {live && <div className="mt-1 inline-flex items-center gap-1 text-[9px] font-display font-bold uppercase tracking-[0.2em] text-fsl-danger"><span className="h-1.5 w-1.5 rounded-full bg-fsl-danger animate-pulse" /> Live</div>}
            </>
          ) : (
            <>
              <div className={`font-display font-extrabold num leading-none text-fsl-gold ${compact ? "text-2xl" : "text-3xl"}`}>{m.kickoff_at?.slice(11, 16)}</div>
              <div className="text-[9px] font-display font-bold uppercase tracking-[0.2em] text-fsl-slate mt-1">Calcio d'inizio</div>
            </>
          )}
        </div>
        <Team t={m.away} side="away" />
      </div>
      <div className="flex items-center justify-between gap-2 px-3 h-8 bg-black/35 border-t border-white/[0.06] text-[11px] font-sans text-fsl-slate num">
        <span className="truncate">{kickoffLabel(m.kickoff_at)}</span>
        <span className="truncate text-right">{m.field_name}{m.referee_name ? ` · Arb. ${m.referee_name}` : ""}</span>
      </div>
    </>
  );
  const cls = `relative block overflow-hidden rounded-lg border bg-gradient-to-br from-navy-800 to-ink-950 shadow-md transition-[transform,box-shadow,border-color] duration-300 ease-out ${finals ? "border-fsl-gold/40" : "border-white/10"} ${to ? "hover:border-fsl-gold/50 hover:-translate-y-0.5 hover:shadow-[0_12px_30px_-12px_rgba(244,174,43,0.25)]" : ""}`;
  return to ? (
    <Link to={to} className={cls} data-testid={`match-card-${m.id}`}>{body}</Link>
  ) : (
    <div className={cls} data-testid={`match-card-${m.id}`}>{body}</div>
  );
}
