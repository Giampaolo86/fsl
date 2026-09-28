import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { BadgeCheck, Download, Eye, EyeOff, ImagePlus, Package, Pencil, Plus, QrCode, Ticket, Trash2, Upload, Wallet } from "lucide-react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { mediaUrl, uploadMedia } from "@/lib/upload";
import { PageHeader } from "@/components/fsl/Primitives";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const eur = (n) => `${Number(n).toFixed(2).replace(".", ",")} €`;
const DELIVERY_ICON = { file: Download, voucher: Ticket, payment: Wallet };
const EMPTY = { title: "", description: "", price: 4.99, delivery: "payment", media_id: null, media_name: "", preview_media_id: null, voucher_note: "", placements: ["tournament_home"], club_ids: [], stock: "", active: true };

function Field({ label, hint, children }) {
  return <label className="block"><span className="fsl-label">{label}</span>{children}{hint && <span className="mt-1 block text-[11px] text-fsl-slate">{hint}</span>}</label>;
}

function ProductDialog({ tid, product, meta, clubs, onClose, onSaved }) {
  const [f, setF] = useState(product ? { ...EMPTY, ...product, stock: product.stock ?? "", media_name: product.media_id ? "file caricato" : "" } : EMPTY);
  const [busy, setBusy] = useState("");
  const [prog, setProg] = useState(0);
  const up = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const upload = async (file, key) => {
    if (!file) return;
    setBusy(key); setProg(0);
    try { const m = await uploadMedia(tid, file, setProg); up(key, m.id); if (key === "media_id") up("media_name", file.name); } catch (e) { toast.error(apiError(e)); } finally { setBusy(""); }
  };
  const save = async () => {
    setBusy("save");
    const body = { title: f.title, description: f.description, price: Number(f.price), delivery: f.delivery, media_id: f.media_id, preview_media_id: f.preview_media_id, voucher_note: f.voucher_note, placements: f.placements, club_ids: f.club_ids, stock: f.stock === "" ? (product ? 0 : null) : Number(f.stock), active: f.active };
    try { product ? await api.patch(`/tournaments/${tid}/shop/products/${product.id}`, body) : await api.post(`/tournaments/${tid}/shop/products`, body); toast.success(product ? "Prodotto aggiornato" : "Prodotto in vendita"); onSaved(); onClose(); } catch (e) { toast.error(apiError(e)); } finally { setBusy(""); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-navy-800 border-white/20 text-fsl-white rounded-xl max-w-2xl max-h-[92vh] overflow-y-auto" aria-describedby={undefined} data-testid="shop-product-dialog">
        <DialogHeader><DialogTitle className="font-display uppercase text-2xl">{product ? "Modifica prodotto" : "Nuovo prodotto"}</DialogTitle></DialogHeader>
        <div className="grid sm:grid-cols-[1fr_140px] gap-4">
          <Field label="Nome prodotto"><input className="fsl-input" value={f.title} onChange={(e) => up("title", e.target.value)} placeholder="Es. Poster squadra A3" data-testid="shop-title-input" /></Field>
          <Field label="Prezzo (€, IVA inclusa)"><input type="number" min="0.5" step="0.01" className="fsl-input" value={f.price} onChange={(e) => up("price", e.target.value)} data-testid="shop-price-input" /></Field>
        </div>
        <Field label="Descrizione" hint="Cosa riceve chi acquista, tempi e modalità"><textarea className="fsl-input min-h-[80px]" value={f.description} onChange={(e) => up("description", e.target.value)} data-testid="shop-description-input" /></Field>
        <div>
          <span className="fsl-label">Tipo di consegna</span>
          <div className="grid sm:grid-cols-3 gap-2">
            {Object.entries(meta.delivery).map(([k, label]) => { const Icon = DELIVERY_ICON[k]; return <button key={k} type="button" className={`rounded-xl border p-3 text-left text-sm ${f.delivery === k ? "border-fsl-gold bg-fsl-gold/10" : "border-white/15 hover:border-white/30"}`} onClick={() => up("delivery", k)} data-testid={`shop-delivery-${k}`}><Icon className="h-4 w-4 text-fsl-gold mb-1" /><div className="font-semibold">{label}</div><div className="text-[11px] text-fsl-slate">{k === "file" ? "PDF, immagine o video che carichi tu" : k === "voucher" ? "Codice FSL-XXXX-XXXX da mostrare al campo" : "Quote, gadget da ritirare, iscrizioni"}</div></button>; })}
          </div>
        </div>
        {f.delivery === "file" && <Field label="File da consegnare" hint="Viene scaricato dopo il pagamento"><label className="btn-ghost h-10 cursor-pointer w-fit" data-testid="shop-file-label"><Upload className="h-4 w-4" /> {busy === "media_id" ? `Carico ${prog}%` : f.media_name || "Carica file"}<input type="file" className="hidden" onChange={(e) => upload(e.target.files[0], "media_id")} data-testid="shop-file-input" /></label></Field>}
        {f.delivery === "voucher" && <Field label="Istruzioni per il voucher" hint="Mostrate al cliente insieme al codice"><input className="fsl-input" value={f.voucher_note} onChange={(e) => up("voucher_note", e.target.value)} placeholder="Es. Mostra il codice alla segreteria il giorno della finale" data-testid="shop-voucher-note-input" /></Field>}
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Immagine (opzionale)"><div className="flex items-center gap-3">{f.preview_media_id && <img src={mediaUrl(`/api/media/${f.preview_media_id}`)} alt="" className="h-12 w-12 rounded-lg object-cover" />}<label className="btn-ghost h-10 cursor-pointer" data-testid="shop-image-label"><ImagePlus className="h-4 w-4" /> {busy === "preview_media_id" ? `${prog}%` : f.preview_media_id ? "Cambia" : "Carica"}<input type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files[0], "preview_media_id")} data-testid="shop-image-input" /></label></div></Field>
          <Field label="Quantità disponibile" hint="Vuoto = illimitata"><input type="number" min="1" className="fsl-input" value={f.stock} onChange={(e) => up("stock", e.target.value)} data-testid="shop-stock-input" /></Field>
        </div>
        <div>
          <span className="fsl-label">Dove compare</span>
          <div className="flex flex-wrap gap-2">{Object.entries(meta.placements).map(([k, label]) => <button key={k} type="button" className={`h-9 px-3 rounded-full border text-xs font-bold ${f.placements.includes(k) ? "border-fsl-gold bg-fsl-gold text-ink-950" : "border-white/20"}`} onClick={() => up("placements", f.placements.includes(k) ? f.placements.filter((x) => x !== k) : [...f.placements, k])} data-testid={`shop-placement-${k}`}>{label}</button>)}</div>
        </div>
        {clubs.length > 0 && <Field label="Solo per alcune società (opzionale)" hint="Nessuna selezione = tutte le società"><div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto">{clubs.map((c) => <button key={c.id} type="button" className={`h-8 px-3 rounded-full border text-xs ${f.club_ids.includes(c.id) ? "border-fsl-gold bg-fsl-gold/15 text-fsl-gold" : "border-white/15 text-fsl-slate"}`} onClick={() => up("club_ids", f.club_ids.includes(c.id) ? f.club_ids.filter((x) => x !== c.id) : [...f.club_ids, c.id])} data-testid={`shop-club-${c.id}`}>{c.short_name || c.name}</button>)}</div></Field>}
        <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => up("active", e.target.checked)} data-testid="shop-active-input" /> In vendita</label>
        <DialogFooter>
          <button type="button" className="btn-ghost h-10" onClick={onClose} data-testid="shop-cancel">Annulla</button>
          <button type="button" className="btn-gold h-10" disabled={!!busy || !f.title || !f.price} onClick={save} data-testid="shop-save">{busy === "save" ? "Salvo…" : product ? "Salva" : "Metti in vendita"}</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VoucherBox({ tid }) {
  const [code, setCode] = useState("");
  const [v, setV] = useState(null);
  const [busy, setBusy] = useState(false);
  const lookup = async () => { setBusy(true); try { const r = await api.get(`/tournaments/${tid}/shop/vouchers`, { params: { code } }); setV(r.data); } catch (e) { setV(null); toast.error(apiError(e)); } finally { setBusy(false); } };
  const redeem = async () => { setBusy(true); try { await api.post(`/tournaments/${tid}/shop/redeem`, { code }); toast.success("Voucher riscattato"); lookup(); } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); } };
  return (
    <section className="fsl-card p-5" data-testid="shop-voucher-box">
      <div className="flex items-center gap-2 mb-3"><QrCode className="h-5 w-5 text-fsl-gold" /><span className="font-display font-bold uppercase">Riscatta un voucher</span></div>
      <div className="flex flex-wrap gap-2">
        <input className="fsl-input w-56 font-mono uppercase" placeholder="FSL-XXXX-XXXX" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} data-testid="voucher-code-input" />
        <button className="btn-ghost h-10" disabled={busy || code.length < 6} onClick={lookup} data-testid="voucher-lookup">Verifica</button>
        {v && !v.redeemed_at && <button className="btn-gold h-10" disabled={busy} onClick={redeem} data-testid="voucher-redeem"><BadgeCheck className="h-4 w-4" /> Segna come consegnato</button>}
      </div>
      {v && <div className="mt-3 text-sm rounded-xl border border-white/10 p-3" data-testid="voucher-result"><b>{v.title}</b> · {eur(v.amount)} · {v.buyer_email || "acquirente anonimo"} · pagato {fmtDate(v.paid_at, { time: true })}<div className={`mt-1 text-xs ${v.redeemed_at ? "text-fsl-warning" : "text-fsl-success"}`}>{v.redeemed_at ? `Già riscattato il ${fmtDate(v.redeemed_at, { time: true })}` : "Valido, non ancora riscattato"}</div></div>}
    </section>
  );
}

export default function Shop() {
  const { tournamentId: tid } = useParams();
  const [data, setData] = useState(null);
  const [clubs, setClubs] = useState([]);
  const [dialog, setDialog] = useState(null);
  const load = useCallback(() => api.get(`/tournaments/${tid}/shop/products`).then((r) => setData(r.data)).catch((e) => toast.error(apiError(e))), [tid]);
  useEffect(() => { load(); api.get(`/tournaments/${tid}/clubs`).then((r) => setClubs(r.data)).catch(() => {}); }, [load, tid]);
  const toggle = async (p) => { try { await api.patch(`/tournaments/${tid}/shop/products/${p.id}`, { active: !p.active }); load(); } catch (e) { toast.error(apiError(e)); } };
  const remove = async (p) => { if (!window.confirm(`Eliminare «${p.title}»?`)) return; try { const r = await api.delete(`/tournaments/${tid}/shop/products/${p.id}`); toast.success(r.data.archived ? "Prodotto archiviato (ha vendite)" : "Prodotto eliminato"); load(); } catch (e) { toast.error(apiError(e)); } };
  if (!data) return null;
  return (
    <div className="space-y-6" data-testid="shop-admin">
      <PageHeader kicker="Negozio FSL" title="Prodotti personalizzati" subtitle="Metti in vendita in 2 minuti poster, quote, gadget, iscrizioni o file: Stripe riceve prezzo e nome dall'app, le vendite finiscono in «Vendite»." actions={<button className="btn-gold h-10" onClick={() => setDialog({})} data-testid="shop-new"><Plus className="h-4 w-4" /> Nuovo prodotto</button>} />
      {data.products.length === 0 ? <div className="fsl-card p-8 text-center text-sm text-fsl-slate" data-testid="shop-empty"><Package className="h-8 w-8 text-fsl-gold mx-auto mb-2" />Nessun prodotto personalizzato: crea il primo con «Nuovo prodotto».</div> : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4" data-testid="shop-products">
          {data.products.map((p) => { const Icon = DELIVERY_ICON[p.delivery]; return (
            <div key={p.id} className={`fsl-card p-4 flex gap-4 ${p.active ? "" : "opacity-60"}`} data-testid={`shop-product-${p.id}`}>
              <div className="h-20 w-20 shrink-0 rounded-xl bg-ink-950/60 border border-white/10 overflow-hidden flex items-center justify-center">{p.image_url ? <img src={mediaUrl(p.image_url)} alt="" className="h-full w-full object-cover" /> : <Icon className="h-7 w-7 text-fsl-gold" />}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2"><div className="font-display font-bold uppercase leading-tight flex-1 truncate">{p.title}</div><div className="num font-display font-extrabold text-fsl-gold">{eur(p.price)}</div></div>
                <div className="text-[11px] text-fsl-slate mt-0.5">{data.delivery[p.delivery]} · {p.placements.map((x) => data.placements[x]).join(", ")}</div>
                <div className="text-xs mt-1"><span className="num">{p.sold}</span> venduti{p.stock != null ? ` · ${p.left} rimasti` : ""}{!p.active && <span className="ml-2 text-fsl-warning font-bold">NON IN VENDITA</span>}</div>
                <div className="mt-2 flex gap-1">
                  <button className="btn-ghost h-8 px-2 text-xs" onClick={() => setDialog({ product: p })} data-testid={`shop-edit-${p.id}`}><Pencil className="h-3.5 w-3.5" /> Modifica</button>
                  <button className="btn-ghost h-8 px-2 text-xs" onClick={() => toggle(p)} data-testid={`shop-toggle-${p.id}`}>{p.active ? <><EyeOff className="h-3.5 w-3.5" /> Sospendi</> : <><Eye className="h-3.5 w-3.5" /> Rimetti in vendita</>}</button>
                  <button className="btn-ghost h-8 px-2 text-xs text-fsl-danger" onClick={() => remove(p)} data-testid={`shop-delete-${p.id}`}><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            </div>
          ); })}
        </div>
      )}
      <VoucherBox tid={tid} />
      {dialog && <ProductDialog tid={tid} product={dialog.product} meta={data} clubs={clubs} onClose={() => setDialog(null)} onSaved={load} />}
    </div>
  );
}
