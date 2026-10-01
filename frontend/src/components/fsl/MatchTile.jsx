import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { ClubCrest } from "./ClubCrest";

const LIVE = new Set(["in_progress", "finished", "report_submitted", "under_review"]);
const FINAL = new Set(["official", "rectified"]);

export function tileStatus(m) {
  const hasScore = m.score?.home !== null && m.score?.home !== undefined;
  if (LIVE.has(m.status) && hasScore) return { mode: "live", label: m.status === "in_progress" ? "Live" : "In verifica" };
  if (FINAL.has(m.status) && hasScore) return { mode: "final", label: m.status === "rectified" ? "Rettificata" : "Ufficiale" };
  if (m.status === "postponed") return { mode: "postponed", label: "Rinviata" };
  if (m.status === "cancelled") return { mode: "postponed", label: "Annullata" };
  return { mode: "scheduled", label: "" };
}

export function TeamRow({ team, side, conflict, onClick, disabled, testId }) {
  const club = team.club || { name: team.club_name || team.name, short_name: team.name, crest_url: team.crest_url, crest_is_placeholder: !team.crest_url, colors: team.colors };
  const name = team.name;
  const cls = `flex items-center gap-2 h-7 px-2 rounded-sm min-w-0 text-left w-full transition-colors ${conflict ? "bg-fsl-danger/25 ring-1 ring-fsl-danger text-white" : onClick && !disabled ? "hover:bg-white/10" : ""} ${onClick && !disabled ? "cursor-pointer" : ""}`;
  const inner = (
    <>
      <ClubCrest club={club} size={18} className="shrink-0 drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]" />
      <span className="font-sans text-[13px] font-semibold tracking-tight truncate flex-1">{name}</span>
      {conflict && <AlertTriangle className="h-3.5 w-3.5 text-fsl-danger shrink-0" aria-label="Conflitto" />}
    </>
  );
  if (onClick) {
    return (
      <button type="button" disabled={disabled} onClick={onClick} title={conflict ? `Conflitto: impegnata anche in ${conflict}` : "Tocca per cambiare squadra"} className={cls} data-conflict={conflict ? "true" : undefined} data-side={side} data-testid={testId}>{inner}</button>
    );
  }
  return <div className={cls} data-side={side} data-testid={testId}>{inner}</div>;
}

function ScoreBlock({ m, st }) {
  if (st.mode === "live" || st.mode === "final") {
    return (
      <>
        <div className="font-display font-black text-[24px] leading-none num tracking-tight text-white" data-testid="tile-score">{m.score.home}<span className="text-fsl-slate/70 mx-0.5">–</span>{m.score.away}</div>
        {m.score.home_pen != null && <div className="text-[9px] text-fsl-slate num leading-none">dcr {m.score.home_pen}–{m.score.away_pen}</div>}
        <div className={`text-[9px] font-display font-bold uppercase tracking-[0.18em] leading-none ${st.mode === "live" ? "text-fsl-danger" : "text-fsl-slate"}`}>{st.mode === "live" && <span className="inline-block h-1.5 w-1.5 rounded-full bg-fsl-danger animate-pulse mr-1 align-middle" />}{st.label}</div>
      </>
    );
  }
  if (st.mode === "postponed") return <div className="font-display font-bold uppercase tracking-widest text-[11px] text-fsl-slate">{st.label}</div>;
  return <div className="font-display font-extrabold text-[22px] leading-none num text-fsl-gold" data-testid="tile-time">{m.kickoff_at?.slice(11, 16)}</div>;
}

export function MatchTile({ m, home, away, kicker, to, className = "", fieldConflict, dragHandle, actions, tileProps = {}, testId }) {
  const st = tileStatus(m);
  const finals = m.stage === "finals";
  const hc = home.club?.colors?.primary || home.colors?.primary || "#0B57D9";
  const ac = away.club?.colors?.primary || away.colors?.primary || "#F4AE2B";
  const body = (
    <div {...tileProps} className={`group relative flex items-stretch h-[70px] rounded-md overflow-hidden border bg-ink-950 shadow-md transition-[border-color,transform,box-shadow] duration-200 ${fieldConflict ? "border-fsl-danger ring-1 ring-fsl-danger/50 shadow-[0_0_12px_rgba(239,68,68,0.3)]" : finals ? "border-fsl-gold/50 hover:border-fsl-gold" : "border-white/10 hover:border-fsl-gold/50"} ${to ? "hover:-translate-y-px hover:shadow-[0_8px_24px_-12px_rgba(244,174,43,0.35)]" : ""} ${className}`} title={fieldConflict ? `Campo occupato anche da ${fieldConflict}` : undefined} data-conflict={fieldConflict ? "field" : undefined} data-testid={testId}>
      <div className="w-1.5 shrink-0 flex flex-col"><span className="flex-1" style={{ background: hc }} /><span className="flex-1" style={{ background: ac }} /></div>
      {dragHandle}
      <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5 py-1 pl-1 pr-1">
        {home.node || <TeamRow team={home} side="home" conflict={home.conflict} onClick={home.onClick} disabled={home.disabled} testId={home.testId} />}
        {away.node || <TeamRow team={away} side="away" conflict={away.conflict} onClick={away.onClick} disabled={away.disabled} testId={away.testId} />}
      </div>
      <div className="w-[72px] shrink-0 flex flex-col items-center justify-center gap-[3px] border-l border-white/[0.06] bg-white/[0.03] px-1">
        <ScoreBlock m={m} st={st} />
        {kicker && <div className={`w-full text-center text-[8px] font-display font-bold uppercase tracking-[0.14em] truncate ${finals ? "text-fsl-gold" : "text-fsl-slate/70"}`}>{kicker}</div>}
      </div>
      {finals && <span className="absolute top-0 left-1.5 right-0 h-px bg-gradient-to-r from-fsl-gold via-fsl-gold/60 to-transparent" />}
      {actions}
    </div>
  );
  return to ? <Link to={to} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fsl-gold rounded-md" data-testid={`${testId}-link`}>{body}</Link> : body;
}
