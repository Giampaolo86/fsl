import { useState } from "react";
import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";

export function AiBlogWriter({ tournamentId, form, onApply }) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState("");
  const run = async (tone) => {
    if (tone === "default" && !notes.trim() && !form.body) return toast.error("Dammi qualche spunto: cosa è successo, chi, dove");
    setBusy(tone);
    try {
      const { data } = await api.post(`/ai/tournaments/${tournamentId}/blog/write`, { kind: form.kind, notes, tone, current: tone === "default" ? {} : { title: form.title, excerpt: form.excerpt, body: form.body }, match_id: form.match_id || null, club_ids: form.club_ids || [] });
      onApply(data); toast.success("Testo pronto: rileggilo e correggi a mano quello che vuoi");
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(""); }
  };
  const Btn = ({ tone, children, gold }) => <button type="button" disabled={!!busy} onClick={() => run(tone)} className={`${gold ? "btn-gold" : "btn-ghost"} h-9 px-3 text-xs`} data-testid={`ai-blog-${tone}`}>{busy === tone ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} {children}</button>;
  return (
    <div className="rounded-lg border border-fsl-gold/40 bg-fsl-gold/5 p-3" data-testid="ai-blog-writer">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 text-sm font-semibold text-fsl-gold w-full text-left" data-testid="ai-blog-toggle"><Wand2 className="h-4 w-4" /> Scrivi con l'IA <span className="text-[11px] text-fsl-slate font-normal ml-auto">{open ? "chiudi" : "tono FSL · titolo, sommario, testo"}</span></button>
      {open && (
        <div className="mt-3 space-y-2">
          <textarea className="fsl-input min-h-[88px] py-2 text-sm" placeholder="Spunti: cosa è successo, chi sono i protagonisti, 2–3 frasi o parole chiave. L'IA non inventa nomi né numeri." value={notes} onChange={(e) => setNotes(e.target.value)} data-testid="ai-blog-notes" />
          <div className="flex flex-wrap gap-2">
            <Btn tone="default" gold>{form.body ? "Riscrivi dagli spunti" : "Genera"}</Btn>
            {form.body && <><Btn tone="shorter">Più corto</Btn><Btn tone="emotional">Più emozionale</Btn><Btn tone="formal">Più istituzionale</Btn></>}
          </div>
        </div>
      )}
    </div>
  );
}
