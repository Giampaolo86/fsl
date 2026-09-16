import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";

const BADGE = { mvp: ["MVP", "bg-fsl-gold text-ink-950"], bomber: ["Bomber", "bg-fsl-success text-ink-950"], assistman: ["Assist", "bg-fsl-blue-light"], muro: ["Muro", "bg-[#5b4bd6]"] };
const ROLE_TONE = { Por: "bg-fsl-gold text-ink-950", Dif: "bg-fsl-success text-ink-950", Cen: "bg-fsl-blue", Est: "bg-fsl-blue-light", Att: "bg-fsl-danger" };

export function EventIcons({ ev }) {
  return (
    <span className="inline-flex gap-1 text-xs" aria-label="eventi">
      {Array.from({ length: ev.goal || 0 }).map((_, i) => <span key={`g${i}`} className="h-4 w-4 rounded-full bg-fsl-success inline-flex items-center justify-center text-[9px] font-bold text-ink-950">G</span>)}
      {Array.from({ length: ev.assist || 0 }).map((_, i) => <span key={`a${i}`} className="h-4 w-4 rounded-full bg-fsl-blue-light inline-flex items-center justify-center text-[9px] font-bold">A</span>)}
      {Array.from({ length: ev.yellow_card || 0 }).map((_, i) => <span key={`y${i}`} className="h-4 w-3 rounded-sm bg-fsl-warning" />)}
      {Array.from({ length: ev.red_card || 0 }).map((_, i) => <span key={`r${i}`} className="h-4 w-3 rounded-sm bg-fsl-danger" />)}
      {Array.from({ length: ev.own_goal || 0 }).map((_, i) => <span key={`o${i}`} className="h-4 w-4 rounded-full bg-fsl-danger inline-flex items-center justify-center text-[9px] font-bold">AG</span>)}
    </span>
  );
}

export function RatingRow({ r, editable, value, onChange, right = false }) {
  const Vote = (
    <div className={`flex flex-col items-center w-14 rounded-md overflow-hidden border border-white/15 ${r.absent ? "opacity-40" : ""}`}>
      {editable && !r.absent ? (
        <input type="number" min="4" max="10" step="0.5" value={value ?? ""} onChange={(e) => onChange(r.player_id, e.target.value)} className="w-full h-8 bg-ink-950/60 text-center text-sm num text-fsl-slate focus:outline-none" aria-label={`Voto ${r.name}`} data-testid={`vote-${r.player_id}`} />
      ) : (
        <div className="w-full h-8 bg-ink-950/60 text-center text-sm num text-fsl-slate flex items-center justify-center">{r.absent ? "∅" : r.vote ?? "–"}</div>
      )}
      <div className="w-full h-8 bg-fsl-blue/30 text-center font-display font-extrabold text-lg num text-fsl-blue-light flex items-center justify-center" data-testid={`fanta-${r.player_id}`}>{r.fanta ?? (value ? (Number(value) + r.bonus).toFixed(1).replace(/\.0$/, "") : "–")}</div>
    </div>
  );
  return (
    <div className={`fsl-card px-3 py-2 flex items-center gap-3 ${right ? "flex-row-reverse text-right" : ""}`} data-testid={`rating-row-${r.player_id}`}>
      <span className={`h-9 w-9 rounded-full inline-flex items-center justify-center text-[10px] font-bold uppercase shrink-0 ${ROLE_TONE[r.role] || "bg-navy-700"}`}>{r.role}</span>
      <div className="flex-1 min-w-0">
        <div className={`font-semibold text-base truncate ${r.absent ? "text-fsl-slate" : ""}`}><span className="num text-fsl-gold text-xs mr-1">{r.shirt_number ?? ""}</span>{r.name}</div>
        <div className={`flex flex-wrap items-center gap-1 mt-0.5 ${right ? "justify-end" : ""}`}><EventIcons ev={r.events} />{r.badges.map((b) => <span key={b} className={`h-4 px-1.5 rounded text-[9px] font-bold uppercase ${BADGE[b]?.[1]}`}>{BADGE[b]?.[0]}</span>)}</div>
      </div>
      {Vote}
    </div>
  );
}

export function RatingsPanel({ tournamentId, matchId, editable, homeName, awayName }) {
  const [data, setData] = useState(null);
  const [votes, setVotes] = useState({});
  const [busy, setBusy] = useState(false);
  const load = () => api.get(`/tournaments/${tournamentId}/matches/${matchId}/ratings`).then((r) => { setData(r.data); setVotes(Object.fromEntries(r.data.rows.filter((x) => x.vote != null).map((x) => [x.player_id, x.vote]))); });
  useEffect(() => { load(); }, [tournamentId, matchId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!data) return <p className="text-sm text-fsl-slate">Caricamento pagelle…</p>;
  const save = async () => { setBusy(true); try { await api.post(`/tournaments/${tournamentId}/matches/${matchId}/ratings`, { ratings: votes }); toast.success("Pagelle salvate"); load(); } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); } };
  const side = (s) => data.rows.filter((r) => r.side === s);
  if (data.rows.length === 0) return <div className="fsl-card p-6 text-center text-sm text-fsl-slate" data-testid="ratings-empty">Nessun convocato: compila le convocazioni per assegnare le pagelle.</div>;
  return (
    <div className="space-y-3" data-testid="ratings-panel">
      <p className="text-xs text-fsl-slate">Voto 4–10 (passo 0,5). Fantavoto = voto + bonus: gol +3, assist +1, ammonizione −0,5, espulsione −1, autogol −2, portiere −1 per gol subito, +1 porta inviolata. Il miglior fantavoto è MVP.</p>
      <div className="grid md:grid-cols-2 gap-3">
        <div className="space-y-2"><div className="fsl-kicker">{homeName}</div>{side("home").map((r) => <RatingRow key={r.player_id} r={r} editable={editable} value={votes[r.player_id]} onChange={(pid, v) => setVotes({ ...votes, [pid]: v })} />)}</div>
        <div className="space-y-2"><div className="fsl-kicker text-right">{awayName}</div>{side("away").map((r) => <RatingRow key={r.player_id} r={r} editable={editable} value={votes[r.player_id]} onChange={(pid, v) => setVotes({ ...votes, [pid]: v })} right />)}</div>
      </div>
      {editable && <button className="btn-gold w-full" disabled={busy} onClick={save} data-testid="save-ratings-button">Salva pagelle e assegna MVP</button>}
    </div>
  );
}
