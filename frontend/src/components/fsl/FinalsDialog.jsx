import { useEffect, useState } from "react";
import { AlertTriangle, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LoadingState } from "@/components/fsl/States";
import { api, apiError } from "@/lib/api";

export function FinalsDialog({ tid, competition: c, onClose, onDone }) {
  const [p, setP] = useState(null);
  const [error, setError] = useState(null);
  const [pairs, setPairs] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.get(`/tournaments/${tid}/competitions/${c.id}/finals/preview`).then(({ data }) => { setP(data); setPairs(data.pairs || []); }).catch(setError);
  }, [tid, c.id]);
  const setSide = (i, side, v) => setPairs((ps) => ps.map((x, j) => (j === i ? { ...x, [side]: v || null } : x)));
  const used = new Set(pairs.flatMap((x) => [x.home, x.away]).filter(Boolean));
  const dup = pairs.flatMap((x) => [x.home, x.away]).filter(Boolean).length !== used.size;
  const incomplete = pairs.some((x) => !x.home || !x.away);
  const changed = p && JSON.stringify(pairs) !== JSON.stringify(p.pairs);
  const generate = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/tournaments/${tid}/competitions/${c.id}/finals/generate`, changed ? { pairs } : {});
      toast.success(`${data.round_name}: ${data.count} gare create${data.third_place ? " (incl. finale 3°/4° posto)" : ""}`);
      onDone?.();
      onClose();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };
  const name = (id) => p?.teams.find((t) => t.id === id)?.name || "—";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-navy-800 border-white/20 text-fsl-white rounded-xl max-w-2xl" data-testid="finals-dialog" aria-describedby={undefined}>
        <DialogHeader><DialogTitle className="font-display uppercase text-2xl">Fase finale · {c.name}</DialogTitle></DialogHeader>
        {error && <p className="text-sm text-fsl-danger">{apiError(error)}</p>}
        {!p && !error && <LoadingState label="Calcolo accoppiamenti…" />}
        {p && !p.ok && <p className="text-sm text-fsl-warning" data-testid="finals-dialog-reason">{p.reason}</p>}
        {p?.ok && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="h-8 px-3 rounded-full bg-fsl-gold text-ink-950 font-bold inline-flex items-center" data-testid="finals-dialog-round">{p.round_name}</span>
              {p.replace && <span className="h-8 px-3 rounded-full border border-fsl-warning/50 text-fsl-warning text-xs inline-flex items-center">Sostituisce il turno già programmato</span>}
              {p.third_place && <span className="h-8 px-3 rounded-full border border-white/20 text-xs inline-flex items-center">+ finale 3°/4° posto</span>}
              <span className="text-xs text-fsl-slate">{c.finals?.mode === "cross_groups" ? "Incroci automatici: 1ª A – 2ª B, 1ª B – 2ª A. Puoi cambiare ogni squadra (defezioni, squalifiche)." : "Accoppiamenti da classifica, modificabili."}</span>
            </div>
            {p.warnings?.length > 0 && <ul className="space-y-1">{p.warnings.map((w, i) => <li key={i} className="text-xs text-fsl-warning inline-flex items-start gap-1"><AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {w}</li>)}</ul>}
            <div className="space-y-2" data-testid="finals-dialog-pairs">
              {pairs.map((pair, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-lg border border-white/10 bg-ink-950/50 p-2">
                  {["home", "away"].map((side, k) => (
                    <select key={side} className={`fsl-input h-10 ${k === 1 ? "order-3" : ""}`} value={pair[side] || ""} onChange={(e) => setSide(i, side, e.target.value)} data-testid={`finals-pair-${i}-${side}`}>
                      <option value="">— scegli squadra —</option>
                      {p.teams.map((t) => <option key={t.id} value={t.id}>{t.name}{t.series ? ` (${t.series})` : ""}</option>)}
                    </select>
                  ))}
                  <span className="order-2 text-xs text-fsl-slate font-bold px-1">vs</span>
                </div>
              ))}
            </div>
            {dup && <p className="text-xs text-fsl-danger" data-testid="finals-dialog-dup">Una squadra compare due volte.</p>}
            {changed && !dup && !incomplete && <p className="text-xs text-fsl-gold" data-testid="finals-dialog-manual">Accoppiamenti modificati a mano: {pairs.map((x) => `${name(x.home)} – ${name(x.away)}`).join(" · ")}</p>}
          </div>
        )}
        <DialogFooter>
          <button className="btn-ghost" onClick={onClose}>Annulla</button>
          {p?.ok && <button className="btn-primary" disabled={busy || dup || incomplete} onClick={generate} data-testid="finals-dialog-generate"><Wand2 className="h-4 w-4" /> {busy ? "Creazione…" : p.replace ? "Sostituisci turno" : `Genera ${p.round_name}`}</button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
