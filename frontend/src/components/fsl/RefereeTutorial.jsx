import { useEffect, useState } from "react";
import { Check, Lock, Pause, Play, Plus, RotateCcw, Send, Star } from "lucide-react";

const PLAYERS = [[1, "Bianchi"], [4, "Conti"], [7, "Esposito"], [9, "Ferri"], [10, "Greco"], [11, "Marino"], [14, "Russo"]];
const STEP_MS = 1500;

const Tap = ({ on, children, className = "" }) => (
  <span className={`relative inline-flex ${className}`}>{children}{on && <span className="pointer-events-none absolute -inset-1.5 rounded-full border-2 border-fsl-gold animate-ping" aria-hidden="true" />}{on && <span className="pointer-events-none absolute -inset-1.5 rounded-full border-2 border-fsl-gold/80" aria-hidden="true" />}</span>
);

const Num = ({ n, state, tap }) => (
  <Tap on={tap}><span className={`h-8 w-8 rounded-full border text-xs font-bold num inline-flex items-center justify-center transition-colors duration-300 ${state === "present" ? "bg-fsl-success border-fsl-success text-ink-950" : state === "absent" ? "bg-fsl-danger border-fsl-danger text-white" : state === "pending" ? "bg-fsl-warning border-fsl-warning text-ink-950" : "border-white/25 text-fsl-slate"}`}>{n}</span></Tap>
);

const Chip = ({ label, value, tap, gold = false }) => (
  <Tap on={tap}><span className={`h-7 px-2 rounded-md border text-[10px] font-bold inline-flex items-center gap-1 ${value ? (gold ? "bg-fsl-gold text-ink-950 border-fsl-gold" : "bg-white/15 border-white/30 text-white") : "border-white/15 text-fsl-slate"}`}>{label}{value ? <span className="num">{value}</span> : <Plus className="h-3 w-3" />}</span></Tap>
);

const Row = ({ p, pres, extra }) => (
  <div className="flex items-center gap-2 h-10 px-2 rounded-lg bg-white/[0.04] border border-white/10">
    <Num n={p[0]} state={pres.state} tap={pres.tap} />
    <span className="text-xs font-semibold flex-1 truncate">{p[1]}</span>
    {extra}
  </div>
);

function Scoreboard({ home, away, live }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-ink-950 border border-fsl-gold/40 px-3 py-2">
      <span className="text-[10px] font-display uppercase text-fsl-slate">Sporting Eur</span>
      <span className="font-display font-black text-2xl num text-white">{home} <span className="text-fsl-gold">–</span> {away}</span>
      <span className="text-[10px] font-display uppercase text-fsl-slate">Appio Latino</span>
      {live && <span className="absolute right-6 top-2 h-1.5 w-1.5 rounded-full bg-fsl-danger animate-pulse" aria-hidden="true" />}
    </div>
  );
}

const presence = (i, upto, absentIdx) => (i < upto ? { state: i === absentIdx ? "absent" : "present", tap: false } : { state: null, tap: i === upto });

const SCENES = {
  1: {
    frames: [
      { caption: "Apri la gara e scegli «Prepara distinta».", upto: 0 },
      { caption: "Tocca il numero di maglia: 1° tocco = presente (verde).", upto: 1 },
      { caption: "Continua con tutti i giocatori in campo…", upto: 3 },
      { caption: "2° tocco = assente (rosso), 3° = da confermare (giallo).", upto: 5, absent: 3 },
      { caption: "Quando le due distinte sono complete, salva.", upto: 7, absent: 3, save: true },
    ],
    render: (f) => (
      <>
        <div className="text-[10px] font-display uppercase tracking-wider text-fsl-gold">Prepara distinta · Sporting Eur</div>
        <div className="space-y-1.5">{PLAYERS.map((p, i) => <Row key={p[0]} p={p} pres={presence(i, f.upto, f.absent)} />)}</div>
        <Tap on={!!f.save} className="w-full"><span className={`w-full h-10 rounded-lg text-xs font-bold inline-flex items-center justify-center ${f.save ? "bg-fsl-gold text-ink-950" : "bg-white/10 text-fsl-slate"}`}>Salva distinta</span></Tap>
      </>
    ),
  },
  2: {
    frames: [
      { caption: "Passa a «Compila gara»: tocca il logo per segnare tutti presenti.", all: false, logo: true },
      { caption: "Tutti presenti in un tocco.", all: true },
      { caption: "Esposito segna: tocca «Gol +». Il punteggio si aggiorna da solo.", all: true, goals: { 7: 1 }, tap: "g7", home: 1 },
      { caption: "Assist di Greco: «Assist +».", all: true, goals: { 7: 1 }, assists: { 10: 1 }, tap: "a10", home: 1 },
      { caption: "Ammonizione: «Amm. +» su Conti.", all: true, goals: { 7: 1 }, assists: { 10: 1 }, cards: { 4: 1 }, tap: "c4", home: 1 },
      { caption: "Scegli l'MVP della gara con la stella: è obbligatorio, uno solo.", all: true, goals: { 7: 1 }, assists: { 10: 1 }, cards: { 4: 1 }, mvp: 7, tap: "m7", home: 1 },
    ],
    render: (f) => (
      <>
        <div className="relative"><Scoreboard home={f.home || 0} away={0} live /></div>
        <div className="flex items-center gap-2"><Tap on={!!f.logo}><span className="h-9 w-9 rounded-full bg-emerald-700 border-2 border-white/40 inline-flex items-center justify-center text-[9px] font-black">SPO</span></Tap><span className="text-[10px] text-fsl-slate">Tocca il logo = tutti presenti</span></div>
        <div className="space-y-1.5">{PLAYERS.slice(0, 5).map((p) => <Row key={p[0]} p={p} pres={{ state: f.all ? "present" : null }} extra={<div className="flex gap-1"><Chip label="Gol" value={f.goals?.[p[0]]} tap={f.tap === `g${p[0]}`} /><Chip label="Ast" value={f.assists?.[p[0]]} tap={f.tap === `a${p[0]}`} /><Chip label="Amm" value={f.cards?.[p[0]]} tap={f.tap === `c${p[0]}`} /><Tap on={f.tap === `m${p[0]}`}><Star className={`h-5 w-5 ${f.mvp === p[0] ? "fill-fsl-gold text-fsl-gold" : "text-white/30"}`} /></Tap></div>} />)}</div>
      </>
    ),
  },
  3: {
    frames: [
      { caption: "Prima di chiudere: la checklist.", checks: 0 },
      { caption: "Squadre presenti ✓", checks: 1 },
      { caption: "Distinte verificate ✓", checks: 2 },
      { caption: "Firme acquisite ✓", checks: 3 },
      { caption: "Scrivi eventuali note: infortuni, ritardi, comportamento.", checks: 3, note: "Infortunio al n. 9 al 20'…" },
      { caption: "Nelle finali con parità inserisci i rigori.", checks: 3, note: "Infortunio al n. 9 al 20'…", pens: true },
    ],
    render: (f) => (
      <>
        <div className="text-[10px] font-display uppercase tracking-wider text-fsl-gold">Checklist e note</div>
        {["Squadre presenti", "Distinte verificate", "Firme acquisite"].map((l, i) => (
          <div key={l} className="flex items-center gap-2 h-10 px-2 rounded-lg bg-white/[0.04] border border-white/10"><Tap on={f.checks === i}><span className={`h-6 w-6 rounded-md border inline-flex items-center justify-center transition-colors ${f.checks > i ? "bg-fsl-success border-fsl-success text-ink-950" : "border-white/30"}`}>{f.checks > i && <Check className="h-4 w-4" />}</span></Tap><span className="text-xs font-semibold">{l}</span></div>
        ))}
        <div className={`rounded-lg border px-2 py-2 text-xs min-h-[44px] ${f.note ? "border-fsl-gold/50 text-white" : "border-white/15 text-fsl-slate"}`}>{f.note || "Note dell'arbitro…"}{f.note && <span className="animate-pulse">|</span>}</div>
        {f.pens && <div className="flex items-center justify-between rounded-lg border border-fsl-gold/50 px-2 py-2 text-xs"><span className="text-fsl-slate">Rigori</span><span className="num font-bold">4 <span className="text-fsl-gold">–</span> 3</span></div>}
      </>
    ),
  },
  4: {
    frames: [
      { caption: "Controlla il risultato: lo calcola il tabellino, non si scrive a mano.", stage: 0 },
      { caption: "Tocca «Chiudi gara e invia».", stage: 1 },
      { caption: "Invio in corso…", stage: 2 },
      { caption: "Referto inviato e bloccato: il Direttore lo ufficializza.", stage: 3 },
      { caption: "Classifiche, marcatori e badge si aggiornano solo con i risultati ufficiali.", stage: 4 },
    ],
    render: (f) => (
      <>
        <div className="relative"><Scoreboard home={2} away={1} /></div>
        <div className="grid grid-cols-3 gap-1.5 text-center">{[["Gol", 3], ["MVP", 1], ["Amm.", 2]].map(([l, v]) => <div key={l} className="rounded-lg bg-white/[0.04] border border-white/10 py-2"><div className="num font-black text-lg">{v}</div><div className="text-[9px] uppercase text-fsl-slate">{l}</div></div>)}</div>
        <Tap on={f.stage === 1} className="w-full"><span className={`w-full h-11 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors ${f.stage >= 3 ? "bg-fsl-success text-ink-950" : f.stage === 2 ? "bg-fsl-gold/60 text-ink-950" : "bg-fsl-gold text-ink-950"}`}>{f.stage >= 3 ? <><Lock className="h-4 w-4" /> Referto inviato</> : f.stage === 2 ? "Invio…" : <><Send className="h-4 w-4" /> Chiudi gara e invia</>}</span></Tap>
        {f.stage === 4 && <div className="rounded-lg border border-fsl-success/40 bg-fsl-success/10 px-2 py-2 text-[11px] text-fsl-success">Classifica aggiornata · Marcatori · Badge assegnati</div>}
      </>
    ),
  },
};

export function RefereeTutorial({ step }) {
  const scene = SCENES[step];
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  useEffect(() => {
    if (!playing) return undefined;
    const id = setInterval(() => setI((n) => (n + 1) % scene.frames.length), STEP_MS);
    return () => clearInterval(id);
  }, [playing, scene.frames.length]);
  const f = scene.frames[i];
  return (
    <div className="flex flex-col items-center gap-3" data-testid={`referee-tutorial-${step}`}>
      <div className="w-[280px] rounded-[2rem] border-[6px] border-ink-950 bg-navy-900 shadow-2xl p-3 pt-6 relative" aria-hidden="true">
        <span className="absolute top-2 left-1/2 -translate-x-1/2 h-1.5 w-16 rounded-full bg-ink-950" />
        <div className="space-y-2 text-white">{scene.render(f)}</div>
      </div>
      <p className="text-sm text-center text-fsl-white min-h-[40px] max-w-[300px]" data-testid={`referee-tutorial-caption-${step}`} aria-live="polite">{f.caption}</p>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setPlaying((p) => !p)} className="btn-ghost h-8 px-2.5 text-xs" aria-label={playing ? "Pausa" : "Riproduci"} data-testid={`referee-tutorial-toggle-${step}`}>{playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}</button>
        <button type="button" onClick={() => { setI(0); setPlaying(true); }} className="btn-ghost h-8 px-2.5 text-xs" aria-label="Ricomincia" data-testid={`referee-tutorial-replay-${step}`}><RotateCcw className="h-3.5 w-3.5" /></button>
        <div className="flex gap-1">{scene.frames.map((_, k) => <button key={k} type="button" onClick={() => { setI(k); setPlaying(false); }} className={`h-1.5 rounded-full transition-all ${k === i ? "w-5 bg-fsl-gold" : "w-1.5 bg-white/25"}`} aria-label={`Fotogramma ${k + 1}`} />)}</div>
      </div>
    </div>
  );
}
