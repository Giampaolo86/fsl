import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, KeyRound, Lock, RefreshCw, ShieldAlert, ShieldCheck, UserX, XCircle } from "lucide-react";
import { KpiTile, PageHeader, SectionTitle } from "@/components/fsl/Primitives";
import { ErrorState, LoadingState } from "@/components/fsl/States";
import { api, apiError } from "@/lib/api";

const KIND = { login_ok: "Login riuscito", login_fail: "Password errata", lockout: "Blocco per troppi tentativi", disabled_login: "Login da account disabilitato", admin_denied: "Accesso admin negato", forbidden: "Permesso negato", media_denied: "File riservato negato", rate_limited: "Richieste limitate", impersonate: "Entra come", mfa_disabled: "MFA disattivata", logout_all: "Sessioni revocate", refresh_reuse: "Riutilizzo sessione ruotata", user_deleted: "Utente eliminato", role_change: "Modifica permessi", tournament_purged: "Dati torneo eliminati", api_key_invalid: "Chiave API non valida", cors_denied: "Origine non autorizzata" };
const SEV = { high: "bg-fsl-danger text-fsl-white", medium: "bg-fsl-warning text-ink-950", low: "bg-white/10 text-fsl-slate" };
const fmt = (iso) => new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function Events({ rows, testId }) {
  if (!rows.length) return <p className="text-sm text-fsl-slate">Nessun evento.</p>;
  return (
    <div className="divide-y divide-white/[0.06] text-sm" data-testid={testId}>
      {rows.map((e, i) => (
        <div key={i} className="min-h-[40px] py-1.5 flex flex-wrap items-center gap-x-3 gap-y-1" data-testid={`${testId}-row`}>
          <span className={`h-5 px-2 rounded text-[10px] font-bold uppercase inline-flex items-center ${SEV[e.severity] || SEV.low}`}>{e.severity}</span>
          <span className="font-semibold">{KIND[e.kind] || e.kind}</span>
          <span className="text-xs text-fsl-slate truncate">{e.email || e.user_id || "anonimo"}{e.ip ? ` · ${e.ip}` : ""}{e.path ? ` · ${e.path}` : ""}{e.detail && Object.keys(e.detail).length ? ` · ${Object.entries(e.detail).slice(0, 2).map(([k, v]) => `${k}=${v}`).join(" ")}` : ""}</span>
          <span className="ml-auto text-xs text-fsl-slate num">{fmt(e.ts)}</span>
        </div>
      ))}
    </div>
  );
}

export default function Security() {
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => api.get("/security/summary").then((r) => setD(r.data)).catch((e) => setError(apiError(e))), []);
  useEffect(() => { load(); const id = setInterval(load, 60000); return () => clearInterval(id); }, [load]);
  if (error) return <ErrorState message={error} />;
  if (!d) return <LoadingState />;
  const w = d.week;
  const cfg = [
    ["Rate limiting attivo", d.config.rate_limiting, "Limite richieste per IP su login, registrazione, API pubbliche"],
    ["File riservati protetti", d.config.media_private_check, "Documenti e originali in vendita richiedono login e autorizzazione"],
    ["Webhook Stripe firmato", d.config.stripe_webhook_secret, "STRIPE_WEBHOOK_SECRET configurato"],
    ["Chiave sessioni robusta", d.config.jwt_secret_strong, "JWT_SECRET di almeno 32 caratteri"],
    ["Origini web esplicite (CORS)", d.config.cors_explicit, d.config.cors_explicit ? "CORS_ORIGINS impostato" : "Non impostato: ammessi solo i domini della piattaforma e localhost"],
    ["MFA su tutti gli amministratori", d.config.mfa_admins_without.length === 0, d.config.mfa_admins_without.length ? `Senza MFA: ${d.config.mfa_admins_without.join(", ")}` : "Tutti gli admin/direttori hanno la MFA"],
  ];
  return (
    <div className="space-y-8" data-testid="security-page">
      <PageHeader kicker="Riservato al Super Admin" title="Sicurezza" subtitle={`Eventi di sicurezza degli ultimi 7 giorni e stato delle protezioni. Nessuna password, token o codice MFA viene registrato; conservazione ${d.retention_days} giorni.`} actions={<button className="btn-ghost h-10" onClick={load} data-testid="security-refresh"><RefreshCw className="h-4 w-4" /> Aggiorna</button>} />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiTile icon={ShieldCheck} value={w.login_ok} label="Login riusciti" testId="sec-login-ok" />
        <KpiTile icon={XCircle} value={w.login_fail} label="Password errate" hint={`${w.lockouts} blocchi`} testId="sec-login-fail" />
        <KpiTile icon={ShieldAlert} value={w.admin_denied + w.forbidden} label="Accessi negati" hint={`${w.admin_denied} su aree admin`} gold={w.admin_denied > 0} testId="sec-denied" />
        <KpiTile icon={Lock} value={w.rate_limited + w.media_denied} label="Bloccati" hint={`${w.rate_limited} limitati · ${w.media_denied} file riservati`} testId="sec-blocked" />
        <KpiTile icon={UserX} value={d.disabled_accounts} label="Account disabilitati" hint={`${w.impersonations} «Entra come» · ${w.refresh_reuse} riusi sessione`} testId="sec-disabled" />
      </div>
      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4">
        <div className="fsl-card p-5" data-testid="security-high">
          <SectionTitle>Eventi ad alta gravità</SectionTitle>
          <Events rows={d.high} testId="security-high-events" />
        </div>
        <div className="space-y-4">
          <div className="fsl-card p-5" data-testid="security-config">
            <SectionTitle>Stato protezioni</SectionTitle>
            <div className="space-y-2 text-sm">{cfg.map(([l, ok, hint]) => <div key={l} className="flex items-start gap-2" data-testid={`security-config-${l.split(" ")[0].toLowerCase()}`}>{ok ? <CheckCircle2 className="h-4 w-4 text-fsl-success mt-0.5 shrink-0" /> : <AlertTriangle className="h-4 w-4 text-fsl-warning mt-0.5 shrink-0" />}<div><div className="font-semibold">{l}</div><div className="text-xs text-fsl-slate">{hint}</div></div></div>)}</div>
          </div>
          <div className="fsl-card p-5" data-testid="security-admins">
            <SectionTitle>Account privilegiati</SectionTitle>
            <div className="space-y-1.5 text-sm">{d.admins.map((a) => <div key={a.id} className="flex items-center gap-2" data-testid={`security-admin-${a.id}`}><KeyRound className="h-3.5 w-3.5 text-fsl-gold" /><span className="truncate flex-1">{a.email}</span><span className="text-xs text-fsl-slate">{a.is_super_admin ? "Super Admin" : "Direttore"}</span><span className={`h-5 px-2 rounded text-[10px] font-bold uppercase ${a.mfa_enabled ? "bg-fsl-success text-ink-950" : "bg-fsl-danger text-fsl-white"}`}>{a.mfa_enabled ? "MFA" : "no MFA"}</span>{a.status !== "active" && <span className="text-[10px] uppercase text-fsl-slate">{a.status}</span>}</div>)}</div>
          </div>
        </div>
      </div>
      <div className="fsl-card p-5" data-testid="security-recent">
        <SectionTitle>Ultimi eventi</SectionTitle>
        <Events rows={d.recent} testId="security-recent-events" />
      </div>
    </div>
  );
}
