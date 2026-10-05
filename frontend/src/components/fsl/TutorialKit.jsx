import { useEffect, useState } from "react";
import { Pause, Play, Plus, RotateCcw } from "lucide-react";

export const STEP_MS = 1500;

export const Tap = ({ on, children, className = "", ring = "rounded-full" }) => (
  <span className={`relative inline-flex ${className}`}>{children}{on && <span className={`pointer-events-none absolute -inset-1.5 ${ring} border-2 border-fsl-gold animate-ping`} aria-hidden="true" />}{on && <span className={`pointer-events-none absolute -inset-1.5 ${ring} border-2 border-fsl-gold/80`} aria-hidden="true" />}</span>
);

export const Num = ({ n, state, tap }) => (
  <Tap on={tap}><span className={`h-8 w-8 rounded-full border text-xs font-bold num inline-flex items-center justify-center transition-colors duration-300 ${state === "present" ? "bg-fsl-success border-fsl-success text-ink-950" : state === "absent" ? "bg-fsl-danger border-fsl-danger text-white" : state === "pending" ? "bg-fsl-warning border-fsl-warning text-ink-950" : "border-white/25 text-fsl-slate"}`}>{n}</span></Tap>
);

export const Chip = ({ label, value, tap, gold = false }) => (
  <Tap on={tap}><span className={`h-7 px-2 rounded-md border text-[10px] font-bold inline-flex items-center gap-1 ${value ? (gold ? "bg-fsl-gold text-ink-950 border-fsl-gold" : "bg-white/15 border-white/30 text-white") : "border-white/15 text-fsl-slate"}`}>{label}{value ? <span className="num">{value}</span> : <Plus className="h-3 w-3" />}</span></Tap>
);

export const Row = ({ p, pres, extra }) => (
  <div className="flex items-center gap-2 h-10 px-2 rounded-lg bg-white/[0.04] border border-white/10">
    <Num n={p[0]} state={pres.state} tap={pres.tap} />
    <span className="text-xs font-semibold flex-1 truncate">{p[1]}</span>
    {extra}
  </div>
);

export const Btn = ({ on, label, tone = "gold", className = "" }) => (
  <Tap on={on} className={`w-full ${className}`} ring="rounded-xl"><span className={`w-full h-10 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors ${tone === "gold" ? "bg-fsl-gold text-ink-950" : tone === "success" ? "bg-fsl-success text-ink-950" : "bg-white/10 text-fsl-slate"}`}>{label}</span></Tap>
);

export const Title = ({ children }) => <div className="text-[10px] font-display uppercase tracking-wider text-fsl-gold">{children}</div>;

export function TutorialPlayer({ scene, step, prefix }) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  useEffect(() => {
    if (!playing) return undefined;
    const id = setInterval(() => setI((n) => (n + 1) % scene.frames.length), STEP_MS);
    return () => clearInterval(id);
  }, [playing, scene.frames.length]);
  const f = scene.frames[i];
  return (
    <div className="flex flex-col items-center gap-3" data-testid={`${prefix}-tutorial-${step}`}>
      <div className="w-[280px] rounded-[2rem] border-[6px] border-ink-950 bg-navy-900 shadow-2xl p-3 pt-6 relative" aria-hidden="true">
        <span className="absolute top-2 left-1/2 -translate-x-1/2 h-1.5 w-16 rounded-full bg-ink-950" />
        <div className="space-y-2 text-white">{scene.render(f)}</div>
      </div>
      <p className="text-sm text-center text-fsl-white min-h-[40px] max-w-[300px]" data-testid={`${prefix}-tutorial-caption-${step}`} aria-live="polite">{f.caption}</p>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setPlaying((p) => !p)} className="btn-ghost h-8 px-2.5 text-xs" aria-label={playing ? "Pausa" : "Riproduci"} data-testid={`${prefix}-tutorial-toggle-${step}`}>{playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}</button>
        <button type="button" onClick={() => { setI(0); setPlaying(true); }} className="btn-ghost h-8 px-2.5 text-xs" aria-label="Ricomincia" data-testid={`${prefix}-tutorial-replay-${step}`}><RotateCcw className="h-3.5 w-3.5" /></button>
        <div className="flex gap-1">{scene.frames.map((_, k) => <button key={k} type="button" onClick={() => { setI(k); setPlaying(false); }} className={`h-1.5 rounded-full transition-all ${k === i ? "w-5 bg-fsl-gold" : "w-1.5 bg-white/25"}`} aria-label={`Fotogramma ${k + 1}`} />)}</div>
      </div>
    </div>
  );
}
