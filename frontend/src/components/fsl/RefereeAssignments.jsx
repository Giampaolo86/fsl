import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, FileDown, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { teamLabel, fmtDate } from "@/lib/format";

const ASSIGNABLE = ["scheduled", "confirmed", "postponed"];

export function RefereeAssignments({ tid, list, onDone, canWrite }) {
  const [referees, setReferees] = useState([]);
  const [day, setDay] = useState("");
  const [busyId, setBusyId] = useState(null);
  useEffect(() => { api.get("/users").then((r) => setReferees(r.data.filter((u) => u.role === "referee"))).catch(() => {}); }, []);

  const matches = useMemo(() => (list || []).filter((m) => ASSIGNABLE.includes(m.status)).sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at) || (a.field_name || "").localeCompare(b.field_name || "")), [list]);
  const days = useMemo(() => [...new Set(matches.map((m) => m.kickoff_at.slice(0, 10)))], [matches]);
  const activeDay = days.includes(day) ? day : days[0] || "";
  const rows = matches.filter((m) => m.kickoff_at.slice(0, 10) === activeDay);
  const assigned = rows.filter((m) => m.referee_user_id).length;

  const clashes = useMemo(() => {
    const seen = {};
    const out = new Set();
    rows.forEach((m) => { if (!m.referee_user_id) return; const k = `${m.referee_user_id}|${m.kickoff_at}`; if (seen[k]) { out.add(m.id); out.add(seen[k]); } else seen[k] = m.id; });
    return out;
  }, [rows]);

  const assign = async (m, uid) => {
    setBusyId(m.id);
    try {
      await api.patch(`/tournaments/${tid}/matches/${m.id}`, { referee_user_id: uid || "" });
      toast.success(uid ? "Arbitro designato" : "Designazione rimossa");
      onDone?.();
    } catch (e) { toast.error(apiError(e)); } finally { setBusyId(null); }
  };

  const perReferee = useMemo(() => {
    const map = {};
    rows.forEach((m) => { if (!m.referee_user_id) return; (map[m.referee_user_id] = map[m.referee_user_id] || { name: m.referee_name, matches: [] }).matches.push(m); });
    return Object.entries(map).sort((a, b) => b[1].matches.length - a[1].matches.length);
  }, [rows]);
  const [downloading, setDownloading] = useState(false);
  const downloadPdf = async () => {
    setDownloading(true);
    try {
      const r = await api.get(`/tournaments/${tid}/matches/referee-sheet`, { params: { date: activeDay }, responseType: "blob" });
      const url = URL.createObjectURL(r.data); const a = document.createElement("a"); a.href = url; a.download = `FSL_Designazioni_${activeDay}.pdf`; a.click(); URL.revokeObjectURL(url);
    } catch (e) { toast.error(apiError(e)); } finally { setDownloading(false); }
  };

  if (!matches.length) return <p className="text-sm text-fsl-slate py-8 text-center" data-testid="referees-empty">Nessuna gara programmata da designare con i filtri attuali.</p>;

  return (
    <div className="space-y-4" data-testid="referee-assignments">
      <div className="flex flex-wrap items-center gap-2" data-testid="referee-day-tabs">
        {days.map((d) => {
          const ms = matches.filter((m) => m.kickoff_at.slice(0, 10) === d);
          const done = ms.filter((m) => m.referee_user_id).length;
          return (
            <button key={d} type="button" onClick={() => setDay(d)} data-testid={`referee-day-${d}`} className={`h-10 px-3 rounded-full text-xs font-semibold border inline-flex items-center gap-2 transition-colors ${d === activeDay ? "bg-fsl-gold text-ink-950 border-fsl-gold" : "border-white/15 text-fsl-white/80 hover:border-fsl-gold/50"}`}>
              {fmtDate(d)} <span className={`num ${done === ms.length ? "" : d === activeDay ? "text-ink-950/70" : "text-fsl-danger"}`}>{done}/{ms.length}</span>
            </button>
          );
        })}
        <button type="button" onClick={downloadPdf} disabled={downloading} className="btn-ghost ml-auto h-10" data-testid="referee-sheet-pdf-button"><FileDown className="h-4 w-4" aria-hidden="true" /> {downloading ? "Preparo il PDF…" : "Foglio designazioni PDF"}</button>
      </div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3" data-testid="referee-summary">
        {referees.map((r) => {
          const mine = perReferee.find(([id]) => id === r.id)?.[1]?.matches || [];
          return (
            <div key={r.id} className={`fsl-card px-4 py-3 ${mine.length ? "" : "opacity-60"}`} data-testid={`referee-summary-${r.id}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold text-sm truncate">{r.full_name}</div>
                <div className="font-display font-extrabold text-2xl num text-fsl-gold leading-none">{mine.length}</div>
              </div>
              <div className="text-[11px] text-fsl-slate mt-1 truncate">{mine.length ? mine.map((m) => `${m.kickoff_at.slice(11, 16)} ${m.field_name || ""}`.trim()).join(" · ") : "Libero in questa giornata"}</div>
            </div>
          );
        })}
        <div className={`fsl-card px-4 py-3 ${rows.length - assigned ? "border-fsl-danger/50" : "border-fsl-success/40"}`} data-testid="referee-summary-unassigned">
          <div className="flex items-center justify-between gap-2">
            <div className="font-semibold text-sm">Da designare</div>
            <div className={`font-display font-extrabold text-2xl num leading-none ${rows.length - assigned ? "text-fsl-danger" : "text-fsl-success"}`}>{rows.length - assigned}</div>
          </div>
          <div className="text-[11px] text-fsl-slate mt-1">{rows.length - assigned ? "Gare ancora senza arbitro in questa giornata" : "Tutte le gare della giornata sono coperte"}</div>
        </div>
      </div>
      <div className="fsl-card overflow-hidden">
        <div className="flex items-center justify-between px-4 h-12 border-b border-white/10">
          <div className="fsl-kicker inline-flex items-center gap-2"><UserCheck className="h-4 w-4" aria-hidden="true" /> Designazioni · {fmtDate(activeDay)}</div>
          <span className={`text-xs num font-semibold ${assigned === rows.length ? "text-fsl-success" : "text-fsl-danger"}`} data-testid="referee-day-progress">{assigned}/{rows.length} designate</span>
        </div>
        {!referees.length && <p className="px-4 py-3 text-xs text-fsl-warning" data-testid="referees-none-hint">Nessun arbitro registrato: crea gli account arbitro in «Utenti» per poterli designare.</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-fsl-slate">
              <tr className="border-b border-white/10"><th className="text-left px-4 py-2">Ora</th><th className="text-left px-2 py-2">Campo</th><th className="text-left px-2 py-2">Gara</th><th className="text-left px-2 py-2">Competizione</th><th className="text-left px-2 py-2 w-56">Arbitro</th></tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {rows.map((m) => (
                <tr key={m.id} className={`${m.referee_user_id ? "" : "bg-fsl-danger/5"} ${clashes.has(m.id) ? "bg-fsl-warning/10" : ""}`} data-testid={`referee-row-${m.id}`}>
                  <td className="px-4 py-2 num font-semibold whitespace-nowrap">{m.kickoff_at.slice(11, 16)}</td>
                  <td className="px-2 py-2 text-fsl-slate whitespace-nowrap">{m.field_name || "—"}</td>
                  <td className="px-2 py-2"><Link to={`/admin/t/${tid}/partite/${m.id}`} className="hover:text-fsl-gold">{teamLabel(m.home)} <span className="text-fsl-slate">vs</span> {teamLabel(m.away)}</Link></td>
                  <td className="px-2 py-2 text-xs text-fsl-slate whitespace-nowrap">{m.category}{m.series ? ` · ${m.series}` : ""}{m.round_name ? ` · ${m.round_name}` : ""}</td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-2">
                      {canWrite ? (
                        <select className="fsl-input h-9 text-xs py-0 w-full" value={m.referee_user_id || ""} disabled={busyId === m.id || !referees.length} onChange={(e) => assign(m, e.target.value)} aria-label="Arbitro" data-testid={`referee-select-${m.id}`}>
                          <option value="">— da designare —</option>
                          {referees.map((r) => <option key={r.id} value={r.id}>{r.full_name}</option>)}
                        </select>
                      ) : <span className="text-xs">{m.referee_name || "—"}</span>}
                      {clashes.has(m.id) ? <AlertTriangle className="h-4 w-4 text-fsl-warning shrink-0" title="Stesso arbitro su due gare in contemporanea" aria-label="Sovrapposizione" data-testid={`referee-clash-${m.id}`} /> : m.referee_user_id ? <CheckCircle2 className="h-4 w-4 text-fsl-success shrink-0" aria-hidden="true" /> : <span className="h-4 w-4 shrink-0" />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {clashes.size > 0 && <p className="px-4 py-2 text-xs text-fsl-warning border-t border-white/10" data-testid="referee-clash-hint">Attenzione: lo stesso arbitro risulta su più gare allo stesso orario.</p>}
      </div>
    </div>
  );
}
