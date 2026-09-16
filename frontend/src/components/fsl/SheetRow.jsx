import { Minus, Plus } from "lucide-react";
import { ROLE_CODE, ROLE_TONE, STAT_KEYS, STAT_META, fmtVote } from "@/lib/fanta";

const PRESENCE = { present: "bg-fsl-success border-fsl-success text-ink-950", absent: "bg-fsl-danger border-fsl-danger text-fsl-white" };

function Chip({ k, value, editable, onChange }) {
  const meta = STAT_META[k];
  const on = value > 0;
  if (!editable && !on) return null;
  return (
    <span className={`h-8 shrink-0 inline-flex items-center rounded-md overflow-hidden border ${on ? "border-transparent" : "border-white/15"}`}>
      {editable && on && !meta.toggle && <button type="button" onClick={() => onChange(-1)} className="h-8 w-6 bg-ink-950/70 text-fsl-slate hover:text-fsl-white inline-flex items-center justify-center" aria-label={`Meno ${meta.label}`} data-testid={`dec-${k}`}><Minus className="h-3 w-3" /></button>}
      <button type="button" disabled={!editable} onClick={() => onChange(meta.toggle ? (on ? -1 : 1) : 1)} className={`h-8 px-2 inline-flex items-center gap-1 text-[11px] font-bold ${on ? meta.tone : "bg-ink-950/40 text-fsl-slate"}`} title={meta.label} aria-label={`${meta.label}: ${value}`} data-testid={`stat-${k}`}>{meta.short}{!meta.toggle && <span className="num">{value || 0}</span>}</button>
    </span>
  );
}

export function SheetRow({ p, mode, inList, att, vote = 6, st = {}, bonus = 0, fanta, editable, onCallup, onPresence, onVote, onStat, onOpen }) {
  const distinta = mode === "distinta";
  const present = att === "present";
  const numCls = distinta ? (inList ? "bg-fsl-gold border-fsl-gold text-ink-950" : "border-white/25 text-fsl-slate") : (PRESENCE[att] || "border-white/30 text-fsl-white");
  return (
    <div className={`h-12 px-2 grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-2 border-b border-white/[0.06] ${!distinta && att === "absent" ? "opacity-60" : ""} ${!distinta && !inList ? "hidden" : ""}`} data-testid={`sheet-row-${p.id}`}>
      <button type="button" disabled={!editable} onClick={() => (distinta ? onCallup(p.id) : onPresence(p.id))} className={`h-9 w-9 rounded-full border-2 num font-display font-extrabold text-sm inline-flex items-center justify-center transition-colors ${numCls}`} aria-label={distinta ? (inList ? `Rimuovi ${p.last_name} dalla distinta` : `Aggiungi ${p.last_name} alla distinta`) : `Presenza ${p.last_name}: ${att || "da confermare"}`} data-testid={distinta ? `callup-${p.id}` : `presence-${p.id}`}>{p.shirt_number ?? "–"}</button>
      <button type="button" onClick={() => onOpen(p.id)} className="min-w-0 text-left flex items-center gap-2 hover:text-fsl-gold transition-colors" data-testid={`open-player-${p.id}`}>
        <span className={`h-5 w-8 rounded text-[9px] font-bold uppercase inline-flex items-center justify-center shrink-0 ${ROLE_TONE[ROLE_CODE[p.role]] || "bg-navy-700"}`}>{ROLE_CODE[p.role] || p.role?.slice(0, 3) || "—"}</span>
        <span className="text-sm font-semibold truncate">{p.first_name} {p.last_name}</span>
      </button>
      {!distinta && present ? (
        <div className="flex items-center gap-2">
          <span className="h-8 inline-flex items-center rounded-md border border-white/15 overflow-hidden shrink-0">
            {editable && <button type="button" onClick={() => onVote(p.id, -0.5)} className="h-8 w-7 bg-ink-950/70 inline-flex items-center justify-center text-fsl-slate hover:text-fsl-white" aria-label="Voto meno" data-testid={`vote-dec-${p.id}`}><Minus className="h-3 w-3" /></button>}
            <span className="h-8 w-9 inline-flex items-center justify-center num font-bold text-sm bg-ink-950/40" data-testid={`vote-${p.id}`}>{fmtVote(vote)}</span>
            {editable && <button type="button" onClick={() => onVote(p.id, 0.5)} className="h-8 w-7 bg-ink-950/70 inline-flex items-center justify-center text-fsl-slate hover:text-fsl-white" aria-label="Voto più" data-testid={`vote-inc-${p.id}`}><Plus className="h-3 w-3" /></button>}
          </span>
          <div className="w-[150px] sm:w-[230px] overflow-x-auto no-scrollbar flex items-center gap-1" data-testid={`bonus-strip-${p.id}`}>{STAT_KEYS.map((k) => <Chip key={k} k={k} value={st[k] || 0} editable={editable} onChange={(d) => onStat(p.id, k, d)} />)}</div>
          <span className="w-[68px] shrink-0 text-right num"><span className={`text-[10px] mr-1 ${bonus > 0 ? "text-fsl-success" : bonus < 0 ? "text-fsl-danger" : "text-fsl-slate"}`}>{bonus > 0 ? `+${fmtVote(bonus)}` : bonus < 0 ? fmtVote(bonus) : "±0"}</span><span className="font-display font-extrabold text-lg text-fsl-blue-light" data-testid={`fanta-${p.id}`}>{fmtVote(fanta)}</span></span>
        </div>
      ) : (
        <span className="text-[10px] uppercase tracking-wider text-fsl-slate w-[110px] text-right">{distinta ? (inList ? "In distinta" : "") : att === "absent" ? "Assente" : "Da confermare"}</span>
      )}
    </div>
  );
}
