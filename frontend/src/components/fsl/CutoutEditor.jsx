import { useCallback, useEffect, useRef, useState } from "react";
import { Brush, Eraser, RotateCcw, Undo2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const loadImg = (file) => new Promise((res, rej) => { const url = URL.createObjectURL(file); const im = new Image(); im.onload = () => { URL.revokeObjectURL(url); res(im); }; im.onerror = rej; im.src = url; });
const CHECKER = "repeating-conic-gradient(#2a3346 0% 25%, #1b2233 0% 50%) 0 0 / 20px 20px";

// Ritocco dello scontorno: pennello «Ripristina» (riporta i pixel originali) / «Cancella», su maschera alpha.
export function CutoutEditor({ original, cutout, remaining = 0, onDone }) {
  const view = useRef(null);
  const orig = useRef(null);
  const mask = useRef(null);
  const undo = useRef([]);
  const drawing = useRef(false);
  const [tool, setTool] = useState("restore");
  const [size, setSize] = useState(28);
  const [ready, setReady] = useState(false);
  const [undoN, setUndoN] = useState(0);

  const render = useCallback(() => {
    const c = view.current; if (!c || !orig.current) return;
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(orig.current, 0, 0);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(mask.current, 0, 0);
    ctx.globalCompositeOperation = "source-over";
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [io, ic] = await Promise.all([loadImg(original), loadImg(cutout)]);
      if (!alive) return;
      const w = ic.naturalWidth, h = ic.naturalHeight;
      const o = document.createElement("canvas"); o.width = w; o.height = h; o.getContext("2d").drawImage(io, 0, 0, w, h); orig.current = o;
      const m = document.createElement("canvas"); m.width = w; m.height = h; m.getContext("2d").drawImage(ic, 0, 0); mask.current = m;
      view.current.width = w; view.current.height = h;
      undo.current = []; setUndoN(0); setReady(true); render();
    })();
    return () => { alive = false; };
  }, [original, cutout, render]);

  const pos = (e) => { const r = view.current.getBoundingClientRect(); const p = e.touches ? e.touches[0] : e; return [((p.clientX - r.left) / r.width) * view.current.width, ((p.clientY - r.top) / r.height) * view.current.height]; };
  const dot = (x, y) => {
    const ctx = mask.current.getContext("2d");
    ctx.globalCompositeOperation = tool === "erase" ? "destination-out" : "source-over";
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x, y, (size * view.current.width) / view.current.getBoundingClientRect().width / 2, 0, Math.PI * 2); ctx.fill();
  };
  const start = (e) => { e.preventDefault(); if (!ready) return; const ctx = mask.current.getContext("2d"); undo.current = [...undo.current.slice(-19), ctx.getImageData(0, 0, mask.current.width, mask.current.height)]; setUndoN(undo.current.length); drawing.current = true; const [x, y] = pos(e); dot(x, y); render(); };
  const move = (e) => { if (!drawing.current) return; e.preventDefault(); const [x, y] = pos(e); dot(x, y); render(); };
  const end = () => { drawing.current = false; };
  const doUndo = () => { const im = undo.current.pop(); if (!im) return; mask.current.getContext("2d").putImageData(im, 0, 0); setUndoN(undo.current.length); render(); };
  const reset = async () => { const ic = await loadImg(cutout); const ctx = mask.current.getContext("2d"); ctx.globalCompositeOperation = "source-over"; ctx.clearRect(0, 0, mask.current.width, mask.current.height); ctx.drawImage(ic, 0, 0); undo.current = []; setUndoN(0); render(); };
  const save = () => view.current.toBlob((b) => onDone(new File([b], cutout.name, { type: "image/png" })), "image/png");

  return (
    <Dialog open onOpenChange={(o) => !o && onDone(cutout)}>
      <DialogContent className="bg-navy-800 border-white/20 text-fsl-white rounded-xl max-w-2xl" aria-describedby={undefined} data-testid="cutout-editor">
        <DialogHeader><DialogTitle className="font-display uppercase text-2xl">Ritocca lo scontorno</DialogTitle></DialogHeader>
        <p className="text-xs text-fsl-slate -mt-2">Passa il pennello sui bordi: <b>Ripristina</b> riporta i pixel della foto originale, <b>Cancella</b> rimuove lo sfondo rimasto.</p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-white/15 overflow-hidden">
            <button type="button" className={`h-9 px-3 text-xs font-bold inline-flex items-center gap-1.5 ${tool === "restore" ? "bg-fsl-gold text-ink-950" : "bg-white/5"}`} onClick={() => setTool("restore")} data-testid="cutout-tool-restore"><Brush className="h-4 w-4" /> Ripristina</button>
            <button type="button" className={`h-9 px-3 text-xs font-bold inline-flex items-center gap-1.5 ${tool === "erase" ? "bg-fsl-gold text-ink-950" : "bg-white/5"}`} onClick={() => setTool("erase")} data-testid="cutout-tool-erase"><Eraser className="h-4 w-4" /> Cancella</button>
          </div>
          <label className="inline-flex items-center gap-2 text-xs text-fsl-slate">Pennello <input type="range" min="6" max="90" value={size} onChange={(e) => setSize(Number(e.target.value))} className="w-28 accent-[#F4AE2B]" data-testid="cutout-brush-size" /><span className="num w-6">{size}</span></label>
          <div className="ml-auto inline-flex gap-1">
            <button type="button" className="btn-ghost h-9" disabled={!undoN} onClick={doUndo} data-testid="cutout-undo"><Undo2 className="h-4 w-4" /> Annulla</button>
            <button type="button" className="btn-ghost h-9" onClick={reset} data-testid="cutout-reset"><RotateCcw className="h-4 w-4" /> Ricomincia</button>
          </div>
        </div>
        <div className="rounded-xl border border-white/10 overflow-hidden flex items-center justify-center" style={{ background: CHECKER, maxHeight: "58vh" }}>
          <canvas ref={view} className="max-h-[58vh] max-w-full touch-none" style={{ cursor: "crosshair" }} onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end} onTouchStart={start} onTouchMove={move} onTouchEnd={end} data-testid="cutout-canvas" />
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex gap-2">
            <button type="button" className="btn-ghost h-10" onClick={() => onDone(cutout)} data-testid="cutout-skip">Usa così</button>
            {remaining > 0 && <button type="button" className="btn-ghost h-10 text-fsl-slate" onClick={() => onDone(cutout, true)} data-testid="cutout-skip-all">Salta tutte ({remaining})</button>}
          </div>
          <button type="button" className="btn-gold h-10" disabled={!ready} onClick={save} data-testid="cutout-save">Salva ritocco</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Hook: const [refine, editor] = useCutoutEditor(); const file = await refine(original, cutout, remaining); render {editor}
export function useCutoutEditor() {
  const [job, setJob] = useState(null);
  const skipAll = useRef(false);
  const refine = useCallback((original, cutout, remaining = 0) => {
    if (skipAll.current || !cutout || cutout.type !== "image/png") return Promise.resolve(cutout);
    return new Promise((resolve) => setJob({ original, cutout, remaining, resolve }));
  }, []);
  const resetSkip = useCallback(() => { skipAll.current = false; }, []);
  const editor = job ? <CutoutEditor original={job.original} cutout={job.cutout} remaining={job.remaining} onDone={(f, all) => { if (all) skipAll.current = true; setJob(null); job.resolve(f); }} /> : null;
  return [refine, editor, resetSkip];
}
