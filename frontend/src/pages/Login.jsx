import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { Logo } from "@/components/fsl/Logo";
import { useAuth } from "@/context/AuthContext";
import { GoogleButton } from "@/components/fsl/GoogleButton";
import { apiError } from "@/lib/api";
import { isPathAllowed } from "@/routes/ProtectedRoute";

const HERO = "https://images.unsplash.com/photo-1574629810360-7efbbe195018?crop=entropy&cs=srgb&fm=jpg&q=80&w=1800";

export default function Login() {
  const { user, landing, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const target = (u, fallback) => { const from = location.state?.from; return from && from !== "/login" && from !== "/registrati" && isPathAllowed(u, from) ? from : fallback; };
  if (user) return <Navigate to={target(user, landing)} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await login(email, password);
      navigate(target(data.user, data.landing), { replace: true });
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.2fr_1fr] bg-navy-900">
      <section className="relative hidden lg:block overflow-hidden grain">
        <img src={HERO} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 hero-overlay" />
        <div className="relative h-full flex flex-col justify-between p-12">
          <Logo />
          <div>
            <div className="fsl-kicker mb-3">Piattaforma multi-torneo</div>
            <h1 className="text-6xl xl:text-7xl font-extrabold leading-[0.9]">
              La Serie A
              <br />
              del futuro
            </h1>
            <p className="mt-5 max-w-md text-fsl-slate">Hub tornei, Control Room, Area Società e portale pubblico in un unico motore dati con ruoli, audit e classifiche ufficiali.</p>
          </div>
        </div>
      </section>
      <section className="flex items-center justify-center p-6 sm:p-12">
        <form onSubmit={submit} className="w-full max-w-sm animate-rise" data-testid="login-form">
          <div className="lg:hidden mb-10">
            <Logo />
          </div>
          <div className="fsl-kicker">Accesso operatori</div>
          <h2 className="text-4xl font-extrabold mt-1">Entra nella tua area</h2>
          <p className="mt-2 text-sm text-fsl-slate">Verrai indirizzato automaticamente all'ambiente del tuo ruolo.</p>
          <div className="mt-8 space-y-4">
            <label className="block">
              <span className="fsl-label">Email</span>
              <input type="email" autoComplete="email" required className="fsl-input mt-1" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="login-email-input" />
            </label>
            <label className="block">
              <span className="fsl-label">Password</span>
              <span className="relative block mt-1">
                <input type={show ? "text" : "password"} autoComplete="current-password" required className="fsl-input pr-12" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="login-password-input" />
                <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-1 top-1 h-9 w-10 inline-flex items-center justify-center text-fsl-slate hover:text-fsl-white" aria-label={show ? "Nascondi password" : "Mostra password"} data-testid="login-toggle-password">
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </span>
            </label>
            {error && (
              <p role="alert" className="text-sm text-fsl-danger flex items-center gap-2" data-testid="login-error">
                <span className="h-2 w-2 rounded-full bg-fsl-danger" aria-hidden="true" /> {error}
              </p>
            )}
            <button type="submit" disabled={busy} className="btn-primary w-full" data-testid="login-submit-button">
              <LogIn className="h-4 w-4" aria-hidden="true" /> {busy ? "Accesso in corso…" : "Accedi"}
            </button>
          </div>
          <div className="mt-6 space-y-3">
            <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider text-fsl-slate"><span className="h-px flex-1 bg-white/10" />Genitori e tifosi<span className="h-px flex-1 bg-white/10" /></div>
            <GoogleButton />
            <Link to="/registrati" className="btn-ghost w-full" data-testid="login-register-link">Crea un account genitore/tifoso</Link>
          </div>
          <p className="mt-6 text-xs text-fsl-slate">Admin, Direttore, Segreteria, Arbitri e Società usano le credenziali ricevute. Genitori e tifosi si registrano liberamente: vedono tutto, segnalano errori e acquistano foto e video.</p>
        </form>
      </section>
    </div>
  );
}
