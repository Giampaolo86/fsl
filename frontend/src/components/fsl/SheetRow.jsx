import { Minus, Plus } from "lucide-react";
import { ROLE_CODE, ROLE_TONE, STAT_KEYS, STAT_META, fmtVote } from "@/lib/fanta";

const PRESENCE = { present: "bg-fsl-success border-fsl-success text-ink-950", absent: "bg-fsl-danger border-fsl-danger text-fsl-white" };

function Chip({ k, value, editable, onChange }) {
  const meta = STAT_META[k];
  const on = value > 0;
  const label = <span className="inline-flex items-center gap-0.5 text-[10px] font-bold leading-none">{meta.short}{!meta.toggle && <span className="num">{value || 0}</span>}</span>;
  return (
    <span className={`h-7 min-w-0 inline-flex items-stretch rounded-md overflow-hidden border ${on ? "border-transparent" : "border-white/15"}`} data-testid={`chip-${k}`}>
      {editable && on && !meta.toggle && <button type="button" onClick={() => onChange(-1)} className="w-1/2 bg-ink-950/80 text-fsl-white inline-flex items-center justify-center active:bg-fsl-danger" aria-label={`Meno ${meta.label}`} data-testid={`dec-${k}`}><Minus className="h-3 w-3" /></button>}
      <button type="button" disabled={!editable} onClick={() => onChange(meta.toggle ? (on ? -1 : 1) : 1)} className={`flex-1 min-w-0 inline-flex items-center justify-center ${on ? meta.tone : "bg-ink-950/40 text-fsl-slate"}`} title={meta.label} aria-label={`${meta.label}: ${value}`} aria-pressed={meta.toggle ? on : undefined} data-testid={`stat-${k}`}>{label}</button>
    </span>
  );
}

export function SheetRow({ p, mode, inList, att, vote = 6, st = {}, bonus = 0, fanta, editable, onCallup, onPresence, onVote, onStat, onOpen }) {
  const distinta = mode === "distinta";
  const present = att === "present";
  const numCls = distinta ? (inList ? "bg-fsl-gold border-fsl-gold text-ink-950" : "border-white/25 text-fsl-slate") : (PRESENCE[att] || "border-white/30 text-fsl-white");
  const showStats = !distinta && present;
  return (
    <div className={`px-2 border-b border-white/[0.06] ${showStats ? "h-[84px] md:h-12" : "h-11 md:h-12"} ${!distinta && att === "absent" ? "opacity-60" : ""} ${!distinta && !inList ? "hidden" : ""} grid grid-cols-[34px_minmax(0,1fr)_auto] md:grid-cols-[34px_minmax(0,1fr)_88px_252px_64px] items-center gap-x-2 content-center`} data-testid={`sheet-row-${p.id}`}>
      <button type="button" disabled={!editable} onClick={() => (distinta ? onCallup(p.id) : onPresence(p.id))} className={`h-9 w-9 -ml-0.5 rounded-full border-2 num font-display font-extrabold text-sm inline-flex items-center justify-center transition-colors ${numCls}`} aria-label={distinta ? (inList ? `Rimuovi ${p.last_name} dalla distinta` : `Aggiungi ${p.last_name} alla distinta`) : `Presenza ${p.last_name}: ${att || "da confermare"}`} data-testid={distinta ? `callup-${p.id}` : `presence-${p.id}`}>{p.shirt_number ?? "–"}</button>
      <button type="button" onClick={() => onOpen(p.id)} className="min-w-0 text-left flex items-center gap-1.5 hover:text-fsl-gold transition-colors" data-testid={`open-player-${p.id}`}>
        <span className={`h-5 w-7 rounded text-[9px] font-bold uppercase inline-flex items-center justify-center shrink-0 ${ROLE_TONE[ROLE_CODE[p.role]] || "bg-navy-700"}`}>{ROLE_CODE[p.role] || p.role?.slice(0, 3) || "—"}</span>
        <span className="text-sm font-semibold truncate">{p.first_name} {p.last_name}</span>
      </button>
      {showStats ? (
        <>
          <div className="flex items-center gap-1.5 justify-end md:justify-start md:col-start-3">
            <span className="h-7 inline-flex items-center rounded-md border border-white/15 overflow-hidden shrink-0">
              {editable && <button type="button" onClick={() => onVote(p.id, -0.5)} className="h-7 w-7 bg-ink-950/70 inline-flex items-center justify-center text-fsl-slate active:text-fsl-white" aria-label="Voto meno" data-testid={`vote-dec-${p.id}`}><Minus className="h-3 w-3" /></button>}
              <span className="h-7 w-8 inline-flex items-center justify-center num font-bold text-sm bg-ink-950/40" data-testid={`vote-${p.id}`}>{fmtVote(vote)}</span>
              {editable && <button type="button" onClick={() => onVote(p.id, 0.5)} className="h-7 w-7 bg-ink-950/70 inline-flex items-center justify-center text-fsl-slate active:text-fsl-white" aria-label="Voto più" data-testid={`vote-inc-${p.id}`}><Plus className="h-3 w-3" /></button>}
            </span>
            <span className="md:hidden text-right num shrink-0 w-14"><span className={`text-[10px] mr-1 ${bonus > 0 ? "text-fsl-success" : bonus < 0 ? "text-fsl-danger" : "text-fsl-slate"}`}>{bonus > 0 ? `+${fmtVote(bonus)}` : bonus < 0 ? fmtVote(bonus) : "±0"}</span><span className="font-display font-extrabold text-lg text-fsl-blue-light" data-testid={`fanta-${p.id}`}>{fmtVote(fanta)}</span></span>
          </div>
          <div className="col-span-3 md:col-span-1 md:col-start-4 grid grid-cols-7 gap-1 w-full" data-testid={`bonus-strip-${p.id}`}>{STAT_KEYS.map((k) => <Chip key={k} k={k} value={st[k] || 0} editable={editable} onChange={(d) => onStat(p.id, k, d)} />)}</div>
          <span className="hidden md:inline text-right num md:col-start-5"><span className={`text-[10px] mr-1 ${bonus > 0 ? "text-fsl-success" : bonus < 0 ? "text-fsl-danger" : "text-fsl-slate"}`}>{bonus > 0 ? `+${fmtVote(bonus)}` : bonus < 0 ? fmtVote(bonus) : "±0"}</span><span className="font-display font-extrabold text-lg text-fsl-blue-light">{fmtVote(fanta)}</span></span>
        </>
      ) : (
        <span className="text-[10px] uppercase tracking-wider text-fsl-slate text-right md:col-span-3">{distinta ? (inList ? "In distinta" : "") : att === "absent" ? "Assente" : "Da confermare"}</span>
      )}
    </div>
  );
}
