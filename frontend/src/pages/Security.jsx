import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, KeyRound, LogOut, Monitor, ShieldCheck, ShieldOff, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/fsl/Logo";
import { MfaSetup, RecoveryCodes, mfaApi } from "@/components/fsl/Mfa";
import { PageHeader, SectionTitle } from "@/components/fsl/Primitives";
import { useAuth } from "@/context/AuthContext";
import { api, apiError } from "@/lib/api";
import { fmtDate } from "@/lib/format";

export function PasswordForm({ onDone, forced = false }) {
  const { updateUser, setLanding } = useAuth();
  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (pw !== pw2) return toast.error("Le due password non coincidono");
    setBusy(true);
    try {
      const { data } = await api.post("/auth/password/change", { current_password: cur, new_password: pw });
      updateUser(data.user); setLanding(data.landing);
      toast.success("Password aggiornata. Le altre sessioni sono state chiuse.");
      setCur(""); setPw(""); setPw2("");
      onDone?.(data);
    } catch (err) { toast.error(apiError(err)); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-4 max-w-md" data-testid="password-form">
      <label className="block"><span className="fsl-label">{forced ? "Password temporanea ricevuta" : "Password attuale"}</span><input type="password" autoComplete="current-password" required className="fsl-input mt-1" value={cur} onChange={(e) => setCur(e.target.value)} data-testid="password-current" /></label>
      <label className="block"><span className="fsl-label">Nuova password</span><input type="password" autoComplete="new-password" required minLength={10} className="fsl-input mt-1" value={pw} onChange={(e) => setPw(e.target.value)} data-testid="password-new" /><span className="text-xs text-fsl-slate">Almeno 10 caratteri, con lettere e numeri.</span></label>
      <label className="block"><span className="fsl-label">Ripeti la nuova password</span><input type="password" autoComplete="new-password" required className="fsl-input mt-1" value={pw2} onChange={(e) => setPw2(e.target.value)} data-testid="password-confirm" /></label>
      <button type="submit" disabled={busy} className="btn-primary" data-testid="password-submit"><KeyRound className="h-4 w-4" /> {busy ? "Salvataggio…" : "Cambia password"}</button>
    </form>
  );
}

export default function ChangePassword() {
  const { user, landing } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-navy-900 flex items-center justify-center p-6">
      <div className="w-full max-w-md fsl-card p-8 animate-rise" data-testid="change-password-page">
        <Logo />
        <div className="fsl-kicker mt-8">Primo accesso</div>
        <h1 className="text-3xl font-extrabold mt-1">Scegli la tua password</h1>
        <p className="text-sm text-fsl-slate mt-2 mb-6">Ciao {user?.full_name}: stai usando una password temporanea. Impostane una personale per continuare.</p>
        <PasswordForm forced onDone={(d) => navigate(d.landing || landing, { replace: true })} />
      </div>
    </div>
  );
}

function MfaCard({ user }) {
  const { updateUser } = useAuth();
  const [mode, setMode] = useState(null);
  const [codes, setCodes] = useState(null);
  const [pw, setPw] = useState("");
  const [code, setCode] = useState("");
  const begin = useCallback(() => mfaApi.enableBegin(), []);
  const confirm = useCallback((c) => mfaApi.enableConfirm(c), []);
  const disable = async (e) => { e.preventDefault(); try { await api.post("/auth/mfa/disable", { password: pw, code }); updateUser({ mfa_enabled: false }); setMode(null); toast.success("Verifica in due passaggi disattivata"); } catch (err) { toast.error(apiError(err)); } };
  const regen = async (e) => { e.preventDefault(); try { const { data } = await api.post("/auth/mfa/recovery/regenerate", { code }); setCodes(data.recovery_codes); setMode(null); } catch (err) { toast.error(apiError(err)); } };
  if (codes) return <div className="fsl-card p-5"><RecoveryCodes codes={codes} onDone={() => setCodes(null)} doneLabel="Fatto" /></div>;
  return (
    <div className="fsl-card p-5" data-testid="mfa-card">
      <div className="flex items-center gap-3"><ShieldCheck className={`h-6 w-6 ${user.mfa_enabled ? "text-fsl-success" : "text-fsl-slate"}`} /><div className="flex-1"><div className="font-display font-bold uppercase">Verifica in due passaggi</div><div className="text-xs text-fsl-slate" data-testid="mfa-status">{user.mfa_enabled ? "Attiva: al login ti chiediamo il codice dell'app Authenticator" : user.mfa_required ? "Obbligatoria per il tuo ruolo" : "Non attiva · consigliata"}</div></div></div>
      {mode === "enable" && <div className="mt-5"><MfaSetup begin={begin} confirm={confirm} intro="Aggiungi un secondo fattore al tuo account." onDone={() => { updateUser({ mfa_enabled: true }); setMode(null); toast.success("Verifica in due passaggi attiva"); }} /></div>}
      {mode === "disable" && <form onSubmit={disable} className="mt-5 grid sm:grid-cols-2 gap-3 max-w-md"><input type="password" required className="fsl-input" placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} data-testid="mfa-disable-password" /><input required className="fsl-input" placeholder="Codice app" value={code} onChange={(e) => setCode(e.target.value)} data-testid="mfa-disable-code" /><button className="btn-primary sm:col-span-2" data-testid="mfa-disable-submit"><ShieldOff className="h-4 w-4" /> Disattiva</button></form>}
      {mode === "regen" && <form onSubmit={regen} className="mt-5 flex gap-3 max-w-md"><input required className="fsl-input" placeholder="Codice app" value={code} onChange={(e) => setCode(e.target.value)} data-testid="mfa-regen-code" /><button className="btn-primary" data-testid="mfa-regen-submit">Genera nuovi codici</button></form>}
      {!mode && <div className="mt-4 flex flex-wrap gap-2">
        {!user.mfa_enabled && <button className="btn-primary" onClick={() => setMode("enable")} data-testid="mfa-enable-button">Attiva</button>}
        {user.mfa_enabled && <button className="btn-ghost" onClick={() => setMode("regen")} data-testid="mfa-regen-button">Nuovi codici di recupero</button>}
        {user.mfa_enabled && !user.mfa_required && <button className="btn-ghost" onClick={() => setMode("disable")} data-testid="mfa-disable-button">Disattiva</button>}
      </div>}
    </div>
  );
}

function Sessions() {
  const [data, setData] = useState(null);
  const load = useCallback(() => api.get("/auth/sessions").then((r) => setData(r.data)).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  const revoke = async (id) => { await api.delete(`/auth/sessions/${id}`); toast.success("Sessione chiusa"); load(); };
  const all = async () => { const { data: d } = await api.post("/auth/logout-all"); toast.success(`${d.revoked} altre sessioni chiuse`); load(); };
  if (!data) return null;
  return (
    <div className="fsl-card p-5" data-testid="sessions-card">
      <div className="flex items-center justify-between gap-3 mb-3"><div className="font-display font-bold uppercase">Dispositivi connessi</div>{data.items.length > 1 && <button className="btn-ghost h-9" onClick={all} data-testid="sessions-logout-all"><LogOut className="h-4 w-4" /> Chiudi le altre</button>}</div>
      <ul className="divide-y divide-white/[0.06]">{data.items.map((s) => <li key={s.id} className="py-2 flex items-center gap-3 text-sm" data-testid={`session-${s.id}`}><Monitor className="h-4 w-4 text-fsl-slate shrink-0" /><div className="flex-1 min-w-0"><div className="truncate">{s.user_agent || "Dispositivo"}{s.id === data.current && <span className="ml-2 text-[10px] uppercase text-fsl-gold font-bold">questo</span>}</div><div className="text-xs text-fsl-slate">IP {s.ip || "—"} · ultimo accesso {fmtDate(s.last_used_at, { time: true })}</div></div>{s.id !== data.current && <button className="btn-ghost h-9 px-3 text-xs" onClick={() => revoke(s.id)} data-testid={`session-revoke-${s.id}`}>Chiudi</button>}</li>)}</ul>
    </div>
  );
}

const deviceLabel = (ua = "") => (/iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "Dispositivo") + (/Chrome|CriOS/.test(ua) ? " · Chrome" : /Safari/.test(ua) ? " · Safari" : /Firefox/.test(ua) ? " · Firefox" : "");

function TrustedDevices({ user }) {
  const [items, setItems] = useState(null);
  const load = useCallback(() => api.get("/auth/mfa/devices").then((r) => setItems(r.data)).catch(() => setItems([])), []);
  useEffect(() => { if (user.mfa_enabled) load(); }, [load, user.mfa_enabled]);
  if (!user.mfa_enabled || !items) return null;
  const forget = async (d) => { try { await api.delete(`/auth/mfa/devices/${d.id}`); toast.success("Dispositivo dimenticato: al prossimo accesso da lì servirà il codice"); load(); } catch (e) { toast.error(apiError(e)); } };
  return (
    <div className="fsl-card p-5" data-testid="trusted-devices-card">
      <div className="font-display font-bold uppercase mb-1">Dispositivi ricordati</div>
      <p className="text-xs text-fsl-slate mb-3">Da questi dispositivi il codice di verifica non viene richiesto per 30 giorni («Ricorda questo dispositivo» al login).</p>
      {items.length === 0 ? <p className="text-sm text-fsl-slate" data-testid="trusted-devices-empty">Nessun dispositivo ricordato.</p> : (
        <ul className="divide-y divide-white/[0.06]">{items.map((d) => <li key={d.id} className="py-2 flex items-center gap-3 text-sm" data-testid={`trusted-device-${d.id}`}><Smartphone className="h-4 w-4 text-fsl-gold shrink-0" /><span className="flex-1 min-w-0"><span className="font-semibold">{deviceLabel(d.user_agent)}</span>{d.current && <span className="ml-2 text-[10px] uppercase tracking-wider text-fsl-gold">questo dispositivo</span>}<span className="block text-[11px] text-fsl-slate">Ricordato il {fmtDate(d.created_at)} · ultimo accesso {fmtDate(d.last_used_at)} · scade il {fmtDate(d.expires_at)}{d.ip ? ` · IP ${d.ip}` : ""}</span></span><button type="button" className="btn-ghost h-8 text-xs" onClick={() => forget(d)} data-testid={`trusted-device-forget-${d.id}`}><ShieldOff className="h-3.5 w-3.5" /> Dimentica</button></li>)}</ul>
      )}
    </div>
  );
}

export function SecuritySettings() {
  const { user } = useAuth();
  return (
    <div className="space-y-8" data-testid="security-page">
      <PageHeader kicker="Il tuo account" title="Sicurezza" subtitle={`${user.full_name} · ${user.email}`} />
      <MfaCard user={user} />
      <section><SectionTitle>Cambia password</SectionTitle><div className="fsl-card p-5"><PasswordForm /></div></section>
      <Sessions />
      <TrustedDevices user={user} />
    </div>
  );
}

export function SecurityPage() {
  const { landing } = useAuth();
  return (
    <div className="min-h-screen bg-navy-900">
      <header className="h-16 border-b border-white/10 bg-ink-950/80 backdrop-blur"><div className="mx-auto max-w-4xl px-6 h-full flex items-center justify-between"><Logo /><Link to={landing} className="btn-ghost h-10" data-testid="security-back"><ArrowLeft className="h-4 w-4" /> Torna alla mia area</Link></div></header>
      <main className="mx-auto max-w-4xl px-6 py-10"><SecuritySettings /></main>
    </div>
  );
}
