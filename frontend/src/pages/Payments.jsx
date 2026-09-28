import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, Download, Loader2, XCircle } from "lucide-react";
import { Logo } from "@/components/fsl/Logo";
import { api, apiError } from "@/lib/api";
import { mediaUrl } from "@/lib/upload";
import { StripeCatalog } from "@/components/fsl/StripeCatalog";

const Shell = ({ children }) => <div className="min-h-screen bg-navy-900 text-fsl-white flex items-center justify-center p-6"><div className="fsl-card max-w-md w-full p-8 text-center space-y-4 animate-rise" data-testid="payment-page"><div className="flex justify-center"><Logo /></div>{children}</div></div>;

export function PaymentSuccess() {
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");
  const [state, setState] = useState({ status: "polling", tries: 0 });
  useEffect(() => {
    if (!sessionId) return undefined;
    let tries = 0;
    const tick = async () => {
      try {
        const r = await api.get(`/payments/status/${sessionId}`);
        if (r.data.payment_status === "paid") { setState({ status: "paid", ...r.data }); return; }
        if (["expired", "failed"].includes(r.data.payment_status)) { setState({ status: "failed" }); return; }
      } catch (e) { setState({ status: "error", message: apiError(e) }); return; }
      tries += 1;
      if (tries >= 10) { setState({ status: "timeout" }); return; }
      setTimeout(tick, 2000);
    };
    tick();
    return undefined;
  }, [sessionId]);
  return (
    <Shell>
      {state.status === "polling" && <><Loader2 className="h-10 w-10 mx-auto animate-spin text-fsl-gold" /><h1 className="text-3xl font-extrabold">Verifica del pagamento…</h1><p className="text-sm text-fsl-slate">Attendi qualche secondo, stiamo confermando la transazione con Stripe.</p></>}
      {state.status === "paid" && state.items?.length > 1 && <><CheckCircle2 className="h-12 w-12 mx-auto text-fsl-success" /><h1 className="text-3xl font-extrabold" data-testid="payment-success-title">Pagamento riuscito</h1><p className="text-sm text-fsl-slate">{state.items.length} contenuti · {Number(state.total).toFixed(2).replace(".", ",")} €. Conserva questi link: sono riservati al tuo acquisto.</p><div className="space-y-2 text-left" data-testid="payment-items">{state.items.map((it) => <div key={it.purchase_id} className="rounded-xl border border-white/10 bg-ink-950/60 px-4 py-3 flex items-center gap-3"><span className="flex-1 text-sm font-semibold truncate">{it.title}</span>{it.download_url ? <a className="btn-gold h-9" href={mediaUrl(it.download_url)} data-testid={`payment-download-${it.purchase_id}`}>Scarica</a> : it.open_url ? <Link className="btn-gold h-9" to={it.open_url} data-testid={`payment-open-${it.purchase_id}`}>Apri</Link> : null}</div>)}</div></>}
      {state.status === "paid" && !(state.items?.length > 1) && <><CheckCircle2 className="h-12 w-12 mx-auto text-fsl-success" /><h1 className="text-3xl font-extrabold" data-testid="payment-success-title">Pagamento riuscito</h1>{state.open_url ? <><p className="text-sm text-fsl-slate">{state.title} · pronto! Conserva questo link: è riservato al tuo acquisto e resta sempre aggiornato.</p><Link className="btn-gold w-full" to={state.open_url} data-testid="payment-open-product"><Download className="h-4 w-4" /> Apri {state.kind === "album" ? "l'album" : state.kind === "push_pass" ? "le notifiche" : state.kind === "custom" ? "la ricevuta" : state.kind?.startsWith("player_card") ? "la card Player ID" : "la cartolina squadra"}</Link></> : <><p className="text-sm text-fsl-slate">{state.title} · il file originale è pronto. Conserva questo link: è riservato al tuo acquisto.</p><a className="btn-gold w-full" href={mediaUrl(state.download_url)} data-testid="payment-download"><Download className="h-4 w-4" /> Scarica {state.kind === "video" ? "il video" : "la foto"}</a></>}</>}
      {state.status === "failed" && <><XCircle className="h-12 w-12 mx-auto text-fsl-danger" /><h1 className="text-3xl font-extrabold">Pagamento non completato</h1></>}
      {state.status === "timeout" && <><Loader2 className="h-10 w-10 mx-auto text-fsl-warning" /><h1 className="text-3xl font-extrabold">Conferma in ritardo</h1><p className="text-sm text-fsl-slate">Il pagamento è in elaborazione: ricarica questa pagina tra poco.</p></>}
      {state.status === "error" && <><XCircle className="h-12 w-12 mx-auto text-fsl-danger" /><p className="text-sm text-fsl-danger">{state.message}</p></>}
      <Link to="/" className="text-xs text-fsl-gold hover:underline" data-testid="payment-home">Torna al portale</Link>
    </Shell>
  );
}

export function PaymentCancel() {
  return <Shell><XCircle className="h-12 w-12 mx-auto text-fsl-warning" /><h1 className="text-3xl font-extrabold" data-testid="payment-cancel-title">Acquisto annullato</h1><p className="text-sm text-fsl-slate">Nessun addebito effettuato. Puoi riprovare dal Match Center.</p><Link to="/" className="text-xs text-fsl-gold hover:underline">Torna al portale</Link></Shell>;
}

export function Sales() {
  const tid = window.location.pathname.split("/")[3];
  const [data, setData] = useState(null);
  useEffect(() => { api.get(`/tournaments/${tid}/shop/sales`).then((r) => setData(r.data)).catch(() => setData({ count: 0, revenue: 0, videos: 0, photos: 0, items: 0, sales: [] })); }, [tid]);
  if (!data) return null;
  return (
    <div className="space-y-6" data-testid="sales-page">
      <div><div className="fsl-kicker mb-1">Media a pagamento</div><h1 className="text-4xl sm:text-5xl font-extrabold leading-[0.95]">Vendite</h1><p className="mt-2 text-sm text-fsl-slate">Foto professionali 0,49 € e video 0,99 € acquistati dalle famiglie nel Match Center. Incassi via Stripe.</p></div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[["Incasso", `${data.revenue.toFixed(2).replace(".", ",")} €`], ["Vendite", data.count], ["Foto vendute", data.photos], ["Video venduti", data.videos]].map(([l, v]) => <div key={l} className="fsl-card p-4"><div className="font-display font-extrabold text-3xl num">{v}</div><div className="text-[11px] uppercase tracking-wider text-fsl-slate">{l}</div></div>)}</div>
      <div className="fsl-card overflow-x-auto"><table className="w-full table-dark" data-testid="sales-table"><thead><tr><th>Data</th><th>Contenuto</th><th>Gara</th><th>Acquirente</th><th className="text-right">Importo</th></tr></thead><tbody>{data.sales.length === 0 ? <tr><td colSpan={5} className="text-center text-fsl-slate py-6">Nessuna vendita ancora · {data.items} contenuti in catalogo</td></tr> : data.sales.map((s) => <tr key={s.id}><td className="num text-xs">{new Date(s.created_at).toLocaleString("it-IT")}</td><td>{s.title} <span className="text-xs text-fsl-slate uppercase">{s.kind}</span></td><td className="text-xs text-fsl-slate">{s.match}</td><td className="text-xs">{s.buyer_email || "—"}</td><td className="num text-right font-semibold">{s.amount.toFixed(2).replace(".", ",")} €</td></tr>)}</tbody></table></div>
      <StripeCatalog tid={tid} />
    </div>
  );
}
