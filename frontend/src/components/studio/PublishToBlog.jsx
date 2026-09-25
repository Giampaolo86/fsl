import { useState } from "react";
import { Link } from "react-router-dom";
import { Newspaper } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, apiError } from "@/lib/api";
import { uploadMedia } from "@/lib/upload";

export function PublishToBlog({ tid, slug, canvasRef, defaults, matchId, teamIds = [], disabled }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: "", excerpt: "", mode: "now", at: "" });
  const defaultAt = () => { const d = new Date(Date.now() + 60 * 60 * 1000); d.setMinutes(0, 0, 0); const pad = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const openDialog = () => { setF({ title: defaults.title, excerpt: defaults.excerpt, mode: "now", at: defaultAt() }); setOpen(true); };
  const submit = async () => {
    if (f.title.trim().length < 3) return toast.error("Titolo troppo corto");
    if (f.mode === "schedule" && (!f.at || new Date(f.at) <= new Date())) return toast.error("Indica una data e ora future per la programmazione");
    setBusy(true);
    try {
      const blob = await new Promise((res) => canvasRef.current.toBlob(res, "image/png"));
      const file = new File([blob], `${defaults.fileName}.png`, { type: "image/png" });
      const m = await uploadMedia(tid, file, setProgress);
      const { data: post } = await api.post(`/tournaments/${tid}/posts`, { kind: defaults.kind || "news", title: f.title.trim(), excerpt: f.excerpt.trim(), body: f.excerpt.trim(), cover_url: m.url, media: [{ id: m.id, url: m.url, kind: "image", original_filename: m.original_filename }], match_id: matchId || null, team_ids: teamIds });
      if (f.mode === "now") await api.post(`/tournaments/${tid}/posts/${post.id}/status`, { action: "publish" });
      if (f.mode === "schedule") await api.post(`/tournaments/${tid}/posts/${post.id}/status`, { action: "schedule", publish_at: new Date(f.at).toISOString() });
      setOpen(false);
      const when = f.mode === "schedule" ? new Date(f.at).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
      toast.success(f.mode === "now" ? "Grafica pubblicata nelle news" : f.mode === "schedule" ? `Grafica programmata per il ${when}` : "Bozza creata nel blog", { action: { label: f.mode === "now" ? "Apri articolo" : "Apri blog", onClick: () => window.open(f.mode === "now" ? `/tornei/${slug}/news/${post.slug}` : `/admin/t/${tid}/media`, "_blank") } });
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); setProgress(null); }
  };
  return (
    <>
      <button type="button" className="btn-ghost h-10 border border-fsl-gold/50" disabled={disabled} onClick={openDialog} data-testid="studio-publish"><Newspaper className="h-4 w-4 text-fsl-gold" /> Pubblica nel blog</button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-navy-800 border-white/20 text-fsl-white rounded-xl" aria-describedby={undefined} data-testid="studio-publish-dialog">
          <DialogHeader><DialogTitle className="font-display uppercase text-2xl">Pubblica nel blog</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <label className="block"><span className="fsl-label">Titolo</span><input className="fsl-input mt-1" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} data-testid="studio-publish-title" /></label>
            <label className="block"><span className="fsl-label">Testo breve</span><textarea className="fsl-input mt-1 min-h-[80px]" value={f.excerpt} onChange={(e) => setF({ ...f, excerpt: e.target.value })} data-testid="studio-publish-excerpt" /></label>
            <div className="grid grid-cols-3 gap-2" data-testid="studio-publish-mode">
              {[["now", "Pubblica subito"], ["schedule", "Programma"], ["draft", "Salva bozza"]].map(([m, l]) => <button key={m} type="button" onClick={() => setF({ ...f, mode: m })} className={`h-10 rounded-lg border text-xs font-bold uppercase ${f.mode === m ? "border-fsl-gold bg-fsl-gold/10 text-fsl-gold" : "border-white/15 hover:border-white/40"}`} data-testid={`studio-publish-mode-${m}`}>{l}</button>)}
            </div>
            {f.mode === "schedule" && <label className="block"><span className="fsl-label">Data e ora di pubblicazione</span><input type="datetime-local" className="fsl-input mt-1" value={f.at} min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)} onChange={(e) => setF({ ...f, at: e.target.value })} data-testid="studio-publish-at" /><span className="text-[11px] text-fsl-slate">L'articolo comparirà nelle news automaticamente all'orario indicato (fuso orario del tuo dispositivo).</span></label>}
            {f.mode === "draft" && <p className="text-xs text-fsl-slate">Resta in bozza nel <Link to={`/admin/t/${tid}/media`} className="text-fsl-gold underline">Blog</Link> della Control Room.</p>}
            {progress != null && <div className="h-1.5 rounded bg-white/10 overflow-hidden"><div className="h-full bg-fsl-gold transition-[width]" style={{ width: `${progress}%` }} /></div>}
          </div>
          <DialogFooter><button type="button" className="btn-ghost h-10" onClick={() => setOpen(false)}>Annulla</button><button type="button" className="btn-gold h-10" disabled={busy} onClick={submit} data-testid="studio-publish-submit">{busy ? "Caricamento…" : f.mode === "now" ? "Pubblica" : f.mode === "schedule" ? "Programma" : "Salva bozza"}</button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
