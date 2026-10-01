import { useMemo } from "react";
import { Coffee } from "lucide-react";
import { MatchTile } from "@/components/fsl/MatchTile";
import { WEEKDAYS, gridRows, toHHMM, toMin } from "@/components/fsl/simple/TimeGrid";
import { fmtDate } from "@/lib/format";
import { useIsMobile } from "@/hooks/useIsMobile";

function Cell({ m, slug }) {
  return <MatchTile m={m} home={m.home} away={m.away} kicker={m.stage === "finals" ? m.round_name : m.series} to={`/tornei/${slug}/partite/${m.id}`} testId={`public-grid-match-${m.id}`} />;
}

export function PublicTimeGrid({ schedule, matches, slug }) {
  const mobile = useIsMobile();
  const dur = schedule.match_minutes || 25;
  const step = dur + (schedule.buffer_minutes ?? 10);
  const fields = schedule.fields;
  const breaks = useMemo(() => schedule.breaks || [], [schedule.breaks]);
  const days = useMemo(() => [...new Set([...matches.map((m) => m.kickoff_at.slice(0, 10)), ...breaks.map((b) => b.date)])].sort(), [matches, breaks]);
  const byKey = useMemo(() => Object.fromEntries(matches.map((m) => [`${m.kickoff_at}|${m.field_id}`, m])), [matches]);
  const orphans = useMemo(() => matches.filter((m) => !fields.some((f) => f.id === m.field_id)), [matches, fields]);
  if (!fields.length) return null;
  return (
    <div className="space-y-6" data-testid="public-time-grid">
      {days.map((day) => {
        const dayMatches = matches.filter((m) => m.kickoff_at.startsWith(day));
        if (!dayMatches.length) return null;
        const rows = gridRows(day, schedule.sessions || [], breaks, dayMatches, step, dur, (schedule.slots || {})[day] || {});
        return (
          <div key={day} className="fsl-card overflow-hidden !p-0" data-testid={`public-grid-day-${day}`}>
            <div className="px-3 sm:px-4 min-h-11 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 bg-ink-950/60 border-b border-white/10"><span className="font-display font-extrabold uppercase text-fsl-gold text-sm sm:text-base">{WEEKDAYS[new Date(day + "T12:00").getDay()]} {fmtDate(day)}</span><span className="text-xs text-fsl-slate">{dayMatches.length} partite</span></div>
            {mobile ? (
              <div className="divide-y divide-white/[0.06]" data-testid={`public-grid-mobile-${day}`}>
                {rows.map(({ kind, t, b }) => kind === "break" ? (
                  <div key={`b-${t}-${b.label}`} className="bg-fsl-gold/[0.07] px-3 py-2 flex items-center gap-3 text-sm" data-testid={`public-grid-break-${day}-${t}`}><Coffee className="h-4 w-4 text-fsl-gold shrink-0" /><span className="font-semibold uppercase tracking-wide">{b.label}</span><span className="ml-auto num text-xs text-fsl-slate">{b.start_time} – {b.end_time}</span></div>
                ) : (
                  <div key={t} className="px-3 py-2">
                    <div className="flex items-baseline gap-2 mb-1.5"><span className="num font-display font-extrabold text-lg text-fsl-gold leading-none">{t}</span><span className="num text-[10px] text-fsl-slate">– {toHHMM(toMin(t) + dur)}</span></div>
                    <div className="space-y-1.5">
                      {fields.map((f) => { const m = byKey[`${day}T${t}|${f.id}`]; return m ? <div key={f.id}><div className="text-[9px] uppercase tracking-[0.16em] text-fsl-slate mb-0.5 pl-1">{f.name}</div><Cell m={m} slug={slug} /></div> : null; })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm table-fixed min-w-[640px]">
                <thead className="text-[11px] uppercase tracking-wider text-fsl-slate"><tr><th className="w-20 text-left px-3 py-2">Ora</th>{fields.map((f) => <th key={f.id} className="text-left px-2 py-2">{f.name}</th>)}</tr></thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {rows.map(({ kind, t, b }) => kind === "break" ? (
                    <tr key={`b-${t}-${b.label}`} className="bg-fsl-gold/[0.07]" data-testid={`public-grid-break-${day}-${t}`}>
                      <td className="px-3 py-2 num font-semibold text-fsl-slate align-top">{b.start_time}<span className="block text-[10px] font-normal">– {b.end_time}</span></td>
                      <td colSpan={fields.length} className="px-3 py-2"><div className="flex items-center gap-3 text-sm"><Coffee className="h-4 w-4 text-fsl-gold" /><span className="font-semibold uppercase tracking-wide">{b.label}</span><span className="text-xs text-fsl-slate">{toMin(b.end_time) - toMin(b.start_time)} minuti</span></div></td>
                    </tr>
                  ) : (
                    <tr key={t}>
                      <td className="px-3 py-1.5 num font-semibold text-fsl-white/90 align-top">{t}<span className="block text-[10px] text-fsl-slate font-normal">– {toHHMM(toMin(t) + dur)}</span></td>
                      {fields.map((f) => { const m = byKey[`${day}T${t}|${f.id}`]; return <td key={f.id} className="px-1.5 py-1.5 align-top">{m ? <Cell m={m} slug={slug} /> : <div className="h-[70px] rounded-md border border-dashed border-white/10" />}</td>; })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}
          </div>
        );
      })}
      {orphans.length > 0 && <p className="text-xs text-fsl-slate" data-testid="public-grid-orphans">{orphans.length} gare senza campo assegnato: consulta l'elenco.</p>}
    </div>
  );
}
