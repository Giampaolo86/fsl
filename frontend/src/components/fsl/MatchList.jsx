import { Link } from "react-router-dom";
import { Calendar, MapPin } from "lucide-react";
import { fmtDate } from "@/lib/format";

function Row({ m, tid, showScore }) {
  const d = new Date(m.kickoff_at);
  const hhmm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return (
    <Link to={`/admin/t/${tid}/partite/${m.id}`} className="flex items-center gap-3 px-4 h-14 hover:bg-white/[0.04] transition-colors" data-testid={`match-row-${m.id}`}>
      <div className="w-20 shrink-0 text-xs text-fsl-slate num leading-tight">
        <div className="font-semibold text-fsl-white">{fmtDate(m.kickoff_at)}</div>
        <div>{hhmm}</div>
      </div>
      <div className="min-w-0 flex-1 text-sm">
        <div className="truncate font-semibold">{m.home} <span className="text-fsl-slate font-normal">vs</span> {m.away}</div>
        <div className="text-[11px] text-fsl-slate truncate">{m.category}{m.series ? ` · ${m.series}` : ""}{m.round_name ? ` · ${m.round_name}` : ""}{m.field_name ? <span className="inline-flex items-center gap-1 ml-1"><MapPin className="h-3 w-3" aria-hidden="true" />{m.field_name}</span> : null}</div>
      </div>
      {showScore ? (
        <div className="font-display font-extrabold text-xl num text-fsl-gold shrink-0">{m.score?.home ?? "–"} - {m.score?.away ?? "–"}</div>
      ) : !m.referee_name && m.status !== "draft" ? (
        <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 bg-fsl-danger/15 text-fsl-danger" data-testid={`match-no-referee-${m.id}`}>senza arbitro</span>
      ) : (
        <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 ${m.status === "draft" ? "bg-fsl-warning/15 text-fsl-warning" : "bg-white/10 text-fsl-slate"}`}>{m.status === "draft" ? "bozza" : m.status === "confirmed" ? "confermata" : "programmata"}</span>
      )}
    </Link>
  );
}

export function MatchList({ title, matches, tid, showScore = false, emptyText, to, testId }) {
  return (
    <div className="fsl-card overflow-hidden" data-testid={testId}>
      <div className="flex items-center justify-between px-4 h-12 border-b border-white/10">
        <div className="fsl-kicker">{title}</div>
        <Link to={to} className="text-xs text-fsl-gold hover:underline">Vedi tutto</Link>
      </div>
      {matches.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-fsl-slate flex flex-col items-center gap-2"><Calendar className="h-6 w-6 text-fsl-slate/60" aria-hidden="true" />{emptyText}</div>
      ) : (
        <div className="divide-y divide-white/[0.06]">{matches.map((m) => <Row key={m.id} m={m} tid={tid} showScore={showScore} />)}</div>
      )}
    </div>
  );
}
