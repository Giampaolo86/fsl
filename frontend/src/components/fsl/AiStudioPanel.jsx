import { useState } from "react";
import { Image as ImageIcon, Loader2, Sparkles, Type } from "lucide-react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { mediaUrl } from "@/lib/upload";

export function AiStudioPanel({ tid, format, onBackground, onCopy }) {
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState("");
  const [copy, setCopy] = useState(null);
  const [img, setImg] = useState(null);
  const fmt = format === "story" ? "story" : format === "wide" || format === "cover" ? "wide" : "square";
  const genCopy = async () => {
    if (!brief.trim()) return toast.error("Scrivi un brief: di cosa parla la grafica");
    setBusy("copy");
    try { const { data } = await api.post(`/ai/tournaments/${tid}/studio/copy`, { brief, kind: fmt }); setCopy(data); } catch (e) { toast.error(apiError(e)); } finally { setBusy(""); }
  };
  const genImage = async () => {
    if (!brief.trim()) return toast.error("Scrivi un brief: cosa deve mostrare lo sfondo");
    setBusy("image");
    try { const { data } = await api.post(`/ai/tournaments/${tid}/studio/image`, { prompt: brief, format: fmt }); setImg(data.url); toast.success("Visual generato: usalo come sfondo o come immagine"); } catch (e) { toast.error(apiError(e)); } finally { setBusy(""); }
  };
  return (
    <div className="fsl-card p-4 space-y-3 border-fsl-gold/40" data-testid="ai-studio-panel">
      <div className="flex items-center gap-2 font-display font-extrabold uppercase text-sm text-fsl-gold"><Sparkles className="h-4 w-4" /> IA Studio <span className="text-[10px] text-fsl-slate font-sans font-normal normal-case tracking-normal ml-auto">mood FSL · niente testo nelle immagini</span></div>
      <textarea className="fsl-input min-h-[72px] py-2 text-sm" placeholder="Brief: es. «annuncio finalissima 2014, domenica ore 12, stadio di notte con coriandoli oro»" value={brief} onChange={(e) => setBrief(e.target.value)} data-testid="ai-studio-brief" />
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-ghost h-9 px-3 text-xs" disabled={!!busy} onClick={genCopy} data-testid="ai-studio-copy">{busy === "copy" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Type className="h-3.5 w-3.5" />} Testi e hashtag</button>
        <button type="button" className="btn-gold h-9 px-3 text-xs" disabled={!!busy} onClick={genImage} data-testid="ai-studio-image">{busy === "image" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />} Genera visual</button>
      </div>
      {copy && (
        <div className="rounded-md border border-white/10 bg-ink-950/50 p-3 text-xs space-y-1" data-testid="ai-studio-copy-result">
          <div className="font-display font-extrabold text-base uppercase text-fsl-white">{copy.title}</div>
          <div className="text-fsl-white/85">{copy.subtitle}</div>
          <div className="text-fsl-slate">{copy.caption}</div>
          <div className="text-fsl-gold break-words">{(copy.hashtags || []).join(" ")}</div>
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" className="btn-ghost h-8 px-2 text-[11px]" onClick={() => onCopy(copy)} data-testid="ai-studio-copy-apply">Metti titolo e sottotitolo in grafica</button>
            <button type="button" className="btn-ghost h-8 px-2 text-[11px]" onClick={() => { navigator.clipboard?.writeText(`${copy.caption}\n\n${(copy.hashtags || []).join(" ")}`); toast.success("Didascalia copiata"); }} data-testid="ai-studio-copy-clip">Copia didascalia + hashtag</button>
          </div>
        </div>
      )}
      {img && (
        <div className="flex items-center gap-3" data-testid="ai-studio-image-result">
          <img src={mediaUrl(img)} alt="Visual generato" className="h-20 w-20 rounded-md object-cover border border-fsl-gold/50" />
          <div className="flex flex-col gap-1">
            <button type="button" className="btn-gold h-8 px-3 text-[11px]" onClick={() => onBackground(img)} data-testid="ai-studio-image-bg">Usa come sfondo</button>
            <button type="button" className="btn-ghost h-8 px-3 text-[11px]" onClick={genImage} disabled={!!busy} data-testid="ai-studio-image-again">Rigenera</button>
          </div>
        </div>
      )}
    </div>
  );
}
