import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Copy, Pencil, Plus, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader, SectionTitle } from "@/components/fsl/Primitives";
import { ErrorState, LoadingState } from "@/components/fsl/States";
import { useTournamentDetail } from "@/hooks/useTournamentData";
import { useTournaments } from "@/context/TournamentContext";
import { api, apiError } from "@/lib/api";

const eur = (v) => `${Number(v || 0).toFixed(2).replace(".", ",")} €`;
const TYPE = { photo: "Foto", video: "Video", digital_album: "Album digitale", digital_card: "Cartolina digitale", bundle: "Pacchetto", service: "Servizio", custom: "Personalizzato" };

function StripeBanner({ st }) {
  const live = st.mode === "live";
  const ready = live ? st.live_ready : true;
  return (
    <section className={`fsl-card p-4 border ${live ? (ready ? "border-fsl-success/50" : "border-fsl-danger/50") : "border-fsl-warning/50"}`} data-testid="monetization-stripe">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`h-9 px-3 rounded-full font-display font-extrabold uppercase inline-flex items-center gap-2 ${live ? "bg-fsl-success text-ink-950" : "bg-fsl-warning text-ink-950"}`} data-testid="monetization-stripe-mode">{live ? "Stripe: LIVE MODE" : "Stripe: TEST MODE"}</span>
        <span className="text-sm">{st.configured ? "Collegato" : "Non configurato"} · account <span className="num text-xs">{st.account_id}</span>{st.type ? ` · ${st.type}` : ""}</span>
        <span className="ml-auto text-xs text-fsl-slate">Webhook {st.webhook_configured ? "✓ firmato" : "✗ assente"} · Connect: no</span>
      </div>
      <div className="mt-3 grid sm:grid-cols-4 gap-2 text-xs">
        {[["Incassi (charges)", st.charges_enabled], ["Payout", st.payouts_enabled], ["Dati inviati (KYC)", st.details_submitted]].map(([l, v]) => <div key={l} className={`rounded-md px-3 py-2 border ${v ? "border-fsl-success/40 text-fsl-success" : "border-fsl-danger/40 text-fsl-danger"}`}>{v ? <CheckCircle2 className="inline h-3.5 w-3.5 mr-1" /> : <ShieldAlert className="inline h-3.5 w-3.5 mr-1" />}{l}: {v ? "attivo" : "non attivo"}</div>)}
        <div className="rounded-md px-3 py-2 border border-white/15 text-fsl-slate">Requisiti KYC: {st.requirements ? (Object.values(st.requirements).flat().length || "nessuno segnalato") : "—"}</div>
      </div>
      {!live && <p className="mt-2 text-xs text-fsl-warning inline-flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Sandbox di test: i pagamenti non sono reali. Per il LIVE: Manage → Payments su Emergent → «Claim sandbox» e verifica identità su Stripe; le chiavi LIVE arrivano automaticamente.</p>}
    </section>
  );
}

function ProductDialog({ tid, p, onClose, onDone, types }) {
  const [f, setF] = useState(p ? { name: p.name, description: p.description, amount: p.amount, product_type: p.product_type, active: p.active } : { name: "", description: "", amount: "", product_type: "custom", delivery: "payment", active: true });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const body = { ...f, amount: Number(String(f.amount).replace(",", ".")) };
      const { data } = p ? await api.patch(`/tournaments/${tid}/monetization/products/${p.id}`, body) : await api.post(`/tournaments/${tid}/monetization/products`, body);
      if (data.sync_status === "error") toast.error(`Errore sincronizzazione Stripe: ${data.sync_error}`); else toast.success(p ? (Number(body.amount) !== p.amount ? "Prezzo aggiornato: creato un nuovo Stripe Price, il precedente è stato disattivato" : "Prodotto aggiornato") : "Prodotto creato e sincronizzato con Stripe");
      onDone(); onClose();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  const std = p && !p.key.startsWith("custom:");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-navy-800 border-white/20 text-fsl-white rounded-xl" aria-describedby={undefined} data-testid="product-dialog">
        <DialogHeader><DialogTitle className="font-display uppercase text-2xl">{p ? `Modifica · ${p.name}` : "Nuovo prodotto"}</DialogTitle></DialogHeader>
        <div className="grid gap-3 text-sm">
          <label><span className="fsl-label">Nome</span><input className="fsl-input mt-1" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="product-name" /></label>
          <label><span className="fsl-label">Descrizione</span><input className="fsl-input mt-1" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} data-testid="product-description" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label><span className="fsl-label">Prezzo (€)</span><input type="number" step="0.01" min="0.01" className="fsl-input mt-1 num" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} data-testid="product-amount" /></label>
            <label><span className="fsl-label">Tipo</span><select className="fsl-input mt-1" value={f.product_type} disabled={std} onChange={(e) => setF({ ...f, product_type: e.target.value })} data-testid="product-type">{types.map((t) => <option key={t} value={t}>{TYPE[t] || t}</option>)}</select></label>
          </div>
          {!p && <label><span className="fsl-label">Consegna</span><select className="fsl-input mt-1" value={f.delivery} onChange={(e) => setF({ ...f, delivery: e.target.value })} data-testid="product-delivery"><option value="payment">Solo pagamento (iscrizioni, servizi)</option><option value="voucher">Voucher con codice da riscattare</option></select></label>}
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={!!f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} data-testid="product-active" /> Attivo (acquistabile)</label>
          {p && p.amount !== Number(f.amount) && <p className="text-xs text-fsl-gold">Il cambio prezzo crea un nuovo Stripe Price: gli ordini già effettuati conservano l'importo pagato.</p>}
        </div>
        <DialogFooter><button className="btn-ghost" onClick={onClose}>Annulla</button><button className="btn-primary" disabled={busy || !f.name || !Number(String(f.amount).replace(",", "."))} onClick={save} data-testid="product-save">Salva</button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Monetization() {
  const { data: t } = useTournamentDetail();
  const { tournaments } = useTournaments();
  const [d, setD] = useState(null);
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState(null);
  const [dlg, setDlg] = useState(null);
  const [copyFrom, setCopyFrom] = useState("");
  const tid = t?.id;
  const load = useCallback(() => { if (!tid) return; api.get(`/tournaments/${tid}/monetization`).then((r) => setD(r.data)).catch(setError); api.get(`/tournaments/${tid}/monetization/orders`).then((r) => setOrders(r.data)).catch(() => {}); }, [tid]);
  useEffect(() => { load(); }, [load]);
  if (error) return <ErrorState message={apiError(error)} onRetry={load} />;
  if (!t || !d) return <LoadingState />;
  const canWrite = ["super_admin", "director"].includes(t.my_role) && !t.read_only;
  const sync = async () => { try { const { data } = await api.post(`/tournaments/${tid}/monetization/sync`); toast.success(`${data.synced} prodotti sincronizzati`); data.errors.forEach((e) => toast.error(`${e.name}: ${e.error}`)); load(); } catch (e) { toast.error(apiError(e)); } };
  const copy = async () => { if (!copyFrom) return; try { const { data } = await api.post(`/tournaments/${tid}/monetization/copy`, { source_tournament_id: copyFrom }); toast.success(`${data.copied} prodotti/prezzi copiati (configurazione indipendente)`); load(); } catch (e) { toast.error(apiError(e)); } };
  const STATUS = { paid: ["Pagato", "text-fsl-success"], pending: ["In attesa", "text-fsl-warning"], failed: ["Fallito", "text-fsl-danger"], refunded: ["Rimborsato", "text-fsl-slate"], expired: ["Scaduto", "text-fsl-slate"] };
  return (
    <div className="space-y-6" data-testid="monetization-page">
      <PageHeader kicker="Prodotti e prezzi di questo torneo" title="Monetizzazione" subtitle="Catalogo indipendente per torneo: ogni prodotto è sincronizzato con Stripe (Product + Price). Il cambio prezzo crea un nuovo Price e conserva lo storico degli ordini."
        actions={canWrite && <div className="flex flex-wrap gap-2"><button className="btn-ghost" onClick={sync} data-testid="monetization-sync"><RefreshCw className="h-4 w-4" /> Sincronizza Stripe</button><button className="btn-gold" onClick={() => setDlg("new")} data-testid="monetization-new-product"><Plus className="h-4 w-4" /> Nuovo prodotto</button></div>} />
      <StripeBanner st={d.stripe} />
      <section className="fsl-card overflow-x-auto">
        <table className="w-full table-dark" data-testid="monetization-products">
          <thead><tr><th>Prodotto</th><th>Tipo</th><th className="text-right">Prezzo</th><th>Stato</th><th>Stripe</th><th className="text-right">Incassato</th>{canWrite && <th className="text-right">Azioni</th>}</tr></thead>
          <tbody>
            {d.products.map((p) => (
              <tr key={p.id} data-testid={`product-row-${p.key.replace(":", "-")}`}>
                <td><div className="font-semibold">{p.name}</div>{p.description && <div className="text-xs text-fsl-slate truncate max-w-xs">{p.description}</div>}</td>
                <td className="text-xs">{TYPE[p.product_type] || p.product_type}</td>
                <td className="num text-right font-bold" data-testid={`product-price-${p.key.replace(":", "-")}`}>{eur(p.amount)}</td>
                <td><span className={`h-7 px-2 rounded-full border text-[11px] font-bold inline-flex items-center ${p.active ? "border-fsl-success/50 text-fsl-success" : "border-white/20 text-fsl-slate"}`}>{p.active ? "Attivo" : "Non attivo"}</span></td>
                <td className="text-xs" title={`${p.stripe_product_id || "—"} · ${p.stripe_price_id || "—"}`}>{p.sync_status === "synced" ? <span className="text-fsl-success inline-flex items-center gap-1" data-testid={`product-sync-${p.key.replace(":", "-")}`}><CheckCircle2 className="h-3.5 w-3.5" /> sincronizzato</span> : p.sync_status === "error" ? <span className="text-fsl-danger inline-flex items-center gap-1" title={p.sync_error}><AlertTriangle className="h-3.5 w-3.5" /> errore</span> : <span className="text-fsl-warning">da sincronizzare</span>}<div className="num text-[10px] text-fsl-slate">{p.stripe_price_id || ""}</div></td>
                <td className="num text-right">{eur(p.revenue)}</td>
                {canWrite && <td className="text-right"><button className="btn-ghost h-8 text-xs" onClick={() => setDlg(p)} data-testid={`product-edit-${p.key.replace(":", "-")}`}><Pencil className="h-3.5 w-3.5" /> Modifica</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {canWrite && (
        <section className="fsl-card p-4 flex flex-wrap items-center gap-2" data-testid="monetization-copy">
          <Copy className="h-4 w-4 text-fsl-gold" /><span className="text-sm">Copia prodotti e prezzi da un altro torneo:</span>
          <select className="fsl-input h-10 w-64" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} data-testid="monetization-copy-source"><option value="">Scegli torneo…</option>{tournaments.filter((x) => x.id !== tid).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          <button className="btn-ghost" disabled={!copyFrom} onClick={copy} data-testid="monetization-copy-button">Copia</button>
          <span className="text-xs text-fsl-slate">Crea una configurazione indipendente: le modifiche successive non si propagano.</span>
        </section>
      )}
      <section>
        <SectionTitle>Ordini ({orders.length})</SectionTitle>
        <div className="fsl-card overflow-x-auto"><table className="w-full table-dark text-sm" data-testid="monetization-orders"><thead><tr><th>Data</th><th>Prodotto (snapshot)</th><th className="text-right">Pagato</th><th>Stato</th><th>Acquirente</th><th>Stripe</th></tr></thead><tbody>
          {orders.slice(0, 100).map((o) => <tr key={o.id}><td className="num text-xs text-fsl-slate whitespace-nowrap">{String(o.created_at).slice(0, 16).replace("T", " ")}</td><td>{o.product_name_snapshot || o.lookup_key}</td><td className="num text-right">{eur(o.amount)}</td><td className={`text-xs font-bold ${STATUS[o.payment_status]?.[1] || ""}`}>{STATUS[o.payment_status]?.[0] || o.payment_status}</td><td className="text-xs">{o.buyer_email || "ospite"}</td><td className="num text-[10px] text-fsl-slate">{o.stripe_payment_intent_id || o.session_id?.slice(0, 18)}</td></tr>)}
          {orders.length === 0 && <tr><td colSpan={6} className="text-center text-fsl-slate py-6">Nessun ordine ancora.</td></tr>}
        </tbody></table></div>
      </section>
      {dlg && <ProductDialog tid={tid} p={dlg === "new" ? null : dlg} types={d.types} onClose={() => setDlg(null)} onDone={load} />}
    </div>
  );
}
