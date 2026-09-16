import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AlertTriangle, Camera, CheckCircle2, ClipboardList, History, RotateCcw, Save, Send, Share2, Users } from "lucide-react";
import { toast } from "sonner";
import { ClubCrest } from "@/components/fsl/ClubCrest";
import { MatchSheet } from "@/components/fsl/MatchSheet";
import { PlayerCardDialog } from "@/components/fsl/PlayerCard";
import { MatchStatusBadge, kickoffLabel } from "@/components/fsl/MatchCard";
import { ErrorState, LoadingState } from "@/components/fsl/States";
import { ReasonDialog } from "@/components/fsl/ReasonDialog";
import { SocialCard } from "@/components/fsl/SocialCard";
import { ShopManager } from "@/components/fsl/Shop";
import { useAuth } from "@/context/AuthContext";
import { api, apiError } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { scoreFromStats } from "@/lib/fanta";

const FINAL = ["official", "rectified"];
const VERSION_KIND = { referee_report: "Referto arbitro", officialization: "Pubblicazione", rectification: "Rettifica", reopen: "Riapertura" };

export default function MatchWorkspace({ tournamentId: tidProp, compact = false }) {
  const params = useParams();
  const tid = tidProp || params.tournamentId;
  const matchId = params.matchId;
  const { user } = useAuth();
  const [m, setM] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("sheet");
  const [mode, setMode] = useState(null);
  const [callups, setCallups] = useState({ home: [], away: [] });
  const [sheet, setSheet] = useState({ attendance: {}, ratings: {}, stats: {} });
  const [pens, setPens] = useState({ home_pen: "", away_pen: "" });
  const [notes, setNotes] = useState("");
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const [referees, setReferees] = useState([]);
  const [openPlayer, setOpenPlayer] = useState(null);

  const load = useCallback(() => {
    api.get(`/tournaments/${tid}/matches/${matchId}`).then((r) => {
      const d = r.data;
      setM(d); setCallups({ home: d.callups.home || [], away: d.callups.away || [] });
      setSheet({ attendance: d.attendance || {}, ratings: d.ratings || {}, stats: d.stats || {} });
      setPens({ home_pen: d.score.home_pen ?? "", away_pen: d.score.away_pen ?? "" });
      setMode((prev) => prev || (d.can_fill_sheet && d.callups.home?.length && d.callups.away?.length ? "gara" : d.can_callup.home || d.can_callup.away ? "distinta" : "gara"));
    }).catch(setError);
  }, [tid, matchId]);
  useEffect(load, [load]);
  useEffect(() => { if (!compact && user.role !== "club_manager") api.get("/users").then((r) => setReferees(r.data.filter((u) => u.role === "referee"))).catch(() => {}); }, [compact, user.role]);
  const fetchCard = useCallback((pid) => api.get(`/tournaments/${tid}/players/${pid}/card`), [tid]);

  if (error) return <ErrorState message={apiError(error)} onRetry={load} />;
  if (!m) return <LoadingState />;
  const isRef = user.role === "referee" && !user.is_super_admin;
  const isStaff = user.is_super_admin || ["director", "secretary"].includes(user.role);
  const isFinal = FINAL.includes(m.status);
  const live = scoreFromStats(sheet.stats, callups);
  const shown = isFinal || m.status === "report_submitted" ? m.score : live;
  const canDistinta = m.can_callup.home || m.can_callup.away;
  const problems = [];
  ["home", "away"].forEach((s) => { if (callups[s].length === 0) problems.push(`Distinta ${m[s].club?.short_name || s} mancante`); else if (!callups[s].some((pid) => sheet.attendance[pid] === "present")) problems.push(`Nessun presente per ${m[s].club?.short_name}`); });
  const pending = [...callups.home, ...callups.away].filter((pid) => !["present", "absent"].includes(sheet.attendance[pid])).length;
  if (pending) problems.push(`${pending} giocatori da confermare`);
  const mvpCount = Object.values(sheet.stats).filter((s) => s?.mvp).length;
  if (mvpCount !== 1) problems.push(mvpCount ? "un solo MVP" : "MVP non assegnato (★)");
  const dirty = JSON.stringify(callups) !== JSON.stringify({ home: m.callups.home || [], away: m.callups.away || [] });

  const act = async (fn, ok) => { setBusy(true); try { await fn(); toast.success(ok); load(); } catch (e) { toast.error(apiError(e)); throw e; } finally { setBusy(false); } };
  const saveCallups = () => act(async () => { const body = {}; if (m.can_callup.home) body.home = callups.home; if (m.can_callup.away) body.away = callups.away; await api.post(`/tournaments/${tid}/matches/${matchId}/callups`, body); }, "Distinte salvate");
  const sheetBody = (close, reason = "") => ({ ...sheet, close, notes, reason, checklist: m.checklist, home_pen: pens.home_pen === "" ? null : Number(pens.home_pen), away_pen: pens.away_pen === "" ? null : Number(pens.away_pen) });
  const saveSheet = () => act(() => api.post(`/tournaments/${tid}/matches/${matchId}/sheet`, sheetBody(false)), `Tabellino salvato · risultato ${live.home}-${live.away}`);
  const closeMatch = (reason) => act(() => api.post(`/tournaments/${tid}/matches/${matchId}/sheet`, sheetBody(true, reason)), isRef ? "Gara chiusa e inviata al Direttore" : isFinal ? "Risultato rettificato e ripubblicato" : "Gara chiusa e pubblicata: classifica aggiornata");
  const reopen = (reason) => act(() => api.post(`/tournaments/${tid}/matches/${matchId}/reopen`, { reason }), "Gara riaperta");
  const assign = (uid) => act(() => api.patch(`/tournaments/${tid}/matches/${matchId}`, { referee_user_id: uid }), "Arbitro assegnato");
  const checklist = (k) => setM({ ...m, checklist: { ...m.checklist, [k]: !m.checklist[k] } });
  const canEdit = (side) => (mode === "distinta" ? m.can_callup[side] : m.can_fill_sheet);
  const closeLabel = isRef ? "Chiudi gara e invia" : isFinal ? "Rettifica e ripubblica" : "Chiudi gara e pubblica";

  return (
    <div className="space-y-5" data-testid="match-workspace">
      <section className="fsl-card p-5 relative overflow-hidden">
        <div className="flex items-center justify-between text-xs text-fsl-slate mb-3"><span className="fsl-kicker">{m.competition_name} · {m.round_name}</span><MatchStatusBadge status={m.status} /></div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="flex flex-col items-center text-center gap-2"><ClubCrest club={m.home.club} size={compact ? 56 : 72} /><span className="font-display font-bold uppercase text-sm leading-tight">{m.home.club?.name}</span></div>
          <div className="text-center">
            <div className="font-display font-extrabold text-5xl sm:text-6xl num leading-none" data-testid="workspace-score">{shown.home ?? 0} - {shown.away ?? 0}</div>
            <div className="text-[10px] uppercase tracking-wider text-fsl-gold mt-1">{isFinal ? "Risultato ufficiale" : m.status === "report_submitted" ? "Inviato · da pubblicare" : "Calcolato dal tabellino"}</div>
          </div>
          <div className="flex flex-col items-center text-center gap-2"><ClubCrest club={m.away.club} size={compact ? 56 : 72} /><span className="font-display font-bold uppercase text-sm leading-tight">{m.away.club?.name}</span></div>
        </div>
        <div className="mt-4 flex flex-wrap justify-center gap-4 text-xs text-fsl-slate num"><span>{kickoffLabel(m.kickoff_at)}</span><span>{m.field_name}</span>{m.referee_name && <span>Arbitro: {m.referee_name}</span>}</div>
        {!compact && m.can_officialize && (
          <div className="mt-4 flex items-center gap-2 justify-center">
            <label className="text-xs text-fsl-slate">Assegna arbitro</label>
            <select className="fsl-input h-9 w-56" value={m.referee_user_id || ""} onChange={(e) => assign(e.target.value)} data-testid="assign-referee-select"><option value="">— nessuno —</option>{referees.map((r) => <option key={r.id} value={r.id}>{r.full_name}</option>)}</select>
          </div>
        )}
      </section>

      <div className={`grid ${isStaff ? "grid-cols-4" : "grid-cols-3"} gap-1 fsl-card p-1`} role="tablist">{[["sheet", "Tabellino", ClipboardList], ["social", "Social", Share2], ...(isStaff ? [["media", "Media", Camera]] : []), ["history", "Storia", History]].map(([k, l, Icon]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`h-11 min-w-0 px-1 rounded-md text-[11px] sm:text-xs font-semibold uppercase inline-flex items-center justify-center gap-1.5 ${tab === k ? "bg-fsl-blue" : "text-fsl-slate hover:text-fsl-white"}`} aria-label={l} data-testid={`tab-${k}`}><Icon className="h-4 w-4 shrink-0" /><span className="truncate">{l}</span></button>)}</div>

      {tab === "sheet" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-md border border-white/15 overflow-hidden" role="group" aria-label="Modalità tabellino">
              <button onClick={() => setMode("distinta")} className={`h-10 px-4 text-xs font-semibold uppercase inline-flex items-center gap-1.5 ${mode === "distinta" ? "bg-fsl-gold text-ink-950" : "text-fsl-slate hover:text-fsl-white"}`} data-testid="mode-distinta"><Users className="h-4 w-4" /> Prepara distinta</button>
              <button onClick={() => setMode("gara")} className={`h-10 px-4 text-xs font-semibold uppercase inline-flex items-center gap-1.5 ${mode === "gara" ? "bg-fsl-blue" : "text-fsl-slate hover:text-fsl-white"}`} data-testid="mode-gara"><ClipboardList className="h-4 w-4" /> Compila gara</button>
            </div>
            <p className="text-xs text-fsl-slate flex-1 min-w-[200px]">{mode === "distinta" ? "Tocca il numero per aggiungere o togliere un giocatore dalla distinta." : "Logo squadra: tutti presenti. Numero: 1° tocco presente, 2° assente, 3° da confermare. Voto base 6 con −/+; G/A/RP/★MVP (obbligatorio, uno) e AM/ES/AG aggiornano fantavoto e risultato."}</p>
          </div>

          <MatchSheet m={m} mode={mode} callups={callups} sheet={sheet} onCallups={setCallups} onSheet={setSheet} canEdit={canEdit} onOpen={setOpenPlayer} />

          {mode === "distinta" && canDistinta && <button className="btn-gold w-full" disabled={busy || !dirty} onClick={saveCallups} data-testid="save-callups-button"><Save className="h-4 w-4" /> Salva distinte</button>}

          {mode === "gara" && m.can_fill_sheet && (
            <div className="fsl-card p-4 space-y-3" data-testid="sheet-actions">
              {isRef && <div className="grid sm:grid-cols-3 gap-1">{[["teams_present", "Squadre presenti"], ["lists_verified", "Distinte verificate"], ["signatures", "Firme acquisite"]].map(([k, l]) => <button key={k} onClick={() => checklist(k)} className="h-10 flex items-center justify-between px-3 rounded-md border border-white/15 text-xs" data-testid={`checklist-${k}`}><span>{l}</span>{m.checklist[k] ? <CheckCircle2 className="h-4 w-4 text-fsl-success" /> : <span className="h-4 w-4 rounded-full border border-white/30" />}</button>)}</div>}
              {m.stage === "finals" && live.home === live.away && <div className="grid grid-cols-2 gap-2"><label><span className="fsl-label">Rigori {m.home.club?.short_name}</span><input type="number" min="0" className="fsl-input mt-1 num" value={pens.home_pen} onChange={(e) => setPens({ ...pens, home_pen: e.target.value })} data-testid="pen-home" /></label><label><span className="fsl-label">Rigori {m.away.club?.short_name}</span><input type="number" min="0" className="fsl-input mt-1 num" value={pens.away_pen} onChange={(e) => setPens({ ...pens, away_pen: e.target.value })} data-testid="pen-away" /></label></div>}
              <input className="fsl-input h-10" placeholder={isRef ? "Note del direttore di gara (opzionali)" : "Note del Direttore (opzionali)"} value={notes} onChange={(e) => setNotes(e.target.value)} data-testid="sheet-notes" />
              {problems.length > 0 ? <p className="text-xs text-fsl-warning flex items-center gap-1.5" data-testid="sheet-problems"><AlertTriangle className="h-4 w-4 shrink-0" /> {problems.join(" · ")}</p> : <p className="text-xs text-fsl-success flex items-center gap-1.5" data-testid="sheet-ready"><CheckCircle2 className="h-4 w-4" /> Tabellino completo · risultato {live.home}-{live.away}</p>}
              <div className="grid sm:grid-cols-2 gap-2">
                {!isFinal && <button className="btn-ghost" disabled={busy} onClick={saveSheet} data-testid="save-sheet-button"><Save className="h-4 w-4" /> Salva tabellino</button>}
                <button className={`${isRef ? "btn-primary" : "btn-gold"} ${isFinal ? "sm:col-span-2" : ""}`} disabled={busy || problems.length > 0} onClick={() => (isFinal ? setDialog("rectify") : closeMatch(""))} data-testid="close-match-button"><Send className="h-4 w-4" /> {closeLabel}</button>
              </div>
              {isFinal && m.can_officialize && <button className="btn-ghost w-full" disabled={busy} onClick={() => setDialog("reopen")} data-testid="reopen-button"><RotateCcw className="h-4 w-4" /> Riapri gara</button>}
            </div>
          )}
          {mode === "gara" && !m.can_fill_sheet && <div className="rounded-md bg-navy-700/50 border border-white/10 p-3 text-xs text-fsl-slate flex items-center gap-2" data-testid="sheet-locked"><CheckCircle2 className="h-4 w-4 text-fsl-success" /> {m.status === "report_submitted" ? "Gara inviata: in attesa di pubblicazione del Direttore." : isFinal ? "Risultato ufficiale: modificabile solo dal Direttore." : "Il tabellino è compilato da arbitro o Direttore."}</div>}
        </div>
      )}

      {tab === "media" && isStaff && <ShopManager tournamentId={tid} matchId={matchId} />}

      {tab === "social" && <SocialCard url={`/tournaments/${tid}/matches/${matchId}/social`} version={`${m.status}-${m.version}`} />}

      {tab === "history" && (
        <div className="fsl-card divide-y divide-white/[0.06]" data-testid="report-history">
          {m.report_versions.length === 0 && <p className="p-6 text-center text-sm text-fsl-slate">Nessuna versione: la gara non è ancora stata chiusa.</p>}
          {m.report_versions.map((v) => (
            <div key={v.id} className="p-4 text-sm">
              <div className="flex items-center justify-between"><span className="font-semibold">v{v.version} · {VERSION_KIND[v.kind]}</span><span className="text-xs text-fsl-slate num">{fmtDate(v.created_at, { time: true })} · {v.actor_role}</span></div>
              <div className="mt-1 num">{v.before && v.before.home !== null && <span className="text-fsl-danger/90 mr-3">prima {v.before.home}-{v.before.away}</span>}<span className="text-fsl-success">dopo {v.score.home}-{v.score.away}</span></div>
              {(v.reason || v.referee_notes || v.director_notes) && <p className="text-xs text-fsl-slate mt-1">{v.reason || v.referee_notes || v.director_notes}</p>}
            </div>
          ))}
          {m.tickets?.length > 0 && <div className="p-4 text-xs text-fsl-slate">{m.tickets.length} segnalazioni collegate a questa gara.</div>}
        </div>
      )}

      <PlayerCardDialog playerId={openPlayer} onClose={() => setOpenPlayer(null)} fetcher={fetchCard} />
      <ReasonDialog open={dialog === "rectify"} onOpenChange={(o) => !o && setDialog(null)} title="Rettifica e ripubblica" description={`Il risultato passerà da ${m.score.home}-${m.score.away} a ${live.home}-${live.away}. Classifica, marcatori e pagelle vengono ricalcolati; la versione precedente resta nella storia.`} confirmLabel="Rettifica" danger onConfirm={closeMatch} />
      <ReasonDialog open={dialog === "reopen"} onOpenChange={(o) => !o && setDialog(null)} title="Riapri gara" description="La gara passa in revisione; la classifica pubblica non cambia finché non pubblichi di nuovo." confirmLabel="Riapri" onConfirm={reopen} />
    </div>
  );
}
