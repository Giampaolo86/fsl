import { useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";

const QUICK = [["Riscrivi meglio", "Riscrivi meglio, stesso significato, più scorrevole"], ["Più corto", "Accorcia della metà mantenendo i fatti"], ["Più emozionale", "Rendi più emozionale e caldo, con immagini concrete del campo"], ["Più semplice", "Semplifica il linguaggio, frasi brevi, adatto a tutti i genitori"]];

export function AiTextarea({ tournamentId, value, onChange, title, className = "", ...rest }) {
  const ref = useRef(null);
  const [sel, setSel] = useState(null);
  const [busy, setBusy] = useState("");
  const onSelect = () => { const el = ref.current; if (!el) return; const { selectionStart: s, selectionEnd: e } = el; setSel(e - s >= 3 ? { s, e } : null); };
  const rewrite = async (label, instruction) => {
    const el = ref.current; if (!el || !sel) return;
    const text = value.slice(sel.s, sel.e);
    setBusy(label);
    try {
      const { data } = await api.post(`/ai/tournaments/${tournamentId}/blog/rewrite`, { text: text.trim(), instruction, title });
      const out = text.match(/^\s*/)[0] + data.text.trim() + text.match(/\s*$/)[0];
      onChange(value.slice(0, sel.s) + out + value.slice(sel.e));
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(sel.s, sel.s + out.length); });
      setSel({ s: sel.s, e: sel.s + out.length });
      toast.success("Brano riscritto: Ctrl+Z per annullare");
    } catch (err) { toast.error(apiError(err)); } finally { setBusy(""); }
  };
  return (
    <div className="relative">
      <textarea ref={ref} value={value} onChange={(e) => onChange(e.target.value)} onSelect={onSelect} onKeyUp={onSelect} onMouseUp={onSelect} onBlur={() => setTimeout(() => setSel((v) => (busy ? v : v)), 0)} className={className} {...rest} />
      {sel && (
        <div className="absolute right-2 top-2 z-10 flex flex-wrap items-center gap-1 rounded-md border border-fsl-gold/50 bg-navy-800 shadow-xl p-1" data-testid="ai-inline-toolbar">
          <span className="inline-flex items-center gap-1 px-1.5 text-[10px] uppercase tracking-wider text-fsl-gold"><Sparkles className="h-3 w-3" /> Selezione</span>
          {QUICK.map(([label, instr]) => <button key={label} type="button" disabled={!!busy} onMouseDown={(e) => e.preventDefault()} onClick={() => rewrite(label, instr)} className="h-7 px-2 rounded text-[11px] font-semibold border border-white/15 hover:border-fsl-gold hover:text-fsl-gold" data-testid={`ai-inline-${label.toLowerCase().replace(/\s+/g, "-")}`}>{busy === label ? <Loader2 className="h-3 w-3 animate-spin" /> : label}</button>)}
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setSel(null)} className="h-7 px-1.5 text-fsl-slate hover:text-white text-xs" aria-label="Chiudi">✕</button>
        </div>
      )}
    </div>
  );
}
