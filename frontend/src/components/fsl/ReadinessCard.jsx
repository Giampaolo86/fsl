import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronRight, Info, Loader2, Rocket } from "lucide-react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { fmtDate } from "@/lib/format";

function Item({ it, onToggle, busy }) {
  const neutral = it.done === null;
  const box = it.auto ? (
    <span className={`h-6 w-6 rounded-md border inline-flex items-center justify-center shrink-0 ${it.done ? "bg-fsl-success border-fsl-success text-ink-950" : neutral ? "border-white/20 text-fsl-slate" : it.info ? "border-fsl-warning/60 text-fsl-warning" : "border-fsl-danger/60"}`} aria-hidden="true">{it.done ? <Check className="h-4 w-4" /> : neutral || it.info ? <Info className="h-3.5 w-3.5" /> : null}</span>
  ) : (
    <button type="button" disabled={busy} onClick={() => onToggle(it.key, !it.done)} className={`h-6 w-6 rounded-md border inline-flex items-center justify-center shrink-0 transition-colors ${it.done ? "bg-fsl-gold border-fsl-gold text-ink-950" : "border-white/30 hover:border-fsl-gold"}`} aria-pressed={!!it.done} aria-label={`${it.done ? "Togli spunta" : "Spunta"}: ${it.label}`} data-testid={`readiness-toggle-${it.key}`}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : it.done ? <Check className="h-4 w-4" /> : null}</button>
  );
  return (
    <li className="flex items-start gap-3 py-2.5 border-t border-white/[0.06] first:border-0" data-testid={`readiness-item-${it.key}`}>
      {box}
      <div className="min-w-0 flex-1">
        <div className={`text-sm font-semibold ${it.done ? "text-fsl-slate line-through decoration-white/30" : ""}`}>{it.label}{!it.auto && <span className="ml-2 text-[10px] uppercase text-fsl-gold/80">a tua cura</span>}</div>
        <div className="text-xs text-fsl-slate">{it.detail}</div>
      </div>
      {!it.done && <Link to={it.to} className="btn-ghost h-8 px-2 text-xs shrink-0" data-testid={`readiness-go-${it.key}`}>Vai <ChevronRight className="h-3.5 w-3.5" /></Link>}
    </li>
  );
}

export function ReadinessCard({ tid, cid }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState("");
  useEffect(() => { api.get(`/tournaments/${tid}/clubs/${cid}/readiness`).then((r) => setData(r.data)).catch(() => setData(false)); }, [tid, cid]);
  if (!data) return null;
  const toggle = async (key, done) => {
    setBusy(key);
    try { const r = await api.post(`/tournaments/${tid}/clubs/${cid}/readiness/${key}`, { done }); setData(r.data); if (r.data.score === 100) toast.success("Siete pronti per la prima giornata!"); } catch (e) { toast.error(apiError(e)); } finally { setBusy(""); }
  };
  const tone = data.score === 100 ? "text-fsl-success" : data.score >= 60 ? "text-fsl-gold" : "text-fsl-warning";
  return (
    <section className="fsl-card-gold p-5" data-testid="readiness-card">
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative h-16 w-16 shrink-0" aria-hidden="true">
          <svg viewBox="0 0 36 36" className="h-16 w-16 -rotate-90"><circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" /><circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className={`${tone} transition-all duration-700`} strokeDasharray={`${data.score * 0.974} 100`} /></svg>
          <span className={`absolute inset-0 inline-flex items-center justify-center font-display font-black text-lg num ${tone}`}>{data.score}%</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="fsl-kicker flex items-center gap-2"><Rocket className="h-3.5 w-3.5 text-fsl-gold" /> Checklist pre-torneo</div>
          <h2 className="font-display font-extrabold uppercase text-xl leading-tight" data-testid="readiness-title">{data.score === 100 ? "Pronti per la prima giornata!" : "Pronti per la prima giornata?"}</h2>
          <p className="text-xs text-fsl-slate" data-testid="readiness-progress">{data.done} di {data.total} cose fatte · le voci con la spunta automatica si aggiornano da sole dai tuoi dati</p>
        </div>
      </div>
      <ul className="mt-4">{data.items.map((it) => <Item key={it.key} it={it} onToggle={toggle} busy={busy === it.key} />)}</ul>
      {data.rosters?.length > 0 && <RosterChecklist rosters={data.rosters} deadline={data.deadline} />}
    </section>
  );
}

function RosterChecklist({ rosters, deadline }) {
  const missing = rosters.filter((r) => !r.ok);
  const days = deadline ? Math.ceil((new Date(deadline) - Date.now()) / 86400000) : null;
  return (
    <div className="mt-4 rounded-lg border border-white/10 bg-ink-950/40 p-4" data-testid="roster-checklist">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display font-bold uppercase text-base">Rose da caricare</h3>
        <span className={`text-xs num ${missing.length ? "text-fsl-warning" : "text-fsl-success"}`} data-testid="roster-checklist-summary">{missing.length ? `${missing.length} di ${rosters.length} rose mancanti o incomplete` : "Tutte le rose sono complete"}</span>
        {deadline && <span className="ml-auto text-xs text-fsl-slate num" data-testid="roster-checklist-deadline">Prima gara {fmtDate(deadline)}{days !== null && days >= 0 ? ` · tra ${days} giorni` : ""}</span>}
      </div>
      <ul className="mt-3 grid sm:grid-cols-2 gap-2">
        {rosters.map((r) => (
          <li key={r.team_id} className={`flex items-center gap-3 rounded-md border px-3 py-2 ${r.ok ? "border-fsl-success/30" : r.players ? "border-fsl-warning/40" : "border-fsl-danger/40"}`} data-testid={`roster-row-${r.category}`}>
            <span className="font-display font-black text-fsl-gold text-lg num w-12">{r.category}</span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold truncate">{r.name}</span>
              <span className="block text-[11px] text-fsl-slate num">{r.players} giocatori{!r.ok && ` · minimo ${r.min}`}{r.first_kickoff && ` · esordio ${fmtDate(r.first_kickoff)}`}</span>
            </span>
            {r.ok ? <span className="text-xs text-fsl-success inline-flex items-center gap-1"><Check className="h-3.5 w-3.5" /> OK</span>
              : <Link to="/societa/rose" className="btn-gold h-8 px-3 text-xs" data-testid={`roster-upload-${r.category}`}>{r.players ? "Completa" : "Carica rosa"}</Link>}
          </li>
        ))}
      </ul>
    </div>
  );
}
