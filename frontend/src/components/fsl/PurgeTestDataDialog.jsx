import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, apiError } from "@/lib/api";

const TEST_RE = /^(test|qa|demo|prova)[-_]|^winter-stars-2025$/i;
export const looksLikeTest = (t) => TEST_RE.test(t.slug || "") || TEST_RE.test(t.name || "");

export function PurgeTestDataDialog({ tournaments, onDone }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const suggested = useMemo(() => tournaments.filter(looksLikeTest), [tournaments]);

  const openDialog = () => { setSelected(new Set(suggested.map((t) => t.id))); setOpen(true); };
  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const run = async () => {
    const keep = tournaments.filter((t) => !selected.has(t.id)).map((t) => t.slug);
    if (keep.length === 0) { toast.error("Devi conservare almeno un torneo"); return; }
    const names = tournaments.filter((t) => selected.has(t.id)).map((t) => t.name);
    if (!window.confirm(`Eliminazione DEFINITIVA di ${names.length} tornei e di tutti gli utenti di test.\n\n${names.join("\n")}\n\nConfermi?`)) return;
    setBusy(true);
    try {
      const { data } = await api.post("/tournaments/purge-test-data", { keep_slugs: keep });
      toast.success(`Pulizia completata: ${data.tournaments.length} tornei, ${data.users.length} utenti, ${data.access_requests || 0} richieste di accesso e ${(data.clubs || []).length} società di test eliminati`);
      setOpen(false);
      onDone?.();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };

  return (
    <>
      <button type="button" onClick={openDialog} className="btn-ghost text-red-300 border-red-400/30 hover:bg-red-500/10" data-testid="hub-purge-test-data-button">
        <Trash2 className="h-4 w-4" aria-hidden="true" /> Pulizia dati di test{suggested.length ? ` (${suggested.length})` : ""}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg" data-testid="purge-dialog">
          <DialogHeader>
            <DialogTitle>Pulizia dati di test</DialogTitle>
            <DialogDescription>Seleziona i tornei da eliminare definitivamente (con società, squadre, gare, vendite). Verranno rimossi anche gli account di test e demo (@test.it, @fsl.demo, qa_*, test-*), le richieste di accesso di prova e le società vuote che avevano creato. I tornei non selezionati restano intatti.</DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto divide-y divide-white/[0.06] rounded-lg border border-white/10" data-testid="purge-list">
            {tournaments.map((t) => (
              <label key={t.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-white/[0.04]">
                <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggle(t.id)} data-testid={`purge-check-${t.slug}`} className="accent-red-500" />
                <span className={`flex-1 truncate ${selected.has(t.id) ? "text-red-300" : ""}`}>{t.name}</span>
                <span className="text-xs text-fsl-slate font-mono">{t.slug}</span>
              </label>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3 pt-2">
            <span className="text-xs text-fsl-slate" data-testid="purge-summary">{selected.size} da eliminare · {tournaments.length - selected.size} conservati</span>
            <div className="flex gap-2">
              <button type="button" className="btn-ghost" onClick={() => setOpen(false)} data-testid="purge-cancel-button">Annulla</button>
              <button type="button" className="btn-gold bg-red-600 hover:bg-red-500 text-white" disabled={busy || selected.size === 0} onClick={run} data-testid="purge-confirm-button">
                {busy ? "Eliminazione…" : `Elimina ${selected.size} tornei`}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
