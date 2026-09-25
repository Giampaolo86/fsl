import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy, KeyRound, ShieldCheck, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";

export function RecoveryCodes({ codes, onDone, doneLabel = "Ho salvato i codici, continua" }) {
  const copy = () => { navigator.clipboard?.writeText(codes.join("\n")); toast.success("Codici copiati"); };
  return (
    <div className="space-y-4" data-testid="mfa-recovery-codes">
      <div className="rounded-lg border border-fsl-gold/40 bg-fsl-gold/10 p-4 text-sm"><strong className="text-fsl-gold">Codici di recupero</strong> — conservali in un posto sicuro. Ognuno vale una sola volta e ti permette di entrare se perdi il telefono.</div>
      <div className="grid grid-cols-2 gap-2 font-mono text-sm">{codes.map((c) => <span key={c} className="rounded-md bg-navy-700/60 border border-white/10 px-3 py-2 text-center num" data-testid="mfa-recovery-code">{c}</span>)}</div>
      <div className="flex gap-2"><button type="button" className="btn-ghost flex-1" onClick={copy} data-testid="mfa-copy-codes"><Copy className="h-4 w-4" /> Copia</button><button type="button" className="btn-primary flex-1" onClick={onDone} data-testid="mfa-codes-done">{doneLabel}</button></div>
    </div>
  );
}

export function CodeInput({ value, onChange, autoFocus = true, testId = "mfa-code-input", placeholder = "123456" }) {
  return <input inputMode="numeric" autoComplete="one-time-code" autoFocus={autoFocus} maxLength={9} className="fsl-input mt-1 text-center text-2xl tracking-[0.4em] font-display" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId} />;
}

export function MfaSetup({ begin, confirm, onDone, intro }) {
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { begin().then(setSetup).catch((e) => setError(apiError(e))); }, [begin]);
  if (codes) return <RecoveryCodes codes={codes} onDone={onDone} />;
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError("");
    try { const out = await confirm(code); setCodes(out.recovery_codes); } catch (err) { setError(apiError(err)); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-5" data-testid="mfa-setup">
      <div className="flex items-start gap-3 text-sm text-fsl-white/85"><Smartphone className="h-5 w-5 text-fsl-gold shrink-0 mt-0.5" /><p>{intro || "Per il tuo ruolo è obbligatoria la verifica in due passaggi."} Installa un'app come <strong>Google Authenticator</strong> o <strong>Microsoft Authenticator</strong>, tocca «+» e inquadra il QR.</p></div>
      {setup ? <div className="flex flex-col sm:flex-row items-center gap-5"><div className="rounded-xl bg-white p-3" data-testid="mfa-qr"><QRCodeSVG value={setup.otpauth_uri} size={168} /></div><div className="text-xs text-fsl-slate space-y-2 min-w-0"><p>Non riesci a inquadrare? Inserisci questa chiave a mano:</p><code className="block break-all rounded bg-navy-700/60 px-2 py-1.5 font-mono text-fsl-white select-all" data-testid="mfa-secret">{setup.secret}</code><p>Account: {setup.email}</p></div></div> : <div className="h-44 flex items-center justify-center text-sm text-fsl-slate">Preparo il QR…</div>}
      <label className="block"><span className="fsl-label">Codice a 6 cifre mostrato dall'app</span><CodeInput value={code} onChange={setCode} /></label>
      {error && <p role="alert" className="text-sm text-fsl-danger" data-testid="mfa-error">{error}</p>}
      <button type="submit" disabled={busy || code.replace(/\D/g, "").length < 6} className="btn-primary w-full" data-testid="mfa-setup-submit"><ShieldCheck className="h-4 w-4" /> {busy ? "Verifica…" : "Attiva e continua"}</button>
    </form>
  );
}

export function MfaChallenge({ email, verify }) {
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError("");
    try { const out = await verify(code); if (out.recovery_codes_left != null) toast.warning(`Codice di recupero usato: te ne restano ${out.recovery_codes_left}`); } catch (err) { setError(apiError(err)); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-5" data-testid="mfa-challenge">
      <div className="flex items-start gap-3 text-sm text-fsl-white/85"><KeyRound className="h-5 w-5 text-fsl-gold shrink-0 mt-0.5" /><p>Ciao <strong>{email}</strong>: {recovery ? "inserisci uno dei tuoi codici di recupero (formato XXXX-XXXX)." : "apri l'app Authenticator e inserisci il codice a 6 cifre."}</p></div>
      <label className="block"><span className="fsl-label">{recovery ? "Codice di recupero" : "Codice di verifica"}</span><CodeInput value={code} onChange={setCode} placeholder={recovery ? "AB12-CD34" : "123456"} /></label>
      {error && <p role="alert" className="text-sm text-fsl-danger" data-testid="mfa-error">{error}</p>}
      <button type="submit" disabled={busy || code.trim().length < 6} className="btn-primary w-full" data-testid="mfa-verify-submit">{busy ? "Verifica…" : "Conferma"}</button>
      <button type="button" className="text-xs text-fsl-slate hover:text-fsl-white underline w-full" onClick={() => { setRecovery(!recovery); setCode(""); setError(""); }} data-testid="mfa-toggle-recovery">{recovery ? "Ho di nuovo il telefono: usa il codice dell'app" : "Ho perso il telefono: usa un codice di recupero"}</button>
    </form>
  );
}

export const mfaApi = {
  enableBegin: () => api.post("/auth/mfa/enable/begin").then((r) => r.data),
  enableConfirm: (code) => api.post("/auth/mfa/enable/confirm", { code }).then((r) => r.data),
  setupBegin: (challenge) => api.post("/auth/mfa/setup/begin", { challenge }).then((r) => r.data),
};
