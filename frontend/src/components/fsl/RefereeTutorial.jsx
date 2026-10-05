import { Check, Lock, Send, Star } from "lucide-react";
import { Chip, Row, Tap, TutorialPlayer } from "@/components/fsl/TutorialKit";

const PLAYERS = [[1, "Bianchi"], [4, "Conti"], [7, "Esposito"], [9, "Ferri"], [10, "Greco"], [11, "Marino"], [14, "Russo"]];
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
        <Tap on={!!f.save} className="w-full" ring="rounded-xl"><span className={`w-full h-10 rounded-lg text-xs font-bold inline-flex items-center justify-center ${f.save ? "bg-fsl-gold text-ink-950" : "bg-white/10 text-fsl-slate"}`}>Salva distinta</span></Tap>
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
        <Tap on={f.stage === 1} className="w-full" ring="rounded-xl"><span className={`w-full h-11 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors ${f.stage >= 3 ? "bg-fsl-success text-ink-950" : f.stage === 2 ? "bg-fsl-gold/60 text-ink-950" : "bg-fsl-gold text-ink-950"}`}>{f.stage >= 3 ? <><Lock className="h-4 w-4" /> Referto inviato</> : f.stage === 2 ? "Invio…" : <><Send className="h-4 w-4" /> Chiudi gara e invia</>}</span></Tap>
        {f.stage === 4 && <div className="rounded-lg border border-fsl-success/40 bg-fsl-success/10 px-2 py-2 text-[11px] text-fsl-success">Classifica aggiornata · Marcatori · Badge assegnati</div>}
      </>
    ),
  },
};

export const RefereeTutorial = ({ step }) => <TutorialPlayer scene={SCENES[step]} step={step} prefix="referee" />;
