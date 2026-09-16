import { useState } from "react";
import { Link } from "react-router-dom";
import { Flag } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/context/AuthContext";
import { api, apiError } from "@/lib/api";

export function FanReport({ slug, matchId }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ subject: "", description: "" });
  const [busy, setBusy] = useState(false);
  if (user && user.role !== "fan") return null;
  const send = async () => { setBusy(true); try { await api.post(`/public/tournaments/${slug}/matches/${matchId}/report`, f); toast.success("Segnalazione inviata al Direttore di gara"); setOpen(false); setF({ subject: "", description: "" }); } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); } };
  return (
    <section className="mt-8 fsl-card p-4 flex flex-wrap items-center gap-3" data-testid="fan-report">
      <Flag className="h-5 w-5 text-fsl-gold shrink-0" />
      <div className="flex-1 min-w-[220px]"><div className="font-display font-bold uppercase text-sm">Hai notato un errore?</div><p className="text-xs text-fsl-slate">Gol attribuito male, numero di maglia, ammonizione mancante: segnalalo, il Direttore verifica il tabellino.</p></div>
      {user ? <button className="btn-ghost" onClick={() => setOpen(true)} data-testid="fan-report-open">Segnala errore</button> : <Link to="/registrati" className="btn-ghost" data-testid="fan-report-register">Registrati per segnalare</Link>}
      <Dialog open={open} onOpenChange={setOpen}><DialogContent className="bg-navy-800 border-white/20 text-fsl-white rounded-xl" data-testid="fan-report-dialog">
        <DialogHeader><DialogTitle className="font-display uppercase text-2xl">Segnala un errore</DialogTitle><DialogDescription className="text-fsl-slate">La segnalazione non modifica il risultato: apre un ticket al Direttore.</DialogDescription></DialogHeader>
        <input className="fsl-input" placeholder="Oggetto (es. Gol attribuito al giocatore sbagliato)" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} data-testid="fan-report-subject" />
        <textarea className="fsl-input h-28 py-2" placeholder="Descrivi cosa hai visto" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} data-testid="fan-report-description" />
        <DialogFooter><button className="btn-ghost" onClick={() => setOpen(false)}>Annulla</button><button className="btn-gold" disabled={busy || f.subject.length < 3 || f.description.length < 10} onClick={send} data-testid="fan-report-send">Invia</button></DialogFooter>
      </DialogContent></Dialog>
    </section>
  );
}
