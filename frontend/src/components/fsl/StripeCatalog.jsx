import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CreditCard, ExternalLink, Settings2, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { api, apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const eur = (n) => `${Number(n).toFixed(2).replace(".", ",")} €`;

export function StripeCatalog({ tid }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const load = useCallback(() => { setErr(null); api.get(`/tournaments/${tid}/stripe/catalog`).then((r) => setData(r.data)).catch((e) => { setErr(e); setData(null); }); }, [tid]);
  useEffect(() => { if (user?.is_super_admin) load(); }, [load, user]);
  if (!user?.is_super_admin) return null;
  const live = data?.mode === "live";
  const ready = data?.configured && data?.charges_enabled;
  return (
    <section className="fsl-card p-5 space-y-4" data-testid="stripe-catalog">
      <div className="flex flex-wrap items-start gap-3">
        <span className="h-11 w-11 shrink-0 rounded-xl bg-fsl-gold/15 border border-fsl-gold/50 inline-flex items-center justify-center text-fsl-gold"><CreditCard className="h-5 w-5" /></span>
        <div className="flex-1 min-w-[240px]">
          <div className="font-display font-bold uppercase text-lg leading-none">Stripe e listino prezzi</div>
          <p className="mt-1 text-xs text-fsl-slate">Tutti i prezzi vengono decisi qui in Control Room (Impostazioni torneo → Prezzi) e inviati a Stripe al momento del pagamento: nessun prodotto da creare o aggiornare su Stripe. IVA gestita da Stripe con codice <span className="font-mono">{data?.tax_code || "txcd_10302000"}</span>.</p>
        </div>
        {data && <span className={`h-8 px-3 rounded-full text-xs font-bold inline-flex items-center gap-1 ${live ? "bg-fsl-success/15 border border-fsl-success/50 text-fsl-success" : "bg-fsl-warning/15 border border-fsl-warning/50 text-fsl-warning"}`} data-testid="stripe-mode">{live ? "LIVE" : "TEST / sandbox"}{data.account_id ? ` · ${data.account_id}` : ""}</span>}
      </div>
      {err && <p className="text-sm text-fsl-danger flex items-center gap-2" data-testid="stripe-catalog-error"><XCircle className="h-4 w-4" /> {apiError(err)}</p>}
      {data && (
        <>
          <div className="grid sm:grid-cols-3 gap-2 text-xs" data-testid="stripe-account-status">
            <div className={`rounded-xl border px-3 py-2 ${data.charges_enabled ? "border-fsl-success/40" : "border-fsl-danger/40"}`}>{data.charges_enabled ? <CheckCircle2 className="inline h-4 w-4 text-fsl-success mr-1" /> : <XCircle className="inline h-4 w-4 text-fsl-danger mr-1" />}Incassi {data.charges_enabled ? "abilitati" : "non abilitati (completa il KYC)"}</div>
            <div className={`rounded-xl border px-3 py-2 ${data.payouts_enabled ? "border-fsl-success/40" : "border-fsl-warning/40"}`}>{data.payouts_enabled ? <CheckCircle2 className="inline h-4 w-4 text-fsl-success mr-1" /> : <XCircle className="inline h-4 w-4 text-fsl-warning mr-1" />}Versamenti sul conto {data.payouts_enabled ? "abilitati" : "in attesa (IBAN/verifica)"}</div>
            <div className="rounded-xl border border-white/10 px-3 py-2">{data.business_name || "Account"} · {(data.country || "").toUpperCase()} · {(data.default_currency || "eur").toUpperCase()}{data.webhook_configured ? " · webhook ok" : ""}</div>
          </div>
          <div className="divide-y divide-white/[0.06] rounded-xl border border-white/10 overflow-hidden" data-testid="stripe-catalog-items">
            {data.items.map((it) => (
              <div key={it.kind} className="px-4 py-3 flex flex-wrap items-center gap-3 text-sm" data-testid={`stripe-item-${it.kind}`}>
                <CheckCircle2 className={`h-5 w-5 shrink-0 ${it.price > 0 ? "text-fsl-success" : "text-fsl-danger"}`} />
                <div className="flex-1 min-w-[200px]"><div className="font-semibold">{it.label}</div><div className="text-xs text-fsl-slate">{it.where} · impostazione <span className="font-mono">{it.setting}</span></div></div>
                <div className="num font-display font-extrabold text-lg" data-testid={`stripe-item-price-${it.kind}`}>{eur(it.price)}</div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link to={`/admin/t/${tid}/impostazioni`} className="btn-gold h-10" data-testid="stripe-prices-settings-link"><Settings2 className="h-4 w-4" /> Modifica i prezzi</Link>
            <button className="btn-ghost h-10" onClick={load} data-testid="stripe-catalog-reload">Verifica connessione</button>
            <a className="btn-ghost h-10" href={`https://dashboard.stripe.com/${live ? "" : "test/"}payments`} target="_blank" rel="noreferrer" data-testid="stripe-dashboard-link"><ExternalLink className="h-4 w-4" /> Apri Stripe</a>
            {!ready && <span className="text-xs text-fsl-warning">Prima di vendere: completa il KYC su Stripe (Manage Publishes → Payments).</span>}
          </div>
          <details className="text-xs text-fsl-slate" data-testid="stripe-catalog-help">
            <summary className="cursor-pointer text-fsl-gold font-semibold">Come funziona (e cosa verificare prima di vendere)</summary>
            <ol className="mt-2 list-decimal pl-5 space-y-1">
              <li>Il badge deve indicare <b>LIVE</b> e «Incassi abilitati». Se non lo è: Manage Publishes → Payments → Complete KYC → Install Emergent App.</li>
              <li>Cambia un prezzo in <b>Impostazioni → Prezzi</b>: vale subito per i nuovi acquisti di questo torneo (anche per i contenuti già in vendita).</li>
              <li>Fai un acquisto reale di prova (foto della gara) con una carta vera: deve comparire in «Vendite» qui sotto e in Stripe → Pagamenti. Poi rimborsalo da Stripe.</li>
              <li>Su Stripe nel Catalogo non compaiono prodotti: è normale, ogni pagamento porta con sé nome e prezzo (li vedi nelle singole transazioni).</li>
            </ol>
          </details>
        </>
      )}
    </section>
  );
}
