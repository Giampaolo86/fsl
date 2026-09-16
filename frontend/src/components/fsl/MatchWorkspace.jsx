import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AlertTriangle, Check, CheckCircle2, Flag, History, ListChecks, RotateCcw, Send, Star, Users } from "lucide-react";
import { toast } from "sonner";
import { ClubCrest } from "@/components/fsl/ClubCrest";
import { RatingsPanel } from "@/components/fsl/Ratings";
import { MatchStatusBadge, kickoffLabel } from "@/components/fsl/MatchCard";
import { ErrorState, LoadingState } from "@/components/fsl/States";
import { ReasonDialog } from "@/components/fsl/ReasonDialog";
import { useAuth } from "@/context/AuthContext";
import { api, apiError } from "@/lib/api";
import { fmtDate } from "@/lib/format";

const EVENT_TYPES = [["goal", "Gol", "bg-fsl-success text-ink-950"], ["yellow_card", "Ammonizione", "bg-fsl-warning text-ink-950"], ["red_card", "Espulsione", "bg-fsl-danger"], ["substitution", "Sostituzione", "bg-fsl-blue"], ["injury", "Infortunio", "bg-[#5b4bd6]"], ["own_goal", "Autogol", "bg-navy-700"]];
const FINAL = ["official", "rectified"];

export default function MatchWorkspace({ tournamentId: tidProp, backTo, compact = false }) {
  const params = useParams();
  const tid = tidProp || params.tournamentId;
  const matchId = params.matchId;
  const { user } = useAuth();
  const [m, setM] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("events");
  const [events, setEvents] = useState([]);
  const [score, setScore] = useState({ home: 0, away: 0, home_pen: "", away_pen: "", notes: "" });
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const [referees, setReferees] = useState([]);

  const load = useCallback(() => {
    api.get(`/tournaments/${tid}/matches/${matchId}`).then((r) => {
      setM(r.data); setEvents(r.data.events);
      setScore({ home: r.data.score.home ?? 0, away: r.data.score.away ?? 0, home_pen: r.data.score.home_pen ?? "", away_pen: r.data.score.away_pen ?? "", notes: "" });
    }).catch(setError);
  }, [tid, matchId]);
  useEffect(load, [load]);
  useEffect(() => { if (!compact) api.get("/users").then((r) => setReferees(r.data.filter((u) => u.role === "referee"))).catch(() => {}); }, [compact]);

  if (error) return <ErrorState message={apiError(error)} onRetry={load} />;
  if (!m) return <LoadingState />;
  const isRef = user.role === "referee" && !user.is_super_admin;
  const locked = isRef ? !m.can_edit_match : !m.can_officialize;
  const isFinal = FINAL.includes(m.status) || (m.status === "under_review" && m.score.home !== null);
  const players = (side) => m.players[side];
  const pname = (id) => { const p = [...m.players.home, ...m.players.away].find((x) => x.id === id); return p ? `${p.shirt_number ?? ""} ${p.first_name} ${p.last_name}` : "—"; };
  const teamName = (id) => (id === m.home_team_id ? m.home.club?.name : m.away.club?.name);
  const evScore = events.reduce((s, e) => { if (e.type === "goal") s[e.team_id === m.home_team_id ? 0 : 1]++; if (e.type === "own_goal") s[e.team_id === m.home_team_id ? 1 : 0]++; return s; }, [0, 0]);

  const act = async (fn, ok) => { setBusy(true); try { await fn(); toast.success(ok); load(); } catch (e) { toast.error(apiError(e)); throw e; } finally { setBusy(false); } };
  const addEvent = (type, team_id) => setEvents([...events, { id: Math.random().toString(36).slice(2, 12), team_id, player_id: players(team_id === m.home_team_id ? "home" : "away")[0]?.id || null, type, minute: 0, note: "" }]);
  const saveEvents = () => act(() => api.post(`/tournaments/${tid}/matches/${matchId}/events`, { events }), "Eventi salvati");
  const saveCallups = (side, ids) => act(() => api.post(`/tournaments/${tid}/matches/${matchId}/callups`, { [side]: ids }), "Convocazioni salvate");
  const scoreBody = () => ({ home: Number(score.home), away: Number(score.away), home_pen: score.home_pen === "" ? null : Number(score.home_pen), away_pen: score.away_pen === "" ? null : Number(score.away_pen), notes: score.notes });
  const submitReport = () => act(() => api.post(`/tournaments/${tid}/matches/${matchId}/report`, { ...scoreBody(), checklist: m.checklist }), "Referto inviato: risultato ufficializzato");
  const officialize = (reason) => act(() => api.post(`/tournaments/${tid}/matches/${matchId}/officialize`, { ...scoreBody(), reason }), isFinal ? "Risultato rettificato" : "Risultato ufficializzato");
  const reopen = (reason) => act(() => api.post(`/tournaments/${tid}/matches/${matchId}/reopen`, { reason }), "Referto riaperto");
  const assign = (uid) => act(() => api.patch(`/tournaments/${tid}/matches/${matchId}`, { referee_user_id: uid }), "Arbitro assegnato");
  const checklist = (k) => setM({ ...m, checklist: { ...m.checklist, [k]: !m.checklist[k] } });

  const TABS = [["callups", "Convocazioni", Users], ["events", "Eventi", ListChecks], ["report", isRef ? "Referto" : "Ufficializza", Flag], ["ratings", "Pagelle", Star], ["history", "Storia", History]];
  const CallupList = ({ side, teamId }) => {
    const ids = m.callups[side] || [];
    const toggle = (pid) => saveCallups(side, ids.includes(pid) ? ids.filter((x) => x !== pid) : [...ids, pid]);
    return (
      <div className="fsl-card p-4">
        <div className="flex items-center gap-2 mb-3"><ClubCrest club={m[side].club} size={28} /><span className="font-display font-bold uppercase">{m[side].club?.name}</span><span className="ml-auto text-xs text-fsl-slate num">{ids.length} convocati</span></div>
        {players(side).length === 0 && <p className="text-xs text-fsl-slate">Rosa vuota: la società deve inserire i giocatori.</p>}
        <ul className="divide-y divide-white/[0.06]">{players(side).map((p) => (
          <li key={p.id} className="h-11 flex items-center gap-3 text-sm"><span className="num w-6 text-fsl-gold font-bold">{p.shirt_number ?? "–"}</span><span className="flex-1">{p.first_name} {p.last_name} <span className="text-fsl-slate text-xs">{p.role}</span></span>
            <button disabled={locked || isFinal} onClick={() => toggle(p.id)} className={`h-8 w-8 rounded-md border inline-flex items-center justify-center ${ids.includes(p.id) ? "bg-fsl-success border-fsl-success text-ink-950" : "border-white/20 text-fsl-slate"}`} aria-pressed={ids.includes(p.id)} aria-label={`Convoca ${p.last_name}`} data-testid={`callup-${p.id}`}><Check className="h-4 w-4" /></button></li>
        ))}</ul>
      </div>
    );
  };

  return (
    <div className="space-y-5" data-testid="match-workspace">
      <section className="fsl-card p-5 relative overflow-hidden">
        <div className="flex items-center justify-between text-xs text-fsl-slate mb-3"><span className="fsl-kicker">{m.competition_name} · {m.round_name}</span><MatchStatusBadge status={m.status} /></div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="flex flex-col items-center text-center gap-2"><ClubCrest club={m.home.club} size={compact ? 56 : 72} /><span className="font-display font-bold uppercase text-sm leading-tight">{m.home.club?.name}</span></div>
          <div className="text-center">
            <div className="font-display font-extrabold text-5xl sm:text-6xl num leading-none" data-testid="workspace-score">{m.score.home ?? evScore[0]} - {m.score.away ?? evScore[1]}</div>
            <div className="text-[10px] uppercase tracking-wider text-fsl-gold mt-1">{isFinal ? "Risultato finale" : m.status === "in_progress" ? "Live" : kickoffLabel(m.kickoff_at)}</div>
          </div>
          <div className="flex flex-col items-center text-center gap-2"><ClubCrest club={m.away.club} size={compact ? 56 : 72} /><span className="font-display font-bold uppercase text-sm leading-tight">{m.away.club?.name}</span></div>
        </div>
        <div className="mt-4 flex flex-wrap justify-center gap-4 text-xs text-fsl-slate num"><span>{kickoffLabel(m.kickoff_at)}</span><span>{m.field_name}</span>{m.referee_name && <span>Arbitro: {m.referee_name}</span>}</div>
        {!compact && !isRef && (
          <div className="mt-4 flex items-center gap-2 justify-center">
            <label className="text-xs text-fsl-slate">Assegna arbitro</label>
            <select className="fsl-input h-9 w-56" value={m.referee_user_id || ""} onChange={(e) => assign(e.target.value)} disabled={locked} data-testid="assign-referee-select"><option value="">— nessuno —</option>{referees.map((r) => <option key={r.id} value={r.id}>{r.full_name}</option>)}</select>
          </div>
        )}
      </section>

      <div className="grid grid-cols-5 gap-1 fsl-card p-1" role="tablist">{TABS.map(([k, l, Icon]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`h-11 rounded-md text-xs font-semibold uppercase inline-flex items-center justify-center gap-1.5 ${tab === k ? "bg-fsl-blue" : "text-fsl-slate hover:text-fsl-white"}`} data-testid={`tab-${k}`}><Icon className="h-4 w-4" /><span className="hidden sm:inline">{l}</span></button>)}</div>

      {tab === "callups" && <div className="grid md:grid-cols-2 gap-3"><CallupList side="home" teamId={m.home_team_id} /><CallupList side="away" teamId={m.away_team_id} /></div>}

      {tab === "events" && (
        <div className="space-y-3">
          {!locked && !isFinal && (
            <div className="grid grid-cols-2 gap-2">{["home", "away"].map((side) => (
              <div key={side} className="fsl-card p-3"><div className="text-xs font-semibold uppercase mb-2 truncate">{m[side].club?.name}</div><div className="grid grid-cols-3 gap-1.5">{EVENT_TYPES.map(([t, l, cls]) => <button key={t} onClick={() => addEvent(t, m[`${side}_team_id`])} className={`h-11 rounded-md text-[11px] font-semibold ${cls}`} data-testid={`add-event-${side}-${t}`}>{l}</button>)}</div></div>
            ))}</div>
          )}
          <div className="fsl-card divide-y divide-white/[0.06]" data-testid="events-list">
            {events.length === 0 && <p className="p-6 text-center text-sm text-fsl-slate">Nessun evento registrato.</p>}
            {[...events].sort((a, b) => a.minute - b.minute).map((e) => (
              <div key={e.id} className="flex flex-wrap items-center gap-2 px-3 h-14">
                <input type="number" min="0" max="120" className="fsl-input h-9 w-16 num" value={e.minute} disabled={locked || isFinal} onChange={(ev) => setEvents(events.map((x) => x.id === e.id ? { ...x, minute: Number(ev.target.value) } : x))} aria-label="Minuto" />
                <span className={`h-6 px-2 rounded text-[10px] font-bold uppercase inline-flex items-center ${EVENT_TYPES.find((x) => x[0] === e.type)?.[2]}`}>{EVENT_TYPES.find((x) => x[0] === e.type)?.[1]}</span>
                <span className="text-xs text-fsl-slate truncate max-w-[110px]">{teamName(e.team_id)}</span>
                <select className="fsl-input h-9 flex-1 min-w-[140px]" value={e.player_id || ""} disabled={locked || isFinal} onChange={(ev) => setEvents(events.map((x) => x.id === e.id ? { ...x, player_id: ev.target.value || null } : x))} aria-label="Giocatore"><option value="">Giocatore…</option>{players(e.team_id === m.home_team_id ? "home" : "away").map((p) => <option key={p.id} value={p.id}>{pname(p.id)}</option>)}</select>
                {!locked && !isFinal && <button className="text-xs text-fsl-danger" onClick={() => setEvents(events.filter((x) => x.id !== e.id))} aria-label="Rimuovi evento">✕</button>}
              </div>
            ))}
          </div>
          {!locked && !isFinal && <button className="btn-primary w-full" disabled={busy} onClick={saveEvents} data-testid="save-events-button">Salva eventi ({evScore[0]}-{evScore[1]})</button>}
        </div>
      )}

      {tab === "report" && (
        <div className="fsl-card p-5 space-y-4">
          {isRef && (
            <div className="space-y-1">
              <div className="fsl-label mb-2">Checklist pre-partita</div>
              {[["teams_present", "Squadre presenti"], ["lists_verified", "Liste giocatori verificate"], ["signatures", "Firme allenatori acquisite"]].map(([k, l]) => (
                <button key={k} disabled={locked} onClick={() => checklist(k)} className="w-full h-11 flex items-center justify-between px-3 rounded-md border border-white/15 text-sm" data-testid={`checklist-${k}`}><span>{l}</span>{m.checklist[k] ? <CheckCircle2 className="h-5 w-5 text-fsl-success" /> : <span className="h-5 w-5 rounded-full border border-white/30" />}</button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label><span className="fsl-label">{m.home.club?.short_name} gol</span><input type="number" min="0" className="fsl-input mt-1 num text-2xl font-display" value={score.home} disabled={locked} onChange={(e) => setScore({ ...score, home: e.target.value })} data-testid="score-home" /></label>
            <label><span className="fsl-label">{m.away.club?.short_name} gol</span><input type="number" min="0" className="fsl-input mt-1 num text-2xl font-display" value={score.away} disabled={locked} onChange={(e) => setScore({ ...score, away: e.target.value })} data-testid="score-away" /></label>
            {m.stage === "finals" && <><label><span className="fsl-label">Rigori casa</span><input type="number" min="0" className="fsl-input mt-1" value={score.home_pen} disabled={locked} onChange={(e) => setScore({ ...score, home_pen: e.target.value })} /></label><label><span className="fsl-label">Rigori trasferta</span><input type="number" min="0" className="fsl-input mt-1" value={score.away_pen} disabled={locked} onChange={(e) => setScore({ ...score, away_pen: e.target.value })} /></label></>}
          </div>
          {events.some((e) => e.type === "goal" || e.type === "own_goal") && (Number(score.home) !== evScore[0] || Number(score.away) !== evScore[1]) && <p className="text-xs text-fsl-warning flex items-center gap-1"><AlertTriangle className="h-4 w-4" /> Gli eventi indicano {evScore[0]}-{evScore[1]}: il punteggio deve coincidere.</p>}
          <label><span className="fsl-label">{isRef ? "Note del direttore di gara" : "Note del Direttore Torneo"}</span><textarea className="fsl-input mt-1 h-20 py-2" value={score.notes} disabled={locked} onChange={(e) => setScore({ ...score, notes: e.target.value })} data-testid="report-notes" /></label>
          {isRef ? (
            m.can_edit_match ? <button className="btn-primary w-full" disabled={busy} onClick={submitReport} data-testid="submit-report-button"><Send className="h-4 w-4" /> Invia al direttore torneo</button> : <div className="rounded-md bg-fsl-success/15 border border-fsl-success/40 p-3 text-sm flex items-center gap-2 text-fsl-success" data-testid="report-locked"><CheckCircle2 className="h-5 w-5" /> Referto inviato · risultato registrato. Solo il Direttore può riaprirlo.</div>
          ) : (
            m.can_officialize && (
              <div className="grid sm:grid-cols-2 gap-2">
                <button className="btn-gold" disabled={busy} onClick={() => isFinal ? setDialog("rectify") : officialize("")} data-testid="officialize-button"><CheckCircle2 className="h-4 w-4" /> {isFinal ? "Rettifica risultato" : "Ufficializza risultato"}</button>
                {isFinal && <button className="btn-ghost" disabled={busy} onClick={() => setDialog("reopen")} data-testid="reopen-button"><RotateCcw className="h-4 w-4" /> Riapri referto</button>}
              </div>
            )
          )}
        </div>
      )}

      {tab === "ratings" && <RatingsPanel tournamentId={tid} matchId={matchId} editable={isRef ? m.referee_user_id === user.id : m.can_officialize} homeName={m.home.club?.name} awayName={m.away.club?.name} />}

      {tab === "history" && (
        <div className="fsl-card divide-y divide-white/[0.06]" data-testid="report-history">
          {m.report_versions.length === 0 && <p className="p-6 text-center text-sm text-fsl-slate">Nessuna versione: il referto non è ancora stato inviato.</p>}
          {m.report_versions.map((v) => (
            <div key={v.id} className="p-4 text-sm">
              <div className="flex items-center justify-between"><span className="font-semibold">v{v.version} · {{ referee_report: "Referto arbitro", officialization: "Ufficializzazione", rectification: "Rettifica", reopen: "Riapertura" }[v.kind]}</span><span className="text-xs text-fsl-slate num">{fmtDate(v.created_at, { time: true })} · {v.actor_role}</span></div>
              <div className="mt-1 num">{v.before && v.before.home !== null && <span className="text-fsl-danger/90 mr-3">prima {v.before.home}-{v.before.away}</span>}<span className="text-fsl-success">dopo {v.score.home}-{v.score.away}</span></div>
              {(v.reason || v.referee_notes || v.director_notes) && <p className="text-xs text-fsl-slate mt-1">{v.reason || v.referee_notes || v.director_notes}</p>}
            </div>
          ))}
          {m.tickets?.length > 0 && <div className="p-4 text-xs text-fsl-slate">{m.tickets.length} segnalazioni collegate a questa gara.</div>}
        </div>
      )}

      <ReasonDialog open={dialog === "rectify"} onOpenChange={(o) => !o && setDialog(null)} title="Rettifica risultato" description={`Il risultato passerà da ${m.score.home}-${m.score.away} a ${score.home}-${score.away}. La versione precedente resta nella storia.`} confirmLabel="Rettifica" danger onConfirm={officialize} />
      <ReasonDialog open={dialog === "reopen"} onOpenChange={(o) => !o && setDialog(null)} title="Riapri referto" description="La gara passa in revisione; la classifica pubblica non cambia finché non ufficializzi di nuovo." confirmLabel="Riapri" onConfirm={reopen} />
    </div>
  );
}
