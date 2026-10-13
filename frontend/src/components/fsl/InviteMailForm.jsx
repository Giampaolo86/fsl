import { useState } from "react";
import { Copy, Mail, Send } from "lucide-react";
import { toast } from "sonner";

export function InviteMailForm({ onSend, sent, testPrefix }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { await onSend({ email: email.trim().toLowerCase(), full_name: name.trim() }); setEmail(""); setName(""); } finally { setBusy(false); }
  };
  const copy = (t) => navigator.clipboard?.writeText(t).then(() => toast.success("Messaggio copiato: incollalo su WhatsApp o email"));
  return (
    <div className="space-y-2" data-testid={`${testPrefix}-mail`}>
      <form onSubmit={submit} className="space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input className="fsl-input h-9 text-sm" placeholder="Nome del dirigente" value={name} onChange={(e) => setName(e.target.value)} data-testid={`${testPrefix}-mail-name`} />
          <input className="fsl-input h-9 text-sm" type="email" required placeholder="email@dirigente.it" value={email} onChange={(e) => setEmail(e.target.value)} data-testid={`${testPrefix}-mail-email`} />
        </div>
        <button type="submit" className="btn-gold w-full h-9" disabled={busy || !email} data-testid={`${testPrefix}-mail-send`}><Mail className="h-4 w-4" /> {busy ? "Invio…" : "Invita via email (link + guida)"}</button>
      </form>
      {sent && (
        <div className={`rounded-lg border p-3 text-xs ${sent.emailed ? "border-fsl-success/40 text-fsl-success" : "border-fsl-warning/50 text-fsl-warning"}`} data-testid={`${testPrefix}-mail-result`}>
          {sent.emailed ? <><Send className="inline h-3.5 w-3.5 mr-1" />Email di benvenuto inviata: contiene il link con il codice e la guida rapida all'Area Società.</> : <>
            <div>{sent.mail_configured ? "Invio email non riuscito." : "Email dell'organizzazione non configurata."} Il messaggio di benvenuto è pronto: copialo e mandalo su WhatsApp.</div>
            <button type="button" className="btn-ghost h-8 mt-2 text-xs" onClick={() => copy(sent.message_text)} data-testid={`${testPrefix}-mail-copy`}><Copy className="h-3.5 w-3.5" /> Copia messaggio di benvenuto</button>
          </>}
        </div>
      )}
    </div>
  );
}
