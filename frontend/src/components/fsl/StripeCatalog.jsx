import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, CreditCard, ExternalLink, RefreshCw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const eur = (c) => `${(c / 100).toFixed(2).replace(".", ",")} €`;

export function StripeCatalog({ tid }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { setErr(null); api.get(`/tournaments/${tid}/stripe/catalog`).then((r) => setData(r.data)).catch((e) => { setErr(e); setData(null); }); }, [tid]);
  useEffect(() => { if (user?.is_super_admin) load(); }, [load, user]);
  if (!user?.is_super_admin) return null;
  const sync = async () => { setBusy(true); try { const r = await api.post(`/tournaments/${tid}/stripe/catalog/sync`); const n = r.data.results.filter((x) => x.action !== "ok").length; toast.success(n ? `Catalogo Stripe aggiornato: ${n} prezzi creati/aggiornati` : "Catalogo Stripe già corretto"); load(); } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); } };
  return (
    <section className="fsl-card p-5 space-y-4" data-testid="stripe-catalog">
      <div className="flex flex-wrap items-start gap-3">
        <span className="h-11 w-11 shrink-0 rounded-xl bg-fsl-gold/15 border border-fsl-gold/50 inline-flex items-center justify-center text-fsl-gold"><CreditCard className="h-5 w-5" /></span>
        <div className="flex-1 min-w-[240px]">
          <div className="font-display font-bold uppercase text-lg leading-none">Catalogo Stripe</div>
          <p className="mt-1 text-xs text-fsl-slate">I 3 prezzi fissi (video 0,99 €, foto 0,49 €, digitale 2,49 €) vengono cercati su Stripe tramite <em>lookup key</em>. Card Player ID e Pass notifiche usano un prezzo dinamico: nessun prodotto da creare, il valore arriva dalle Impostazioni torneo.</p>
        </div>
        {data && <span className={`h-8 px-3 rounded-full text-xs font-bold inline-flex items-center gap-1 ${data.mode === "live" ? "bg-fsl-success/15 border border-fsl-success/50 text-fsl-success" : "bg-fsl-warning/15 border border-fsl-warning/50 text-fsl-warning"}`} data-testid="stripe-mode">{data.mode === "live" ? "LIVE" : "TEST / sandbox"}{data.account_id ? ` · ${data.account_id}` : ""}</span>}
      </div>
      {err && <p className="text-sm text-fsl-danger flex items-center gap-2" data-testid="stripe-catalog-error"><XCircle className="h-4 w-4" /> {apiError(err)}</p>}
      {data && (
        <>
          <div className="divide-y divide-white/[0.06] rounded-xl border border-white/10 overflow-hidden" data-testid="stripe-catalog-items">
            {data.items.map((it) => (
              <div key={it.lookup_key} className="px-4 py-3 flex flex-wrap items-center gap-3 text-sm" data-testid={`stripe-item-${it.lookup_key}`}>
                {it.ok ? <CheckCircle2 className="h-5 w-5 text-fsl-success shrink-0" /> : it.found ? <AlertTriangle className="h-5 w-5 text-fsl-warning shrink-0" /> : <XCircle className="h-5 w-5 text-fsl-danger shrink-0" />}
                <div className="flex-1 min-w-[200px]"><div className="font-semibold">{it.product} <span className="text-fsl-slate font-normal">· {it.used_for}</span></div><div className="text-xs text-fsl-slate font-mono">{it.lookup_key}{it.price_id ? ` → ${it.price_id}` : ""}</div></div>
                <div className="num font-display font-extrabold text-lg">{eur(it.amount)}</div>
                <div className="text-xs w-40 text-right" data-testid={`stripe-item-state-${it.lookup_key}`}>{it.ok ? "Configurato" : it.found ? `Prezzo diverso su Stripe (${it.unit_amount != null ? eur(it.unit_amount) : "?"})` : "Mancante su Stripe"}</div>
              </div>
            ))}
            {data.dynamic.map((d) => <div key={d.setting} className="px-4 py-3 flex flex-wrap items-center gap-3 text-sm text-fsl-slate" data-testid={`stripe-dynamic-${d.setting}`}><CheckCircle2 className="h-5 w-5 text-fsl-success/60 shrink-0" /><div className="flex-1 min-w-[200px]"><div className="font-semibold text-fsl-white/80">{d.name}</div><div className="text-xs">Prezzo dinamico · impostazione <span className="font-mono">{d.setting}</span> (default {d.default.toFixed(2).replace(".", ",")} €)</div></div><div className="text-xs w-40 text-right">Nessuna azione</div></div>)}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn-gold h-10" disabled={busy} onClick={sync} data-testid="stripe-catalog-sync"><RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} /> {busy ? "Sincronizzo…" : data.all_ok ? "Verifica di nuovo" : "Crea/aggiorna catalogo Stripe"}</button>
            <button className="btn-ghost h-10" onClick={load} data-testid="stripe-catalog-reload">Ricarica stato</button>
            <a className="btn-ghost h-10" href={`https://dashboard.stripe.com/${data.mode === "live" ? "" : "test/"}products`} target="_blank" rel="noreferrer" data-testid="stripe-dashboard-link"><ExternalLink className="h-4 w-4" /> Apri Stripe</a>
            {!data.webhook_configured && <span className="text-xs text-fsl-warning">Webhook non configurato: i pagamenti vengono comunque confermati al ritorno dal checkout.</span>}
          </div>
          <details className="text-xs text-fsl-slate" data-testid="stripe-catalog-help">
            <summary className="cursor-pointer text-fsl-gold font-semibold">Istruzioni per il passaggio a LIVE (dopo il deploy)</summary>
            <ol className="mt-2 list-decimal pl-5 space-y-1">
              <li>Pannello Emergent → <b>Manage Publishes → Payments</b>: <i>Claim sandbox</i> (già fatto) → <i>Complete KYC</i> → <i>Install Emergent App</i>. Le chiavi live vengono iniettate in produzione automaticamente.</li>
              <li>Dopo il redeploy, torna qui: il badge deve indicare <b>LIVE</b>.</li>
              <li>Clicca <b>«Crea/aggiorna catalogo Stripe»</b>: crea i 3 prodotti/prezzi con lookup key e codice fiscale <span className="font-mono">txcd_10302000</span> (contenuti digitali, IVA inclusa nel prezzo).</li>
              <li>Fai un acquisto reale di prova (foto 0,49 €) e verifica in Stripe e in questa pagina «Vendite»; rimborsa da Stripe se vuoi.</li>
            </ol>
          </details>
        </>
      )}
    </section>
  );
}
