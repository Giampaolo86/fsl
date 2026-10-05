import { useEffect, useState } from "react";
import { Copy, Loader2, RefreshCw, Share2 } from "lucide-react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";

export function SocialCaption({ tid, matchId, compact = false }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const load = async (regenerate = false) => {
    setBusy(true); setErr("");
    try { const r = await api.get(`/ai/tournaments/${tid}/matches/${matchId}/caption`, { params: regenerate ? { regenerate: true } : {} }); setData(r.data); } catch (e) { setErr(apiError(e)); } finally { setBusy(false); }
  };
  useEffect(() => { if (matchId) { setData(null); load(); } }, [tid, matchId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!matchId) return null;
  const full = data ? `${data.caption}\n\n${(data.hashtags || []).join(" ")}` : "";
  return (
    <div className={`rounded-lg border border-white/10 bg-ink-950/50 ${compact ? "p-3" : "p-4"} space-y-2`} data-testid="social-caption">
      <div className="flex items-center gap-2 text-xs font-display font-extrabold uppercase text-fsl-gold"><Share2 className="h-4 w-4" /> Didascalia social (IA)<span className="ml-auto text-[10px] text-fsl-slate font-sans font-normal normal-case tracking-normal">{data?.generated_at ? `generata ${new Date(data.generated_at).toLocaleString("it-IT")}` : ""}</span></div>
      {busy && !data ? <div className="text-xs text-fsl-slate inline-flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Scrivo la didascalia…</div> : err ? <p className="text-xs text-fsl-slate" data-testid="social-caption-error">{err}</p> : data && (
        <>
          <p className="text-sm leading-relaxed whitespace-pre-wrap" data-testid="social-caption-text">{data.caption}</p>
          <p className="text-xs text-fsl-gold break-words" data-testid="social-caption-tags">{(data.hashtags || []).join(" ")}</p>
        </>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-gold h-8 px-3 text-[11px]" disabled={!data} onClick={() => { navigator.clipboard?.writeText(full); toast.success("Didascalia e hashtag copiati"); }} data-testid="social-caption-copy"><Copy className="h-3.5 w-3.5" /> Copia</button>
        <button type="button" className="btn-ghost h-8 px-3 text-[11px]" disabled={busy} onClick={() => load(true)} data-testid="social-caption-regen"><RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} /> Rigenera</button>
      </div>
    </div>
  );
}
