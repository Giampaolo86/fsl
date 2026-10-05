import { useCallback, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronRight, Eye, EyeOff, Flag, Heart, LogIn, Settings, Users } from "lucide-react";
import { Logo } from "@/components/fsl/Logo";
import { useAuth } from "@/context/AuthContext";
import { GoogleButton } from "@/components/fsl/GoogleButton";
import { MfaChallenge, MfaSetup, mfaApi } from "@/components/fsl/Mfa";
import { apiError } from "@/lib/api";
import { isPathAllowed } from "@/routes/ProtectedRoute";

const HERO = "https://images.unsplash.com/photo-1574629810360-7efbbe195018?crop=entropy&cs=srgb&fm=jpg&q=80&w=1800";
const AREAS = {
  genitori: { icon: Heart, kicker: "Genitori e tifosi", title: "Genitori e tifosi", short: "Segui tuo figlio, la tua squadra del cuore e il torneo: risultati, Top 11, foto e video.", desc: "Accedi con email e password. Nessun account Google necessario.", tone: "border-fsl-gold bg-fsl-gold/10" },
  societa: { icon: Users, kicker: "Società", title: "Area Società", short: "Rose, convocazioni, foto giocatori, blog e vendite della tua società.", desc: "Entra con le credenziali create dall'organizzazione, con un codice invito o richiedendo l'accesso.", tone: "border-white/15 hover:border-fsl-gold/60" },
  arbitri: { icon: Flag, kicker: "Arbitri", title: "Area Arbitri", short: "Referti, tabellini e ufficializzazione delle gare che dirigi.", desc: "Usa le credenziali ricevute dall'organizzazione.", tone: "border-white/15 hover:border-fsl-gold/60" },
  staff: { icon: Settings, kicker: "Staff e operatori", title: "Control Room", short: "Admin, Direttore e Segreteria: tornei, motore gare, Studio, pagamenti.", desc: "Credenziali riservate con verifica in due passaggi.", tone: "border-white/15 hover:border-fsl-gold/60" },
};
const inferArea = (from) => (!from ? null : from.startsWith("/account") ? "genitori" : from.startsWith("/societa") ? "societa" : from.startsWith("/arbitro") ? "arbitri" : from.startsWith("/admin") ? "staff" : null);

function AreaChooser({ state }) {
  return (
    <div className="w-full max-w-lg animate-rise" data-testid="login-chooser">
      <div className="lg:hidden mb-10"><Logo /></div>
      <div className="fsl-kicker">Accesso</div>
      <h2 className="text-4xl font-extrabold mt-1">Chi sei?</h2>
      <p className="mt-2 text-sm text-fsl-slate">Ogni area ha il suo accesso: scegli la tua e verrai portato nell'ambiente giusto.</p>
      <div className="mt-8 grid gap-3">
        {Object.entries(AREAS).map(([k, a]) => <Link key={k} to={`/login?area=${k}`} state={state} className={`group flex items-center gap-4 rounded-2xl border p-4 transition-colors ${a.tone}`} data-testid={`login-area-${k}`}><span className={`h-12 w-12 shrink-0 rounded-xl inline-flex items-center justify-center ${k === "genitori" ? "bg-fsl-gold text-ink-950" : "bg-white/5 text-fsl-gold"}`}><a.icon className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="block font-display font-extrabold uppercase text-lg leading-none">{a.title}</span><span className="block text-xs text-fsl-slate mt-1">{a.short}</span></span><ChevronRight className="h-5 w-5 text-fsl-slate group-hover:text-fsl-gold" /></Link>)}
      </div>
      <p className="mt-6 text-xs text-fsl-slate">Sei un genitore e non hai ancora un account? <Link to="/registrati" className="text-fsl-gold hover:underline" data-testid="login-chooser-register">Registrati gratis con la tua email</Link>.</p>
    </div>
  );
}

export default function Login() {
  const { user, landing, login, mfaVerify, mfaSetupConfirm, setSession } = useAuth();
  const [step, setStep] = useState(null);
  const pending = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [wrongArea, setWrongArea] = useState(null);
  const [busy, setBusy] = useState(false);

  const qs = new URLSearchParams(location.search);
  const area = qs.has("scegli") ? null : qs.get("area") || inferArea(location.state?.from);
  const A = AREAS[area] || null;
  const target = (u, fallback) => { const from = location.state?.from; return from && from !== "/login" && from !== "/registrati" && isPathAllowed(u, from) ? from : fallback; };
  const setupBegin = useCallback(() => mfaApi.setupBegin(step?.challenge), [step]);
  if (user) return <Navigate to={target(user, landing)} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await login(email, password, area);
      if (data.mfa_required || data.mfa_setup_required) { setStep(data); return; }
      navigate(target(data.user, data.landing), { replace: true });
    } catch (err) {
      const d = err?.response?.data?.detail;
      if (d?.code === "WRONG_AREA") { setWrongArea(d.area || null); setError(d.message); } else { setWrongArea(null); setError(apiError(err)); }
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
        {step ? (
          <div className="w-full max-w-sm animate-rise" data-testid="login-mfa-step">
            <div className="lg:hidden mb-10"><Logo /></div>
            <div className="fsl-kicker">{step.mfa_setup_required ? "Configura la sicurezza" : "Verifica in due passaggi"}</div>
            <h2 className="text-4xl font-extrabold mt-1 mb-6">{step.mfa_setup_required ? "Proteggi il tuo account" : "Inserisci il codice"}</h2>
            {step.mfa_setup_required ? <MfaSetup begin={setupBegin} confirm={(code) => mfaSetupConfirm(step.challenge, code).then((d) => { pending.current = d; return d; })} onDone={() => { const d = pending.current; setSession(d); navigate(target(d.user, d.landing), { replace: true }); }} /> : <MfaChallenge email={step.email} verify={(code, remember) => mfaVerify(step.challenge, code, remember)} />}
            <button type="button" className="mt-6 text-xs text-fsl-slate hover:text-fsl-white underline" onClick={() => setStep(null)} data-testid="mfa-back">Torna al login</button>
          </div>
        ) : !A ? <AreaChooser state={location.state} /> : (
        <form onSubmit={submit} className="w-full max-w-sm animate-rise" data-testid="login-form" data-area={area}>
          <div className="lg:hidden mb-10">
            <Logo />
          </div>
          <Link to="/login?scegli" state={location.state} className="inline-flex items-center gap-1 text-xs text-fsl-slate hover:text-fsl-white mb-4" data-testid="login-change-area"><ArrowLeft className="h-3.5 w-3.5" /> Cambia area</Link>
          <div className="fsl-kicker flex items-center gap-2"><A.icon className="h-3.5 w-3.5 text-fsl-gold" /> {A.kicker}</div>
          <h2 className="text-4xl font-extrabold mt-1">{A.title}</h2>
          <p className="mt-2 text-sm text-fsl-slate">{A.desc}</p>
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
              <div role="alert" className="rounded-lg border border-fsl-danger/50 bg-fsl-danger/10 p-3 text-sm text-fsl-danger" data-testid="login-error">
                <p className="flex items-start gap-2"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-fsl-danger" aria-hidden="true" /> {error}</p>
                {wrongArea && <Link to={`/login?area=${wrongArea}`} state={location.state} onClick={() => { setError(""); setWrongArea(null); }} className="mt-2 inline-flex items-center gap-1 rounded-full bg-fsl-gold px-3 h-8 text-xs font-bold text-ink-950" data-testid="login-wrong-area-link">Vai a «{AREAS[wrongArea]?.title}» <ChevronRight className="h-3.5 w-3.5" /></Link>}
              </div>
            )}
            <button type="submit" disabled={busy} className="btn-primary w-full" data-testid="login-submit-button">
              <LogIn className="h-4 w-4" aria-hidden="true" /> {busy ? "Accesso in corso…" : "Accedi"}
            </button>
            <p className="text-right text-xs"><Link to="/password-dimenticata" className="text-fsl-slate hover:text-fsl-gold underline" data-testid="login-forgot-link">Password dimenticata?</Link></p>
          </div>
          {area === "genitori" && (
            <div className="mt-6 space-y-3">
              <Link to="/registrati" className="btn-gold w-full" data-testid="login-register-link">Non hai un account? Registrati gratis</Link>
              <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider text-fsl-slate"><span className="h-px flex-1 bg-white/10" />oppure, se preferisci<span className="h-px flex-1 bg-white/10" /></div>
              <GoogleButton />
              <p className="text-xs text-fsl-slate">L'area genitori e tifosi è gratuita: segui tuo figlio o la tua squadra, ricevi gli avvisi, acquista foto, video e la Card Player ID.</p>
            </div>
          )}
          {area === "societa" && (
            <div className="mt-6 space-y-3">
              <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider text-fsl-slate"><span className="h-px flex-1 bg-white/10" />Prima volta?<span className="h-px flex-1 bg-white/10" /></div>
              <div className="grid grid-cols-2 gap-2"><Link to="/registrati-societa" className="btn-ghost w-full text-xs" data-testid="login-register-club-link">Ho un codice invito</Link><Link to="/richiedi-accesso" className="btn-ghost w-full text-xs" data-testid="login-request-access-link">Richiedi accesso</Link></div>
            </div>
          )}
          {(area === "staff" || area === "arbitri") && <p className="mt-6 text-xs text-fsl-slate">Accesso riservato: le credenziali sono rilasciate dall'organizzazione. Sei un genitore o un tifoso? <Link to="/login?area=genitori" className="text-fsl-gold hover:underline">Vai all'area genitori e tifosi</Link>.</p>}
          {area === "arbitri" && <p className="mt-2 text-xs text-fsl-slate">Prima gara? <Link to="/guida-arbitri" className="text-fsl-gold hover:underline" data-testid="login-referee-guide-link">Guarda la Guida Arbitri: come compilare il tabellino dal telefono</Link>.</p>}
        </form>
        )}
      </section>
    </div>
  );
}
