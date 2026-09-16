import { BADGE, ROLE_TONE, STAT_META, fmtVote } from "@/lib/fanta";
import { mediaUrl } from "@/lib/upload";

export function EventIcons({ ev = {}, compact = false }) {
  const items = Object.entries(STAT_META).flatMap(([k, meta]) => Array.from({ length: ev[k] || 0 }).map((_, i) => (
    <span key={`${k}${i}`} className={`h-5 ${k === "yellow_card" || k === "red_card" ? "w-3.5 rounded-sm" : "min-w-[20px] px-1 rounded-full"} inline-flex items-center justify-center text-[9px] font-bold ${meta.tone}`} title={meta.label}>{k === "yellow_card" || k === "red_card" ? "" : meta.short}</span>
  )));
  if (items.length === 0) return compact ? null : <span className="text-[10px] text-fsl-slate">—</span>;
  return <span className="inline-flex gap-1 shrink-0" aria-label="eventi">{items}</span>;
}

export function Badges({ list = [] }) {
  return list.map((b) => <span key={b} className={`h-5 px-1.5 rounded text-[9px] font-bold uppercase inline-flex items-center ${BADGE[b]?.[1] || "bg-navy-700"}`}>{BADGE[b]?.[0] || b}</span>);
}

export function RatingRow({ r, onOpen }) {
  const Name = onOpen && r.player_id ? "button" : "span";
  return (
    <div className={`h-12 px-2 flex items-center gap-2 border-b border-white/[0.06] ${r.present === false ? "opacity-50" : ""}`} data-testid={`rating-row-${r.player_id || r.shirt_number}`}>
      {r.photo_url ? <img src={mediaUrl(r.photo_url)} alt="" className="h-8 w-8 rounded-full object-cover shrink-0 border border-white/20" /> : <span className={`h-8 w-8 rounded-full inline-flex items-center justify-center text-[10px] font-bold uppercase shrink-0 ${ROLE_TONE[r.role] || "bg-navy-700"}`}>{r.role}</span>}
      <span className="num text-fsl-gold text-xs w-5 text-right shrink-0">{r.shirt_number ?? ""}</span>
      <Name onClick={onOpen && r.player_id ? () => onOpen(r.player_id) : undefined} className={`flex-1 min-w-0 text-left text-sm font-semibold truncate ${Name === "button" ? "hover:text-fsl-gold transition-colors" : ""}`} data-testid={Name === "button" ? `open-player-${r.player_id}` : undefined}>{r.name}</Name>
      <div className="w-[120px] sm:w-[160px] shrink-0 overflow-x-auto no-scrollbar flex items-center gap-1"><EventIcons ev={r.events} compact /><Badges list={r.badges} /></div>
      {r.present === false || r.pending ? (
        <span className="w-[76px] text-right text-[10px] uppercase text-fsl-slate shrink-0">{r.pending ? "Da conf." : "Assente"}</span>
      ) : (
        <span className="w-[76px] shrink-0 flex items-center justify-end gap-1 num"><span className="text-xs text-fsl-slate">{fmtVote(r.vote)}</span><span className={`text-[10px] ${r.bonus > 0 ? "text-fsl-success" : r.bonus < 0 ? "text-fsl-danger" : "text-fsl-slate"}`}>{r.bonus > 0 ? `+${fmtVote(r.bonus)}` : r.bonus < 0 ? fmtVote(r.bonus) : ""}</span><span className="font-display font-extrabold text-lg text-fsl-blue-light w-8 text-right" data-testid={`fanta-${r.player_id || r.shirt_number}`}>{fmtVote(r.fanta)}</span></span>
      )}
    </div>
  );
}

export function RatingsColumns({ rows, home, away, onOpen, testId = "ratings-columns" }) {
  const side = (s) => rows.filter((r) => r.side === s);
  return (
    <div className="grid md:grid-cols-2 gap-3" data-testid={testId}>
      {[["home", home], ["away", away]].map(([s, name]) => (
        <div key={s} className="fsl-card overflow-hidden">
          <div className="h-10 px-3 flex items-center justify-between bg-navy-700/60"><span className="fsl-kicker truncate">{name}</span><span className="text-[10px] uppercase text-fsl-slate">Voto · Bonus · Fanta</span></div>
          {side(s).length === 0 && <p className="p-4 text-xs text-fsl-slate">Distinta non pubblicata.</p>}
          {side(s).map((r, i) => <RatingRow key={r.player_id || i} r={r} onOpen={onOpen} />)}
        </div>
      ))}
    </div>
  );
}
