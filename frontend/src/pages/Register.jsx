import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Heart, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/fsl/Logo";
import { LoadingState } from "@/components/fsl/States";
import { useAuth } from "@/context/AuthContext";
import { apiError } from "@/lib/api";

export function GoogleButton() {
  const go = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/account";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };
  return (
    <button type="button" onClick={go} className="w-full h-11 rounded-md bg-fsl-white text-ink-950 font-semibold text-sm inline-flex items-center justify-center gap-2 hover:bg-fsl-white/90" data-testid="google-login-button">
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.2l7.8 6C12.4 13.4 17.7 9.5 24 9.5z" /><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-2.8-.4-4H24v8.1h12.7c-.3 2.1-1.7 5.3-4.8 7.4l7.4 5.7c4.4-4.1 7.2-10.1 7.2-17.2z" /><path fill="#FBBC05" d="M10.5 28.6A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.2z" /><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2 1.4-4.7 2.4-8.5 2.4-6.3 0-11.6-4-13.5-9.7l-7.9 6.2C6.5 42.6 14.6 48 24 48z" /></svg>
      Continua con Google
    </button>
  );
}

export function AuthCallback() {
  const { googleSession } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const id = new URLSearchParams(location.hash.replace(/^#/, "")).get("session_id");
    googleSession(id).then((d) => { window.history.replaceState(null, "", window.location.pathname); navigate(d.landing || "/account", { replace: true }); }).catch((e) => { toast.error(apiError(e)); navigate("/login", { replace: true }); });
  }, [googleSession, navigate, location.hash]);
  return <LoadingState full />;
}

export default function Register() {
  const { register, user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ full_name: "", email: "", password: "", privacy_accepted: false });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (user) navigate(user.role === "fan" ? "/account" : "/", { replace: true }); }, [user, navigate]);
  const submit = async (e) => { e.preventDefault(); setBusy(true); try { await register(form); toast.success("Benvenuto nella Future Stars League!"); navigate("/account", { replace: true }); } catch (err) { toast.error(apiError(err)); } finally { setBusy(false); } };
  return (
    <div className="min-h-screen bg-navy-900 text-fsl-white grid lg:grid-cols-2">
      <section className="hidden lg:flex flex-col justify-between p-12 grain bg-navy-800 border-r border-white/10">
        <Logo />
        <div className="space-y-6">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[0.95]">Segui la squadra<br />del tuo campione.</h1>
          <ul className="space-y-3 text-base text-fsl-slate">{["Preferiti: torneo, squadra e giocatori con la prossima partita a portata di mano", "Foto professionali e video delle gare da acquistare in un tocco", "Segnala un errore sul tabellino direttamente al Direttore di gara", "Blog, interviste e Match story delle società"].map((t) => <li key={t} className="flex gap-3"><Heart className="h-5 w-5 text-fsl-gold shrink-0" />{t}</li>)}</ul>
        </div>
        <p className="text-xs text-fsl-slate">Nessuna modifica ai dati: l'area genitori è solo lettura, segnalazioni e acquisti.</p>
      </section>
      <section className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-md space-y-4 animate-rise" data-testid="register-form">
          <div className="lg:hidden"><Logo /></div>
          <div className="fsl-kicker">Genitori e tifosi</div>
          <h2 className="text-3xl font-extrabold">Crea il tuo account genitore</h2>
          <p className="text-sm text-fsl-slate -mt-2">Bastano nome, email e una password. Gratis, senza account Google.</p>
          <label className="block"><span className="fsl-label">Nome e cognome</span><input className="fsl-input mt-1" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} data-testid="register-name" /></label>
          <label className="block"><span className="fsl-label">Email</span><input type="email" className="fsl-input mt-1" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="register-email" /></label>
          <label className="block"><span className="fsl-label">Password (min. 8 caratteri)</span><input type="password" className="fsl-input mt-1" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="register-password" /></label>
          <label className="flex items-start gap-2 text-xs text-fsl-slate"><input type="checkbox" className="mt-0.5" checked={form.privacy_accepted} onChange={(e) => setForm({ ...form, privacy_accepted: e.target.checked })} data-testid="register-privacy" /> Ho letto l'informativa privacy: i dati dei minori sono pubblicati solo con il consenso della società e della famiglia.</label>
          <button type="submit" className="btn-gold w-full" disabled={busy || !form.privacy_accepted} data-testid="register-submit"><UserPlus className="h-4 w-4" /> {busy ? "Creazione…" : "Registrati"}</button>
          <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider text-fsl-slate"><span className="h-px flex-1 bg-white/10" />oppure, se preferisci<span className="h-px flex-1 bg-white/10" /></div>
          <GoogleButton />
          <p className="text-xs text-fsl-slate">Hai già un account? <Link to="/login?area=genitori" className="text-fsl-gold hover:underline" data-testid="register-login-link">Accedi all'area genitori</Link> · Sei una società o staff? <Link to="/login" className="text-fsl-gold hover:underline">Altri accessi</Link></p>
        </form>
      </section>
    </div>
  );
}
