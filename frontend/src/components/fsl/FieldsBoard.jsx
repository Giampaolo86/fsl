import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Grid3X3 } from "lucide-react";
import { SectionTitle } from "@/components/fsl/Primitives";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/format";

const TONE = { in_progress: "bg-fsl-success animate-pulse", official: "bg-fsl-gold", rectified: "bg-fsl-gold", report_submitted: "bg-fsl-blue-light", cancelled: "bg-fsl-danger", postponed: "bg-fsl-warning" };
const LABEL = { scheduled: "Programmata", confirmed: "Confermata", in_progress: "In corso", report_submitted: "Referto inviato", official: "Ufficiale", rectified: "Rettificata", cancelled: "Annullata", postponed: "Rinviata" };
const hhmm = (iso) => iso?.slice(11, 16) || "";

export function FieldsBoard({ tournamentId, fields, slots }) {
  const [state, setState] = useState(null);
  useEffect(() => {
    if (!tournamentId) return;
    api.get(`/tournaments/${tournamentId}/matches`, { params: { upcoming_days: 14 } }).then((r) => {
      const ms = r.data.filter((m) => m.kickoff_at);
      const today = new Date().toISOString().slice(0, 10);
      const day = ms.some((m) => m.kickoff_at.startsWith(today)) ? today : ms[0]?.kickoff_at.slice(0, 10);
      setState({ day, matches: day ? ms.filter((m) => m.kickoff_at.startsWith(day)) : [] });
    }).catch(() => setState({ day: null, matches: [] }));
  }, [tournamentId]);
  const byField = (f) => (state?.matches || []).filter((m) => (m.field_name || "") === f);
  const isToday = state?.day === new Date().toISOString().slice(0, 10);
  const names = Array.from(new Set([...fields, ...(state?.matches || []).map((m) => m.field_name).filter(Boolean)]));
  return (
    <section>
      <SectionTitle right={<span className="text-xs text-fsl-slate" data-testid="fields-board-day">{state?.day ? `${isToday ? "Oggi" : "Prossima giornata"} · ${fmtDate(state.day)} · ${state.matches.length} gare` : "Nessuna gara nei prossimi 14 giorni"}</span>}>Campi in parallelo</SectionTitle>
      <div className={`grid gap-4 ${names.length >= 3 ? "lg:grid-cols-3" : names.length === 2 ? "lg:grid-cols-2" : ""}`} data-testid="overview-fields-grid">
        {names.map((f) => {
          const ms = byField(f);
          return (
            <div key={f} className="fsl-card overflow-hidden" data-testid={`fields-board-${f}`}>
              <div className="h-12 px-4 flex items-center justify-between border-b border-white/10 bg-ink-950/40"><span className="font-display font-bold uppercase">{f}</span><span className="text-xs text-fsl-slate num">{ms.length} gare</span><Grid3X3 className="h-4 w-4 text-fsl-slate" aria-hidden="true" /></div>
              <ul className="divide-y divide-white/[0.06]">
                {slots.map((slot) => {
                  const m = ms.find((x) => hhmm(x.kickoff_at) === slot);
                  return (
                    <li key={slot} className="min-h-12 px-4 py-2 flex items-center gap-3 text-sm">
                      <span className="num font-semibold text-fsl-white w-12 shrink-0">{slot}</span>
                      {m ? <Link to={`/admin/t/${tournamentId}/partite/${m.id}`} className="flex-1 min-w-0 flex items-center gap-2 hover:text-fsl-gold" data-testid={`fields-board-match-${m.id}`}><span className={`h-2 w-2 rounded-full shrink-0 ${TONE[m.status] || "bg-fsl-slate"}`} /><span className="truncate">{m.home?.club?.short_name || m.home?.name} – {m.away?.club?.short_name || m.away?.name}</span><span className="ml-auto text-[10px] uppercase text-fsl-slate shrink-0">{LABEL[m.status] || m.status}</span></Link>
                        : <span className="inline-flex items-center gap-1.5 text-xs text-fsl-slate"><span className="h-2 w-2 rounded-full bg-fsl-slate/50" aria-hidden="true" /> Slot libero</span>}
                    </li>
                  );
                })}
                {ms.filter((x) => !slots.includes(hhmm(x.kickoff_at))).map((m) => (
                  <li key={m.id} className="min-h-12 px-4 py-2 flex items-center gap-3 text-sm"><span className="num font-semibold text-fsl-white w-12 shrink-0">{hhmm(m.kickoff_at)}</span><Link to={`/admin/t/${tournamentId}/partite/${m.id}`} className="flex-1 min-w-0 flex items-center gap-2 hover:text-fsl-gold"><span className={`h-2 w-2 rounded-full shrink-0 ${TONE[m.status] || "bg-fsl-slate"}`} /><span className="truncate">{m.home?.club?.short_name || m.home?.name} – {m.away?.club?.short_name || m.away?.name}</span><span className="ml-auto text-[10px] uppercase text-fsl-slate shrink-0">{LABEL[m.status] || m.status}</span></Link></li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
