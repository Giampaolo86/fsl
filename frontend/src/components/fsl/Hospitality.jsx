import { useEffect, useState } from "react";
import { CheckCircle2, Clock, MapPin, Send } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/context/AuthContext";
import { api, apiError } from "@/lib/api";
import { AUDIENCE, ICON_FOR, SERVICES, fmtEur } from "@/components/fsl/HospitalityEditor";

export function HospitalityBookingDialog({ slug, items, preselect, onClose, onDone }) {
  const { user } = useAuth();
  const [qty, setQty] = useState(() => Object.fromEntries(items.map((i) => [i.key, preselect === i.key ? 1 : 0])));
  const [form, setForm] = useState({ name: user?.full_name || "", email: user?.email || "", phone: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const lines = items.filter((i) => qty[i.key] > 0);
  const total = lines.reduce((a, i) => a + qty[i.key] * Number(i.price || 0), 0);
  const submit = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/public/tournaments/${slug}/hospitality/bookings`, { items: lines.map((i) => ({ key: i.key, qty: qty[i.key] })), ...form });
      setDone(data);
      onDone?.(data);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-navy-800 border-white/20 text-fsl-white rounded-xl max-w-xl" data-testid="hospitality-dialog" aria-describedby={undefined}>
        <DialogHeader><DialogTitle className="font-display uppercase text-2xl">{done ? "Richiesta inviata" : "Prenota ospitalità"}</DialogTitle></DialogHeader>
        {done ? (
          <div className="space-y-3" data-testid="hospitality-done">
            <div className="flex items-center gap-3 rounded-xl border border-fsl-success/40 bg-fsl-success/10 p-4"><CheckCircle2 className="h-8 w-8 text-fsl-success" /><div><div className="font-semibold">Codice richiesta <span className="num text-fsl-gold">{done.code}</span></div><div className="text-xs text-fsl-slate">L'organizzazione confermerà la disponibilità. Il pagamento avviene sul posto: totale indicativo {fmtEur(done.total)}.</div></div></div>
            <ul className="text-sm space-y-1">{done.bookings.map((b) => <li key={b.id} className="flex justify-between"><span>{b.item_label} × {b.qty}</span><span className="num">{fmtEur(b.qty * b.unit_price)}</span></li>)}</ul>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2" data-testid="hospitality-dialog-lines">
              {items.map((i) => (
                <div key={i.key} className="flex items-center gap-3 rounded-lg border border-white/10 bg-ink-950/50 px-3 h-12">
                  <span className="flex-1 min-w-0 truncate text-sm font-semibold">{i.label} <span className="text-xs text-fsl-slate font-normal">· {fmtEur(i.price)} {i.unit}</span></span>
                  <input type="number" min="0" max="500" className="fsl-input h-9 w-20 num text-right" value={qty[i.key]} onChange={(e) => setQty({ ...qty, [i.key]: Math.max(0, Number(e.target.value)) })} data-testid={`hospitality-qty-${i.key}`} />
                </div>
              ))}
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              <input className="fsl-input" placeholder="Nome e cognome / società *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="hospitality-name" />
              <input className="fsl-input" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="hospitality-email" />
              <input className="fsl-input" placeholder="Telefono" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="hospitality-phone" />
              <input className="fsl-input" placeholder="Note (allergie, orari, n. camere…)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} data-testid="hospitality-note" />
            </div>
            <div className="flex items-center justify-between text-sm"><span className="text-fsl-slate">Pagamento sul posto · nessun addebito online</span><span className="font-display font-extrabold text-xl num" data-testid="hospitality-total">{fmtEur(total)}</span></div>
          </div>
        )}
        <DialogFooter>
          <button className="btn-ghost" onClick={onClose}>{done ? "Chiudi" : "Annulla"}</button>
          {!done && <button className="btn-primary" disabled={busy || lines.length === 0 || form.name.trim().length < 2 || (!form.email.trim() && !form.phone.trim())} onClick={submit} data-testid="hospitality-submit"><Send className="h-4 w-4" /> {busy ? "Invio…" : "Invia richiesta"}</button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function HospitalityCards({ items, onBook, testId = "hospitality-cards" }) {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3" data-testid={testId}>
      {items.map((it) => {
        const Icon = ICON_FOR(it);
        return (
          <div key={it.key} className="rounded-2xl border border-white/10 bg-navy-800/80 p-4 flex flex-col gap-2 hover:border-fsl-gold/50 transition-colors" data-testid={`hospitality-card-${it.key}`}>
            <div className="flex items-start justify-between gap-2"><span className="h-10 w-10 rounded-full border border-fsl-gold/40 bg-ink-950/60 inline-flex items-center justify-center"><Icon className="h-5 w-5 text-fsl-gold" /></span><span className="font-display font-extrabold text-2xl num">{fmtEur(it.price)}</span></div>
            <div><div className="font-semibold leading-tight">{it.label}</div><div className="text-[11px] uppercase tracking-wider text-fsl-slate">{AUDIENCE[it.audience]} · {it.unit}</div></div>
            {it.description && <div className="text-sm text-fsl-white/90" data-testid={`hospitality-desc-${it.key}`}>{it.description}</div>}
            {(it.includes || []).length > 1 && <div className="flex flex-wrap gap-1" data-testid={`hospitality-includes-${it.key}`}>{SERVICES.filter(([k]) => it.includes.includes(k)).map(([k, label]) => <span key={k} className="text-[10px] uppercase tracking-wider rounded-full border border-fsl-gold/40 px-2 py-0.5 text-fsl-gold">{label}</span>)}</div>}
            {it.venue_name && <div className="text-sm">{it.venue_name}</div>}
            {it.address && <a href={it.maps_url} target="_blank" rel="noreferrer" className="text-xs text-fsl-gold hover:underline inline-flex items-center gap-1" data-testid={`hospitality-maps-${it.key}`}><MapPin className="h-3 w-3" /> {it.address}</a>}
            {it.when && <div className="text-xs text-fsl-slate inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {it.when}</div>}
            {it.notes && <div className="text-xs text-fsl-slate">{it.notes}</div>}
            {onBook && <button className="btn-ghost h-9 mt-auto text-xs" onClick={() => onBook(it.key)} data-testid={`hospitality-book-${it.key}`}>Prenota</button>}
          </div>
        );
      })}
    </div>
  );
}

export function HospitalitySection({ slug, className = "" }) {
  const [items, setItems] = useState(null);
  const [book, setBook] = useState(null);
  useEffect(() => { api.get(`/public/tournaments/${slug}/hospitality`).then((r) => setItems(r.data)).catch(() => setItems([])); }, [slug]);
  if (!items || items.length === 0) return null;
  return (
    <section className={className} data-testid="hospitality-section">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div><div className="fsl-kicker">Ospitalità e logistica</div><h2 className="font-display font-extrabold uppercase text-2xl sm:text-3xl leading-none">Pernotto, pasti e trasporti</h2></div>
        <button className="btn-gold h-10" onClick={() => setBook("all")} data-testid="hospitality-book-all">Richiedi prenotazione</button>
      </div>
      <HospitalityCards items={items} onBook={(k) => setBook(k)} />
      {book && <HospitalityBookingDialog slug={slug} items={items} preselect={book === "all" ? null : book} onClose={() => setBook(null)} />}
    </section>
  );
}
