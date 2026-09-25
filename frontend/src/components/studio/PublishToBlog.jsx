import { useState } from "react";
import { Link } from "react-router-dom";
import { Newspaper } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, apiError } from "@/lib/api";
import { uploadMedia } from "@/lib/upload";

export function PublishToBlog({ tid, slug, canvasRef, defaults, matchId, teamIds = [], disabled }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: "", excerpt: "", publish: true });
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const openDialog = () => { setF({ title: defaults.title, excerpt: defaults.excerpt, publish: true }); setOpen(true); };
  const submit = async () => {
    if (f.title.trim().length < 3) return toast.error("Titolo troppo corto");
    setBusy(true);
    try {
      const blob = await new Promise((res) => canvasRef.current.toBlob(res, "image/png"));
      const file = new File([blob], `${defaults.fileName}.png`, { type: "image/png" });
      const m = await uploadMedia(tid, file, setProgress);
      const { data: post } = await api.post(`/tournaments/${tid}/posts`, { kind: defaults.kind || "news", title: f.title.trim(), excerpt: f.excerpt.trim(), body: f.excerpt.trim(), cover_url: m.url, media: [{ id: m.id, url: m.url, kind: "image", original_filename: m.original_filename }], match_id: matchId || null, team_ids: teamIds });
      if (f.publish) await api.post(`/tournaments/${tid}/posts/${post.id}/status`, { action: "publish" });
      setOpen(false);
      toast.success(f.publish ? "Grafica pubblicata nelle news" : "Bozza creata nel blog", { action: { label: f.publish ? "Apri articolo" : "Apri blog", onClick: () => window.open(f.publish ? `/tornei/${slug}/news/${post.slug}` : `/admin/t/${tid}/blog`, "_blank") } });
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
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.publish} onChange={(e) => setF({ ...f, publish: e.target.checked })} data-testid="studio-publish-now" /> Pubblica subito nelle news (altrimenti resta in bozza nel <Link to={`/admin/t/${tid}/blog`} className="text-fsl-gold underline">Blog</Link>)</label>
            {progress != null && <div className="h-1.5 rounded bg-white/10 overflow-hidden"><div className="h-full bg-fsl-gold transition-[width]" style={{ width: `${progress}%` }} /></div>}
          </div>
          <DialogFooter><button type="button" className="btn-ghost h-10" onClick={() => setOpen(false)}>Annulla</button><button type="button" className="btn-gold h-10" disabled={busy} onClick={submit} data-testid="studio-publish-submit">{busy ? "Caricamento…" : f.publish ? "Pubblica" : "Salva bozza"}</button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
