import { useEffect, useState } from "react";
import { Eye, FileDown, Loader2, Sparkles, Upload } from "lucide-react";
import { PdfPreview } from "@/components/fsl/PdfPreview";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, apiError } from "@/lib/api";
import { mediaUrl, uploadMedia } from "@/lib/upload";

const SECTIONS = [["cover", "Copertina"], ["groups", "Gironi con stemmi"], ["schedule", "Programma gare (una pagina per giornata)"], ["finals", "Fase finale"], ["info", "Pagina info + QR code"]];

export function ProgramPdfDialog({ open, onOpenChange, tid, categories, category }) {
  const [f, setF] = useState(null);
  const [cat, setCat] = useState(category || "");
  const [busy, setBusy] = useState("");
  const [blob, setBlob] = useState(null);
  useEffect(() => { if (open) api.get(`/tournaments/${tid}/simple/program-settings`).then((r) => setF(r.data)).catch((e) => toast.error(apiError(e))); }, [open, tid]);
  useEffect(() => { setCat(category || ""); }, [category]);
  if (!f) return null;
  const set = (k, v) => setF({ ...f, [k]: v });
  const toggleSection = (k) => { set("sections", f.sections.includes(k) ? f.sections.filter((x) => x !== k) : [...f.sections, k]); setBlob(null); };
  const save = async () => { const { data } = await api.put(`/tournaments/${tid}/simple/program-settings`, f); setF(data); return data; };
  const fetchPdf = async () => {
    await save();
    const r = await api.get(`/tournaments/${tid}/simple/program.pdf`, { params: { category: cat || undefined, base_url: window.location.origin }, responseType: "blob" });
    setBlob(r.data);
    return r.data;
  };
  const preview = async () => {
    setBusy("preview");
    try { await fetchPdf(); } catch (e) { toast.error(apiError(e)); } finally { setBusy(""); }
  };
  const download = async () => {
    setBusy("pdf");
    try {
      const b = blob || await fetchPdf();
      const url = URL.createObjectURL(b); const a = document.createElement("a"); a.href = url; a.download = `FSL_Programma_${(f.title || "torneo").replace(/\s+/g, "_")}${cat ? `_${cat}` : ""}.pdf`; a.click(); URL.revokeObjectURL(url);
      toast.success("PDF Premium pronto");
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(""); }
  };
  const change = (k, v) => { set(k, v); setBlob(null); };
  const uploadLogo = async (file) => {
    if (!file) return;
    setBusy("logo");
    try { const m = await uploadMedia(tid, file); change("logo_url", m.url); toast.success("Logo caricato"); } catch (e) { toast.error(apiError(e)); } finally { setBusy(""); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${blob ? "max-w-5xl" : "max-w-2xl"} max-h-[92vh] overflow-y-auto`} data-testid="program-pdf-dialog">
        <DialogHeader>
          <DialogTitle className="font-display uppercase flex items-center gap-2"><Sparkles className="h-5 w-5 text-fsl-gold" /> PDF Premium · Programma ufficiale</DialogTitle>
          <DialogDescription>Copertina, gironi con stemmi, programma per giornata, fase finale e pagina info con QR code. Le impostazioni vengono salvate per il torneo.</DialogDescription>
        </DialogHeader>
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block"><span className="fsl-label">Titolo in copertina</span><input className="fsl-input mt-1" placeholder="es. Halloween Cup 2026" value={f.title} onChange={(e) => change("title", e.target.value)} data-testid="program-title" /></label>
          <label className="block"><span className="fsl-label">Categoria</span>
            <select className="fsl-input mt-1" value={cat} onChange={(e) => { setCat(e.target.value); setBlob(null); }} data-testid="program-category">{(categories || []).map((c) => <option key={c} value={c}>{c}</option>)}</select>
          </label>
          <div className="block"><span className="fsl-label">Logo torneo (opzionale, al posto del logo FSL)</span>
            <div className="mt-1 flex items-center gap-3">
              {f.logo_url && <img src={mediaUrl(f.logo_url)} alt="Logo torneo" className="h-12 w-12 object-contain rounded bg-white/5" data-testid="program-logo-preview" />}
              <label className="btn-ghost h-9 cursor-pointer text-xs"><Upload className="h-4 w-4" /> {busy === "logo" ? "Carico…" : "Carica logo"}<input type="file" accept="image/*" className="hidden" onChange={(e) => uploadLogo(e.target.files?.[0])} data-testid="program-logo-input" /></label>
              {f.logo_url && <button type="button" className="btn-ghost h-9 text-xs text-fsl-danger" onClick={() => change("logo_url", null)} data-testid="program-logo-remove">Rimuovi</button>}
            </div>
          </div>
          <div className="block"><span className="fsl-label">Stile</span>
            <div className="mt-1 inline-flex rounded-md border border-white/15 overflow-hidden" role="radiogroup">
              {[["dark", "Premium scuro"], ["light", "Premium chiaro (risparmio inchiostro)"]].map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={f.style === k} onClick={() => change("style", k)} className={`h-9 px-3 text-xs ${f.style === k ? "bg-fsl-gold text-ink-950 font-bold" : "text-fsl-slate hover:text-fsl-white"}`} data-testid={`program-style-${k}`}>{l}</button>)}
            </div>
          </div>
          <div className="sm:col-span-2"><span className="fsl-label">Sezioni da includere</span>
            <div className="mt-1 grid sm:grid-cols-2 gap-1.5">{SECTIONS.map(([k, l]) => <label key={k} className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={f.sections.includes(k)} onChange={() => toggleSection(k)} data-testid={`program-section-${k}`} /> {l}</label>)}</div>
            <div className="mt-2 flex flex-wrap gap-4 text-sm">
              <label className="inline-flex items-center gap-2"><input type="checkbox" checked={f.show_crests} onChange={(e) => change("show_crests", e.target.checked)} data-testid="program-show-crests" /> Stemmi nelle gare</label>
              <label className="inline-flex items-center gap-2"><input type="checkbox" checked={f.show_notes} onChange={(e) => change("show_notes", e.target.checked)} data-testid="program-show-notes" /> Commenti delle gare</label>
            </div>
          </div>
          <label className="block sm:col-span-2"><span className="fsl-label">Contatti organizzazione (pagina info)</span><textarea className="fsl-input mt-1 min-h-[64px]" placeholder={"Segreteria FSL · 333 1234567\ninfo@futurestarsleague.com"} value={f.contacts} onChange={(e) => change("contacts", e.target.value)} data-testid="program-contacts" /></label>
          <label className="inline-flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" className="mt-1" checked={f.public} onChange={(e) => change("public", e.target.checked)} data-testid="program-public" /><span><b>Pubblica sulla pagina del torneo</b> — genitori e società vedranno «Scarica il programma» (sempre aggiornato all'ultima versione del calendario).</span></label>
        </div>
        {blob && <PdfPreview blob={blob} />}
        <DialogFooter>
          <button type="button" className="btn-ghost" onClick={() => onOpenChange(false)} data-testid="program-close">Chiudi</button>
          <button type="button" className="btn-ghost" disabled={!!busy || f.sections.length === 0} onClick={preview} data-testid="program-preview">{busy === "preview" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />} {blob ? "Aggiorna anteprima" : "Anteprima pagine"}</button>
          <button type="button" className="btn-ghost" disabled={!!busy} onClick={() => save().then(() => toast.success("Impostazioni salvate")).catch((e) => toast.error(apiError(e)))} data-testid="program-save">Salva impostazioni</button>
          <button type="button" className="btn-gold" disabled={!!busy || f.sections.length === 0} onClick={download} data-testid="program-download">{busy === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} Scarica PDF Premium</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
