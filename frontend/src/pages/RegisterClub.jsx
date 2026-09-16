import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, KeyRound, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/fsl/Logo";
import { useAuth } from "@/context/AuthContext";
import { api, apiError } from "@/lib/api";

function Shell({ kicker, title, subtitle, children }) {
  return (
    <div className="min-h-screen bg-navy-900 text-fsl-white grain">
      <div className="mx-auto max-w-[560px] px-6 py-10">
        <div className="flex items-center justify-between mb-8"><Logo /><Link to="/login" className="text-xs text-fsl-slate hover:text-fsl-white inline-flex items-center gap-1" data-testid="reg-back-login"><ArrowLeft className="h-3.5 w-3.5" /> Accesso</Link></div>
        <div className="fsl-kicker">{kicker}</div>
        <h1 className="text-4xl sm:text-5xl font-extrabold leading-[0.95] mt-1">{title}</h1>
        <p className="mt-3 text-sm text-fsl-slate">{subtitle}</p>
        <div className="fsl-card p-6 mt-6 space-y-4">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }) { return <label className="block"><span className="fsl-label">{label}</span><div className="mt-1">{children}</div></label>; }

export function RegisterClub() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { setSession } = useAuth();
  const [code, setCode] = useState(params.get("codice") || "");
  const [info, setInfo] = useState(null);
  const [f, setF] = useState({ full_name: "", email: "", password: "", privacy_accepted: false });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (code.replace(/-/g, "").length >= 11) api.get(`/public/invites/${code.trim().toUpperCase()}`).then((r) => setInfo(r.data)).catch(() => setInfo(false)); else setInfo(null); }, [code]);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try { const r = await api.post("/auth/register-club", { ...f, code: code.trim().toUpperCase() }); setSession(r.data); toast.success("Benvenuto nell'Area Società"); navigate("/societa", { replace: true }); } catch (err) { toast.error(apiError(err)); } finally { setBusy(false); }
  };
  return (
    <Shell kicker="Area Società" title="Registrati con il codice invito" subtitle="Il codice ti è stato fornito dall'organizzazione del torneo. Vale 30 giorni ed è utilizzabile una sola volta.">
      <form onSubmit={submit} className="space-y-4" data-testid="register-club-form">
        <Field label="Codice invito"><input className="fsl-input uppercase tracking-widest num" placeholder="FSL-XXXX-XXXX" value={code} onChange={(e) => setCode(e.target.value)} required data-testid="register-club-code" /></Field>
        {info && <div className="rounded-lg border border-fsl-success/40 bg-fsl-success/10 p-3 text-sm flex items-center gap-2" data-testid="register-club-invite-ok"><CheckCircle2 className="h-4 w-4 text-fsl-success" /> Codice valido: <strong>{info.club?.name}</strong> · {info.tournament?.name}</div>}
        {info === false && <div className="rounded-lg border border-fsl-danger/40 bg-fsl-danger/10 p-3 text-sm" data-testid="register-club-invite-ko">Codice non valido o scaduto. Contatta l'organizzazione.</div>}
        <Field label="Nome e cognome del responsabile"><input className="fsl-input" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} required data-testid="register-club-name" /></Field>
        <Field label="Email di accesso"><input type="email" className="fsl-input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required data-testid="register-club-email" /></Field>
        <Field label="Password (min 8 caratteri)"><input type="password" className="fsl-input" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} minLength={8} required data-testid="register-club-password" /></Field>
        <label className="flex items-start gap-2 text-xs text-fsl-slate"><input type="checkbox" checked={f.privacy_accepted} onChange={(e) => setF({ ...f, privacy_accepted: e.target.checked })} required data-testid="register-club-privacy" /> Accetto l'informativa privacy e mi impegno a caricare solo dati per cui la società ha il consenso delle famiglie.</label>
        <button className="btn-gold w-full" disabled={busy || !info} data-testid="register-club-submit"><KeyRound className="h-4 w-4" /> Crea account società</button>
      </form>
      <p className="text-xs text-fsl-slate">Non hai un codice? <Link to="/richiedi-accesso" className="text-fsl-gold" data-testid="register-club-to-request">Richiedi l'accesso</Link> all'organizzazione.</p>
    </Shell>
  );
}

export function RequestAccess() {
  const [tournaments, setTournaments] = useState([]);
  const [f, setF] = useState({ tournament_slug: "", club_name: "", city: "", contact_name: "", email: "", phone: "", note: "", privacy_accepted: false });
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get("/public/tournaments").then((r) => { const rows = r.data.items || r.data; setTournaments(rows); if (rows[0]) setF((x) => ({ ...x, tournament_slug: rows[0].slug })); }).catch(() => {}); }, []);
  const submit = async (e) => { e.preventDefault(); setBusy(true); try { await api.post("/public/access-requests", f); setDone(true); } catch (err) { toast.error(apiError(err)); } finally { setBusy(false); } };
  if (done) return <Shell kicker="Area Società" title="Richiesta inviata" subtitle="L'organizzazione valuterà la richiesta e ti contatterà con le credenziali di accesso."><div className="flex items-center gap-3 text-sm" data-testid="request-access-done"><ShieldCheck className="h-6 w-6 text-fsl-success" /> Grazie {f.contact_name}: riceverai una comunicazione a {f.email}.</div><Link to="/" className="btn-ghost">Torna al portale</Link></Shell>;
  return (
    <Shell kicker="Area Società" title="Richiedi l'accesso per la tua società" subtitle="Compila il modulo: l'organizzazione approva la richiesta e crea l'account del responsabile.">
      <form onSubmit={submit} className="space-y-4" data-testid="request-access-form">
        <Field label="Torneo"><select className="fsl-input" value={f.tournament_slug} onChange={(e) => setF({ ...f, tournament_slug: e.target.value })} required data-testid="request-access-tournament">{tournaments.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}</select></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Nome società"><input className="fsl-input" value={f.club_name} onChange={(e) => setF({ ...f, club_name: e.target.value })} required data-testid="request-access-club" /></Field><Field label="Città"><input className="fsl-input" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} data-testid="request-access-city" /></Field></div>
        <div className="grid grid-cols-2 gap-3"><Field label="Referente"><input className="fsl-input" value={f.contact_name} onChange={(e) => setF({ ...f, contact_name: e.target.value })} required data-testid="request-access-contact" /></Field><Field label="Telefono"><input className="fsl-input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} data-testid="request-access-phone" /></Field></div>
        <Field label="Email"><input type="email" className="fsl-input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required data-testid="request-access-email" /></Field>
        <Field label="Note"><textarea className="fsl-input h-20 py-2" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} data-testid="request-access-note" /></Field>
        <label className="flex items-start gap-2 text-xs text-fsl-slate"><input type="checkbox" checked={f.privacy_accepted} onChange={(e) => setF({ ...f, privacy_accepted: e.target.checked })} required data-testid="request-access-privacy" /> Accetto l'informativa privacy.</label>
        <button className="btn-gold w-full" disabled={busy} data-testid="request-access-submit"><Send className="h-4 w-4" /> Invia richiesta</button>
      </form>
      <p className="text-xs text-fsl-slate">Hai già un codice invito? <Link to="/registrati-societa" className="text-fsl-gold" data-testid="request-access-to-register">Registrati qui</Link>.</p>
    </Shell>
  );
}
