import { useEffect, useState } from "react";
import { Bot, Save } from "lucide-react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";

export function BrainEditor() {
  const [text, setText] = useState("");
  const [meta, setMeta] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get("/ai/brain").then((r) => { setText(r.data.text); setMeta(r.data); }).catch(() => {}); }, []);
  const save = async () => {
    setBusy(true);
    try { const { data } = await api.put("/ai/brain", { text }); setMeta(data); toast.success("Cervello FSL aggiornato: vale per calendario, blog e studio"); } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  return (
    <div className="mb-8 rounded-lg border border-fsl-gold/30 bg-ink-950/40 p-4" data-testid="brain-editor">
      <div className="flex flex-wrap items-center gap-2 mb-2"><Bot className="h-4 w-4 text-fsl-gold" /><span className="text-sm font-semibold">Linguaggio, mood, estetica e regole che l'IA deve sempre rispettare</span><span className="text-[11px] text-fsl-slate ml-auto">{meta?.is_default ? "Bozza iniziale: correggila liberamente" : meta?.updated_at ? `Aggiornato ${new Date(meta.updated_at).toLocaleString("it-IT")}` : ""}</span></div>
      <textarea className="fsl-input w-full min-h-[260px] py-2 font-mono text-xs leading-relaxed" value={text} onChange={(e) => setText(e.target.value)} data-testid="brain-text" />
      <div className="mt-2 flex justify-end"><button type="button" className="btn-gold h-9" disabled={busy || text.trim().length < 20} onClick={save} data-testid="brain-save"><Save className="h-4 w-4" /> Salva Cervello FSL</button></div>
    </div>
  );
}
