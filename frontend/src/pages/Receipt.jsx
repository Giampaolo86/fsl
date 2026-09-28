import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { BadgeCheck, Download, Printer, Ticket, Wallet } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { mediaUrl } from "@/lib/upload";
import { ErrorState, LoadingState } from "@/components/fsl/States";

const eur = (n) => `${Number(n).toFixed(2).replace(".", ",")} €`;

export default function Receipt() {
  const { token } = useParams();
  const [r, setR] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { api.get(`/payments/receipt/${token}`).then((x) => setR(x.data)).catch(setErr); }, [token]);
  if (err) return <ErrorState message={apiError(err)} />;
  if (!r) return <LoadingState />;
  return (
    <div className="min-h-screen bg-ink-950 text-fsl-white">
      <div className="mx-auto max-w-[720px] px-6 py-12 space-y-6" data-testid="receipt-page">
        <div className="fsl-card-gold p-6 sm:p-8 relative overflow-hidden">
          <div className="absolute inset-0 grain opacity-30 pointer-events-none" />
          <div className="relative">
            <div className="fsl-kicker flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-fsl-success" /> Pagamento confermato · Ricevuta {r.receipt_no}</div>
            <h1 className="mt-2 font-display font-extrabold uppercase text-3xl sm:text-4xl leading-[0.95]" data-testid="receipt-title">{r.title}</h1>
            {r.tournament && <div className="text-sm text-fsl-slate mt-1">{r.tournament.name}</div>}
            {r.description && <p className="mt-4 text-sm text-fsl-white/80">{r.description}</p>}
            <div className="mt-5 flex flex-wrap gap-6 text-sm">
              <div><div className="fsl-label">Importo</div><div className="font-display font-extrabold text-2xl num">{eur(r.amount)}</div></div>
              <div><div className="fsl-label">Data</div><div className="num">{fmtDate(r.paid_at, { time: true })}</div></div>
              {r.buyer_email && <div><div className="fsl-label">Acquirente</div><div>{r.buyer_email}</div></div>}
            </div>
            {r.delivery === "voucher" && (
              <div className="mt-6 rounded-2xl border-2 border-dashed border-fsl-gold/60 bg-ink-950/60 p-5 text-center" data-testid="receipt-voucher">
                <div className="fsl-kicker flex items-center justify-center gap-2"><Ticket className="h-4 w-4 text-fsl-gold" /> Il tuo codice</div>
                <div className="mt-2 font-mono text-3xl sm:text-4xl font-bold tracking-widest text-fsl-gold" data-testid="receipt-voucher-code">{r.voucher_code}</div>
                {r.voucher_note && <p className="mt-2 text-sm text-fsl-slate">{r.voucher_note}</p>}
                {r.redeemed_at && <div className="mt-2 text-xs text-fsl-warning font-bold">Riscattato il {fmtDate(r.redeemed_at, { time: true })}</div>}
              </div>
            )}
            {r.delivery === "file" && r.download_url && <a className="btn-gold h-11 mt-6 inline-flex" href={mediaUrl(r.download_url)} data-testid="receipt-download"><Download className="h-4 w-4" /> Scarica il file</a>}
            {r.delivery === "payment" && <div className="mt-6 rounded-xl border border-white/10 bg-ink-950/60 p-4 text-sm flex items-center gap-3" data-testid="receipt-payment"><Wallet className="h-5 w-5 text-fsl-gold" /> Pagamento registrato: conserva questa pagina come ricevuta. Ti contatterà l'organizzazione per i dettagli.</div>}
          </div>
        </div>
        <div className="flex flex-wrap gap-3 print:hidden">
          <button className="btn-ghost h-10" onClick={() => window.print()} data-testid="receipt-print"><Printer className="h-4 w-4" /> Stampa / salva PDF</button>
          <Link to="/account" className="btn-ghost h-10" data-testid="receipt-account">I miei acquisti</Link>
          {r.tournament && <Link to={`/tornei/${r.tournament.slug}`} className="btn-ghost h-10" data-testid="receipt-home">Torna al torneo</Link>}
        </div>
      </div>
    </div>
  );
}
