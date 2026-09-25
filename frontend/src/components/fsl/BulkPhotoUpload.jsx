import { useRef, useState } from "react";
import { Images } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, apiError } from "@/lib/api";

const LABEL = { ok: ["Caricata", "text-fsl-success"], non_trovato: ["Nessun giocatore", "text-fsl-danger"], ambiguo: ["Più giocatori", "text-fsl-warning"], non_immagine: ["Non è un'immagine", "text-fsl-danger"], non_autorizzato: ["Non autorizzato", "text-fsl-danger"], troppo_grande: ["Oltre 8 MB", "text-fsl-danger"] };

export function BulkPhotoUpload({ tid, clubId, onDone }) {
  const input = useRef(null);
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const upload = async (files) => {
    if (!files.length) return;
    setBusy(true);
    const fd = new FormData();
    [...files].forEach((f) => fd.append("files", f));
    try { const { data } = await api.post(`/tournaments/${tid}/players/photos/bulk`, fd, { headers: { "Content-Type": "multipart/form-data" }, params: clubId ? { club_id: clubId } : {} }); setRes(data); toast.success(`${data.ok} foto su ${data.total} abbinate`); onDone?.(); } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); if (input.current) input.current.value = ""; }
  };
  return (
    <>
      <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={(e) => upload(e.target.files)} data-testid="bulk-photos-input" />
      <button type="button" className="btn-ghost h-11" disabled={busy} onClick={() => input.current?.click()} title="Nomina i file col numero di maglia (10.jpg) o nome-cognome.jpg" data-testid="bulk-photos-button"><Images className="h-4 w-4" /> {busy ? "Carico…" : "Foto in blocco"}</button>
      <Dialog open={!!res} onOpenChange={(o) => !o && setRes(null)}>
        <DialogContent className="bg-navy-800 border-white/20 text-fsl-white rounded-xl max-w-lg" aria-describedby={undefined} data-testid="bulk-photos-result">
          <DialogHeader><DialogTitle className="font-display uppercase text-2xl">Foto in blocco · {res?.ok}/{res?.total} abbinate</DialogTitle></DialogHeader>
          <p className="text-xs text-fsl-slate">Abbinamento per numero di maglia (<code>10.jpg</code>), nome (<code>mario-rossi.jpg</code>, <code>rossi_mario.jpg</code>) o id giocatore. Le foto vengono ritagliate quadrate e compaiono subito su Top 11 e Card Player ID.</p>
          <div className="max-h-[50vh] overflow-y-auto divide-y divide-white/[0.06] text-sm">{(res?.results || []).map((r, i) => <div key={i} className="py-2 flex items-center gap-3"><span className="flex-1 truncate font-mono text-xs">{r.file}</span><span className="truncate text-fsl-slate">{r.player || (r.candidates?.length ? r.candidates.join(", ") : "")}</span><span className={`text-xs font-bold whitespace-nowrap ${LABEL[r.status]?.[1] || ""}`}>{LABEL[r.status]?.[0] || r.status}</span></div>)}</div>
          <DialogFooter><button type="button" className="btn-gold h-10" onClick={() => setRes(null)}>Chiudi</button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
