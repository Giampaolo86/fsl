import { useEffect, useState } from "react";
import { Copy, KeyRound, Link2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, apiError } from "@/lib/api";
import { fmtDate } from "@/lib/format";

const copy = (text) => navigator.clipboard?.writeText(text).then(() => toast.success("Copiato")).catch(() => toast.error("Copia non riuscita"));
const absolute = (link) => (link.startsWith("/") ? window.location.origin + link : link);

// Pannello staff: richieste di reset password e generazione link assistito (senza servizi terzi)
export function ResetRequests() {
  const [rows, setRows] = useState(null);
  const [email, setEmail] = useState("");
  const [link, setLink] = useState(null);
  const load = () => api.get("/auth/reset-requests").then((r) => setRows(r.data)).catch(() => setRows([]));
  useEffect(() => { load(); }, []);
  const issue = async (mail) => { try { const { data } = await api.post("/auth/reset-requests/link", { email: mail }); setLink({ ...data, link: absolute(data.link) }); load(); } catch (e) { toast.error(apiError(e)); } };
  return (
    <section className="fsl-card p-5 space-y-4" data-testid="reset-requests">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="fsl-section-title flex items-center gap-2"><KeyRound className="h-5 w-5 text-fsl-gold" /> Recupero password</h2><button type="button" onClick={load} className="btn-ghost h-8 text-xs" data-testid="reset-requests-refresh"><RefreshCw className="h-3.5 w-3.5" /> Aggiorna</button></div>
      <p className="text-xs text-fsl-slate">Chi dimentica la password chiede il reset dal login. Se l'email SMTP dell'organizzazione non è configurata, generi qui il link (valido 24 ore) e lo consegni all'utente via WhatsApp, SMS o email.</p>
      <form onSubmit={(e) => { e.preventDefault(); if (email) issue(email); }} className="flex flex-wrap gap-2"><input type="email" className="fsl-input h-10 flex-1 min-w-[220px]" placeholder="email dell'utente (genitore, società, arbitro…)" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="reset-email-input" /><button type="submit" className="btn-gold h-10" data-testid="reset-issue-button"><Link2 className="h-4 w-4" /> Genera link</button></form>
      {rows === null ? <p className="text-xs text-fsl-slate">Caricamento…</p> : rows.length === 0 ? <p className="text-xs text-fsl-slate">Nessuna richiesta in attesa.</p> : (
        <ul className="divide-y divide-white/[0.06]" data-testid="reset-requests-list">{rows.map((r) => <li key={r.id} className="py-2 flex flex-wrap items-center gap-3 text-sm"><span className="flex-1 min-w-[200px]"><span className="font-semibold">{r.full_name || r.email}</span> <span className="text-fsl-slate">· {r.email} · {r.role}</span><span className="block text-[11px] text-fsl-slate">Richiesto il {fmtDate(r.created_at)} · {r.emailed ? "email inviata" : "in attesa di consegna manuale"}</span></span><button type="button" onClick={() => issue(r.email)} className="btn-ghost h-8 text-xs" data-testid={`reset-issue-${r.email}`}><Link2 className="h-3.5 w-3.5" /> Link</button></li>)}</ul>
      )}
      <Dialog open={!!link} onOpenChange={(o) => !o && setLink(null)}>
        <DialogContent className="bg-navy-800 border-white/20 text-fsl-white rounded-xl max-w-lg" data-testid="reset-link-dialog">
          <DialogHeader><DialogTitle className="font-display uppercase">Link di reset per {link?.email}</DialogTitle><DialogDescription className="text-fsl-slate">Valido {link?.expires_hours} ore, utilizzabile una sola volta. Consegnalo direttamente all'utente.</DialogDescription></DialogHeader>
          {link && <div className="flex gap-2"><input readOnly className="fsl-input h-10 flex-1 text-xs" value={link.link} data-testid="reset-link-value" /><button type="button" className="btn-gold h-10" onClick={() => copy(link.link)} data-testid="reset-link-copy"><Copy className="h-4 w-4" /> Copia</button></div>}
        </DialogContent>
      </Dialog>
    </section>
  );
}

export function ChildCode({ tid, player, onChanged }) {
  const regen = async () => { if (!window.confirm(`Rigenerare il codice di ${player.first_name}? Il vecchio codice non funzionerà più (i genitori già abbinati restano).`)) return; try { const { data } = await api.post(`/tournaments/${tid}/players/${player.id}/link-code`); onChanged?.(data.link_code); toast.success("Nuovo codice generato"); } catch (e) { toast.error(apiError(e)); } };
  return (
    <span className="inline-flex items-center gap-1" data-testid={`child-code-${player.id}`}>
      <code className="num font-bold tracking-widest text-fsl-gold text-sm">{player.link_code || "—"}</code>
      {player.link_code && <button type="button" onClick={() => copy(player.link_code)} className="p-1 text-fsl-slate hover:text-fsl-white" title="Copia codice"><Copy className="h-3.5 w-3.5" /></button>}
      <button type="button" onClick={regen} className="p-1 text-fsl-slate hover:text-fsl-gold" title="Rigenera codice" data-testid={`child-code-regen-${player.id}`}><RefreshCw className="h-3.5 w-3.5" /></button>
    </span>
  );
}

export function LinkChildButton({ onLinked }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => { e.preventDefault(); setBusy(true); try { const { data } = await api.post("/me/children/link", { code }); toast.success(`${data.name} abbinato: ora lo segui`); setOpen(false); setCode(""); onLinked?.(data); } catch (err) { toast.error(apiError(err)); } finally { setBusy(false); } };
  return (
    <>
      <button type="button" className="btn-gold" onClick={() => setOpen(true)} data-testid="link-child-button"><KeyRound className="h-4 w-4" /> Segui tuo figlio · ho un codice</button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-navy-800 border-white/20 text-fsl-white rounded-xl max-w-sm" data-testid="link-child-dialog">
          <DialogHeader><DialogTitle className="font-display uppercase">Abbina tuo figlio</DialogTitle><DialogDescription className="text-fsl-slate">Inserisci il codice di 9 caratteri consegnato dalla società o dall'organizzazione. Vale per genitori, tutori e familiari.</DialogDescription></DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <input className="fsl-input h-12 text-center text-xl tracking-[0.35em] uppercase num" maxLength={11} placeholder="XXXXXXXXX" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoFocus data-testid="link-child-code" />
            <button type="submit" className="btn-gold w-full" disabled={busy || code.replace(/[^A-Z0-9]/gi, "").length < 9} data-testid="link-child-submit">{busy ? "Verifica…" : "Abbina"}</button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
