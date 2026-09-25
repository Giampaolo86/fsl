import { useEffect, useState } from "react";
import { ArrowLeft, Download, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const isStandalone = () => window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
const isTouch = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

export async function canvasFile(canvas, fileName) {
  const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
  return new File([blob], fileName, { type: "image/png" });
}

export function downloadBlob(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a"); a.href = url; a.download = file.name; a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// Salvataggio sicuro: condivisione nativa su mobile, download su desktop, anteprima con «Torna allo Studio» in PWA
export function useSaveImage() {
  const [preview, setPreview] = useState(null);
  const save = async (canvas, fileName, { forceShare = false } = {}) => {
    const file = await canvasFile(canvas, fileName);
    if ((forceShare || isTouch()) && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "Future Stars League" }); return; } catch (e) { if (e.name === "AbortError") return; }
    }
    if (isStandalone() || isTouch()) { setPreview({ url: URL.createObjectURL(file), file }); return; }
    downloadBlob(file); toast.success("Grafica scaricata");
  };
  const close = () => { if (preview) URL.revokeObjectURL(preview.url); setPreview(null); };
  return { save, preview, close };
}

export function SavePreviewDialog({ preview, onClose }) {
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);
  if (!preview) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-navy-800 border-white/20 text-fsl-white rounded-xl max-w-md" data-testid="studio-save-preview">
        <DialogHeader><DialogTitle className="font-display uppercase">Salva la grafica</DialogTitle><DialogDescription className="text-fsl-slate">Tieni premuto sull'immagine e scegli «Salva immagine» (o «Aggiungi a Foto»), poi torna allo Studio con il pulsante qui sotto.</DialogDescription></DialogHeader>
        <img src={preview.url} alt="Grafica FSL" className="w-full rounded-lg border border-white/10 max-h-[55vh] object-contain bg-ink-950" data-testid="studio-save-preview-img" />
        <div className="flex flex-wrap gap-2 justify-between">
          <button type="button" className="btn-ghost h-10" onClick={onClose} data-testid="studio-save-back"><ArrowLeft className="h-4 w-4" /> Torna allo Studio</button>
          <div className="flex gap-2">
            {navigator.canShare?.({ files: [preview.file] }) && <button type="button" className="btn-primary h-10" onClick={() => navigator.share({ files: [preview.file], title: "Future Stars League" }).catch(() => {})} data-testid="studio-save-share"><Share2 className="h-4 w-4" /> Condividi</button>}
            <button type="button" className="btn-gold h-10" onClick={() => downloadBlob(preview.file)} data-testid="studio-save-download"><Download className="h-4 w-4" /> Scarica</button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
