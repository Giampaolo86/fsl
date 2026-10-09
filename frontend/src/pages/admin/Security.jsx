import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Crown, KeyRound, Lock, RefreshCw, ShieldAlert, ShieldCheck, UserX, XCircle } from "lucide-react";
import { KpiTile, PageHeader, SectionTitle } from "@/components/fsl/Primitives";
import { ErrorState, LoadingState } from "@/components/fsl/States";
import { api, apiError } from "@/lib/api";

const KIND = { mfa_required: "Operazione admin bloccata: MFA mancante", reauth_failed: "Conferma identità fallita", payment_oversold: "Pagamento oltre lo stock", webhook_bad_signature: "Webhook Stripe firma non valida", webhook_unconfigured: "Webhook Stripe non configurato", purge_blocked: "Pulizia dati bloccata", login_ok: "Login riuscito", login_fail: "Password errata", lockout: "Blocco per troppi tentativi", disabled_login: "Login da account disabilitato", admin_denied: "Accesso admin negato", forbidden: "Permesso negato", media_denied: "File riservato negato", rate_limited: "Richieste limitate", impersonate: "Entra come", mfa_disabled: "MFA disattivata", logout_all: "Sessioni revocate", refresh_reuse: "Riutilizzo sessione ruotata", user_deleted: "Utente eliminato", role_change: "Modifica permessi", tournament_purged: "Dati torneo eliminati", api_key_invalid: "Chiave API non valida", cors_denied: "Origine non autorizzata" };
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
  const STATE = {
    verified: ["Verificato", "bg-fsl-success text-ink-950", CheckCircle2, "text-fsl-success"],
    active: ["Attivo", "bg-fsl-success/30 text-fsl-success", ShieldCheck, "text-fsl-success"],
    configured: ["Configurato", "bg-white/10 text-fsl-slate", Lock, "text-fsl-slate"],
    error: ["Errore", "bg-fsl-danger text-fsl-white", XCircle, "text-fsl-danger"],
    unverifiable: ["Non verificabile", "bg-fsl-warning text-ink-950", AlertTriangle, "text-fsl-warning"],
  };
  const prots = d.protections || [];
  const errors = prots.filter((p) => p.state === "error").length;
  return (
    <div className="space-y-8" data-testid="security-page">
      <PageHeader kicker={`Riservato al Super Admin · ambiente ${d.environment}`} title="Sicurezza" subtitle={`Eventi di sicurezza degli ultimi 7 giorni e stato reale delle protezioni (verificate a ogni apertura). Nessuna password, token o codice MFA viene registrato; conservazione ${d.retention_days} giorni.`} actions={<button className="btn-ghost h-10" onClick={load} data-testid="security-refresh"><RefreshCw className="h-4 w-4" /> Aggiorna</button>} />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiTile icon={ShieldCheck} value={w.login_ok} label="Login riusciti" testId="sec-login-ok" />
        <KpiTile icon={XCircle} value={w.login_fail} label="Password errate" hint={`${w.lockouts} blocchi`} testId="sec-login-fail" />
        <KpiTile icon={ShieldAlert} value={w.admin_denied + w.forbidden} label="Accessi negati" hint={`${w.admin_denied} su aree admin · ${w.mfa_required_blocks || 0} senza MFA`} gold={w.admin_denied > 0} testId="sec-denied" />
        <KpiTile icon={Lock} value={w.rate_limited + w.media_denied} label="Bloccati" hint={`${w.rate_limited} limitati · ${w.media_denied} file riservati`} testId="sec-blocked" />
        <KpiTile icon={UserX} value={w.sessions_revoked + w.refresh_reuse} label="Sessioni revocate" hint={`${w.refresh_reuse} riusi token · ${w.impersonations} «Entra come» · ${d.disabled_accounts} account disabilitati`} gold={w.refresh_reuse > 0} testId="sec-disabled" />
      </div>
      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4">
        <div className="space-y-4">
          <div className="fsl-card p-5" data-testid="security-config">
            <SectionTitle>Stato protezioni {errors > 0 && <span className="ml-2 h-5 px-2 rounded text-[10px] font-bold uppercase bg-fsl-danger text-fsl-white inline-flex items-center" data-testid="security-config-errors">{errors} da sistemare</span>}</SectionTitle>
            <div className="space-y-2.5 text-sm">
              {prots.map((p) => { const [label, cls, Icon, iconCls] = STATE[p.state] || STATE.unverifiable; return (
                <div key={p.key} className="flex items-start gap-2" data-testid={`security-config-${p.key}`} data-state={p.state}>
                  <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${iconCls}`} />
                  <div className="min-w-0 flex-1"><div className="font-semibold flex items-center gap-2 flex-wrap">{p.label}<span className={`h-4 px-1.5 rounded text-[9px] font-bold uppercase inline-flex items-center ${cls}`}>{label}</span></div><div className="text-xs text-fsl-slate break-words">{p.detail}</div></div>
                </div>
              ); })}
            </div>
          </div>
          <div className="fsl-card p-5" data-testid="security-high">
            <SectionTitle>Eventi ad alta gravità</SectionTitle>
            <Events rows={d.high} testId="security-high-events" />
          </div>
        </div>
        <div className="space-y-4">
          <div className="fsl-card p-5" data-testid="security-admins">
            <SectionTitle>Account privilegiati</SectionTitle>
            <div className="space-y-1.5 text-sm">{d.admins.map((a) => <div key={a.id} className="flex items-center gap-2" data-testid={`security-admin-${a.id}`}><KeyRound className="h-3.5 w-3.5 text-fsl-gold" /><span className="truncate flex-1">{a.email}</span><span className={`text-xs ${a.is_owner ? "text-fsl-gold font-bold uppercase inline-flex items-center gap-1" : "text-fsl-slate"}`}>{a.is_owner ? <><Crown className="h-3 w-3" /> Owner</> : a.is_super_admin ? "Super Admin" : "Direttore"}</span><span className={`h-5 px-2 rounded text-[10px] font-bold uppercase ${a.mfa_enabled ? "bg-fsl-success text-ink-950" : "bg-fsl-danger text-fsl-white"}`}>{a.mfa_enabled ? "MFA" : "no MFA"}</span>{a.status !== "active" && <span className="text-[10px] uppercase text-fsl-slate">{a.status}</span>}</div>)}</div>
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
