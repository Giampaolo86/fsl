import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { KeyRound, Mail } from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/fsl/Logo";
import { api, apiError } from "@/lib/api";

const Shell = ({ kicker, title, children }) => (
  <div className="min-h-screen bg-navy-900 text-fsl-white flex items-center justify-center p-6">
    <div className="w-full max-w-sm animate-rise">
      <div className="mb-10"><Logo /></div>
      <div className="fsl-kicker">{kicker}</div>
      <h1 className="text-4xl font-extrabold mt-1 mb-6">{title}</h1>
      {children}
    </div>
  </div>
);

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const submit = async (e) => { e.preventDefault(); setBusy(true); try { const { data } = await api.post("/auth/forgot-password", { email }); setDone(data); } catch (err) { toast.error(apiError(err)); } finally { setBusy(false); } };
  return (
    <Shell kicker="Recupero password" title="Password dimenticata?">
      {done ? (
        <div className="fsl-card p-5 space-y-3" data-testid="forgot-done">
          <Mail className="h-6 w-6 text-fsl-gold" />
          {done.assisted ? <p className="text-sm">Richiesta registrata. L'organizzazione FSL vede la tua richiesta e ti farà avere il link per reimpostare la password (via WhatsApp, SMS o email) tramite il tuo referente. Se non ricevi nulla, scrivi a <a href="mailto:info@futurestarsleague.it" className="text-fsl-gold">info@futurestarsleague.it</a>.</p> : <p className="text-sm">Se l'indirizzo è registrato riceverai entro pochi minuti un'email con il link per scegliere una nuova password (valido 24 ore). Controlla anche la cartella spam.</p>}
          <Link to="/login" className="btn-ghost w-full" data-testid="forgot-back">Torna al login</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" data-testid="forgot-form">
          <p className="text-sm text-fsl-slate">Inserisci l'email del tuo account: ti facciamo avere un link per scegliere una nuova password.</p>
          <label className="block"><span className="fsl-label">Email</span><input type="email" required className="fsl-input mt-1" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="forgot-email" /></label>
          <button type="submit" className="btn-gold w-full" disabled={busy} data-testid="forgot-submit"><KeyRound className="h-4 w-4" /> {busy ? "Invio…" : "Invia il link di reset"}</button>
          <p className="text-xs text-fsl-slate"><Link to="/login" className="text-fsl-gold hover:underline">Torna al login</Link></p>
        </form>
      )}
    </Shell>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") || "";
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => { e.preventDefault(); if (pw !== pw2) return toast.error("Le password non coincidono"); setBusy(true); try { await api.post("/auth/reset-password", { token, password: pw }); toast.success("Password aggiornata: ora puoi accedere"); navigate("/login", { replace: true }); } catch (err) { toast.error(apiError(err)); } finally { setBusy(false); } };
  if (!token) return <Shell kicker="Recupero password" title="Link non valido"><p className="text-sm text-fsl-slate">Il link è incompleto. <Link to="/password-dimenticata" className="text-fsl-gold hover:underline">Richiedi un nuovo reset</Link>.</p></Shell>;
  return (
    <Shell kicker="Recupero password" title="Scegli la nuova password">
      <form onSubmit={submit} className="space-y-4" data-testid="reset-form">
        <label className="block"><span className="fsl-label">Nuova password (min. 8 caratteri)</span><input type="password" required minLength={8} className="fsl-input mt-1" value={pw} onChange={(e) => setPw(e.target.value)} data-testid="reset-password" /></label>
        <label className="block"><span className="fsl-label">Ripeti la password</span><input type="password" required minLength={8} className="fsl-input mt-1" value={pw2} onChange={(e) => setPw2(e.target.value)} data-testid="reset-password-2" /></label>
        <button type="submit" className="btn-gold w-full" disabled={busy} data-testid="reset-submit"><KeyRound className="h-4 w-4" /> {busy ? "Salvataggio…" : "Salva e accedi"}</button>
      </form>
    </Shell>
  );
}
