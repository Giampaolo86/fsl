import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

let pdfjsPromise;
const loadPdfjs = () => {
  pdfjsPromise ||= import("pdfjs-dist/build/pdf.min.mjs").then((lib) => { lib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"; return lib; });
  return pdfjsPromise;
};

function Page({ doc, num, width }) {
  const ref = useRef(null);
  const task = useRef(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (task.current) { try { task.current.cancel(); await task.current.promise.catch(() => {}); } catch { /* già conclusa */ } task.current = null; }
      const page = await doc.getPage(num);
      if (cancelled || !ref.current) return;
      const base = page.getViewport({ scale: 1 });
      const scale = (width / base.width) * (window.devicePixelRatio > 1 ? 1.5 : 1);
      const vp = page.getViewport({ scale });
      const canvas = ref.current;
      canvas.width = vp.width; canvas.height = vp.height;
      canvas.style.width = `${width}px`; canvas.style.height = `${(width * base.height) / base.width}px`;
      const ctx = canvas.getContext("2d");
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      task.current = page.render({ canvasContext: ctx, viewport: vp });
      await task.current.promise.catch(() => {});
      task.current = null;
    })();
    return () => { cancelled = true; };
  }, [doc, num, width]);
  return <figure className="space-y-1" data-testid={`pdf-preview-page-${num}`}><canvas ref={ref} className="rounded-md shadow-xl border border-white/10 bg-white" aria-label={`Pagina ${num}`} /><figcaption className="text-[10px] text-fsl-slate text-center num">Pagina {num}</figcaption></figure>;
}

export function PdfPreview({ blob }) {
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState(null);
  const box = useRef(null);
  const [width, setWidth] = useState(760);
  useEffect(() => {
    if (!blob) return undefined;
    let d;
    setDoc(null); setError(null);
    blob.arrayBuffer().then((buf) => loadPdfjs().then((lib) => lib.getDocument({ data: buf }).promise)).then((pdf) => { d = pdf; setDoc(pdf); }).catch((e) => setError(String(e?.message || e)));
    return () => { d?.destroy?.(); };
  }, [blob]);
  useEffect(() => {
    const measure = () => { if (box.current) setWidth(Math.max(280, Math.min(900, box.current.clientWidth - 8))); };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  return (
    <div ref={box} className="rounded-xl bg-ink-950/60 border border-white/10 p-3 max-h-[60vh] overflow-y-auto space-y-4" data-testid="pdf-preview">
      {error && <p className="text-sm text-fsl-danger" data-testid="pdf-preview-error">Anteprima non disponibile: {error}</p>}
      {!doc && !error && <div className="py-10 text-center text-fsl-slate"><Loader2 className="h-6 w-6 animate-spin mx-auto" /><p className="text-xs mt-2">Preparo l'anteprima…</p></div>}
      {doc && <p className="text-xs text-fsl-slate" data-testid="pdf-preview-count">{doc.numPages} pagine · A4 orizzontale</p>}
      {doc && Array.from({ length: doc.numPages }, (_, i) => <Page key={i + 1} doc={doc} num={i + 1} width={width} />)}
    </div>
  );
}
