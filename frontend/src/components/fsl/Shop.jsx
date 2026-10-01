import { useCallback, useEffect, useState } from "react";
import { Camera, Image as ImageIcon, Loader2, Lock, ShoppingBag, Upload, Video } from "lucide-react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { Link } from "react-router-dom";
import { PlayerTagPicker } from "@/components/fsl/PlayerTagPicker";
import { useCart } from "@/context/CartContext";
import { fmtDate } from "@/lib/format";
import { mediaUrl, uploadMedia } from "@/lib/upload";

export const fmtPrice = (v) => `${Number(v).toFixed(2).replace(".", ",")} €`;

export function ShopItemCard({ it, onBuy, busy }) {
  return (
    <div className="fsl-card overflow-hidden flex flex-col" data-testid={`shop-item-${it.id}`}>
      <div className="relative h-44 bg-navy-700/60 overflow-hidden">
        {it.preview_url ? <img src={mediaUrl(it.preview_url)} alt="" className="h-full w-full object-cover blur-[2px] scale-105" /> : <div className="h-full w-full flex items-center justify-center"><Video className="h-12 w-12 text-fsl-slate" /></div>}
        <div className="absolute inset-0 flex items-center justify-center"><span className="h-10 w-10 rounded-full bg-ink-950/80 inline-flex items-center justify-center"><Lock className="h-4 w-4 text-fsl-gold" /></span></div>
        <span className="absolute top-2 left-2 h-6 px-2 rounded-full bg-ink-950/80 text-[10px] font-bold uppercase inline-flex items-center gap-1">{it.kind === "video" ? <Video className="h-3 w-3" /> : <Camera className="h-3 w-3" />}{it.kind === "video" ? "Video" : "Foto"}</span>
      </div>
      <div className="p-3 flex items-center gap-3">
        <div className="flex-1 min-w-0"><div className="font-semibold truncate">{it.title}</div><div className="text-xs text-fsl-slate">Originale in alta qualità dopo l'acquisto</div></div>
        <button className="btn-gold h-10 shrink-0" disabled={busy} onClick={() => onBuy(it)} data-testid={`shop-buy-${it.id}`}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingBag className="h-4 w-4" />} Aggiungi · {fmtPrice(it.price)}</button>
      </div>
    </div>
  );
}

export function PublicShop({ slug, matchId }) {
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState(null);
  useEffect(() => { api.get(`/public/tournaments/${slug}/matches/${matchId}/shop`).then((r) => setItems(r.data)).catch(() => setItems([])); }, [slug, matchId]);
  const cart = useCart();
  const buy = (it) => cart.add({ id: it.id, title: it.title, price: it.price, kind: it.kind, image_url: it.preview_url, scope: slug });
  if (!items?.length) return null;
  return (
    <section className="mt-8" data-testid="match-center-shop">
      <div className="flex items-end justify-between mb-3"><h2 className="fsl-section-title">Foto e video della gara</h2><span className="text-xs text-fsl-slate">Video 0,99 € · Foto professionale 0,49 € · pagamento sicuro Stripe</span></div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">{items.map((it) => <ShopItemCard key={it.id} it={it} onBuy={buy} busy={busy === it.id} />)}</div>
    </section>
  );
}

export function ShopManager({ tournamentId, matchId }) {
  const [items, setItems] = useState(null);
  const [form, setForm] = useState({ kind: "photo", title: "" });
  const [progress, setProgress] = useState(null);
  const [busyPreview, setBusyPreview] = useState(null);
  const [players, setPlayers] = useState([]);
  const [tags, setTags] = useState([]);
  const [editTags, setEditTags] = useState(null);
  const [rosterMissing, setRosterMissing] = useState(false);
  useEffect(() => {
    api.get(`/tournaments/${tournamentId}/matches/${matchId}`).then(async (r) => {
      const m = r.data;
      const [all, teams] = await Promise.all([api.get(`/tournaments/${tournamentId}/players`), api.get(`/tournaments/${tournamentId}/teams`)]);
      const tn = Object.fromEntries(teams.data.map((x) => [x.id, x.name]));
      const mk = (x) => ({ id: x.id, team_id: x.team_id, shirt_number: x.shirt_number, label: `${x.first_name} ${x.last_name}`, team: tn[x.team_id] || "" });
      const inMatch = all.data.filter((x) => [m.home_team_id, m.away_team_id].includes(x.team_id)).map(mk);
      const rest = all.data.filter((x) => ![m.home_team_id, m.away_team_id].includes(x.team_id)).map(mk).sort((a, b) => a.label.localeCompare(b.label));
      setPlayers([...inMatch.sort((a, b) => (a.team_id === m.home_team_id ? -1 : 1) - (b.team_id === m.home_team_id ? -1 : 1) || (a.shirt_number ?? 99) - (b.shirt_number ?? 99)), ...rest]);
      setRosterMissing(inMatch.length === 0);
    }).catch(() => {});
  }, [tournamentId, matchId]);
  const saveTags = (it, ids) => api.patch(`/tournaments/${tournamentId}/shop/items/${it.id}`, { player_ids: ids }).then(load).catch((e) => toast.error(apiError(e)));
  const load = useCallback(() => api.get(`/tournaments/${tournamentId}/shop/items`, { params: { match_id: matchId } }).then((r) => setItems(r.data)).catch(() => setItems([])), [tournamentId, matchId]);
  useEffect(() => { load(); }, [load]);
  const upload = async (files) => {
    for (const file of files) {
      setProgress({ name: file.name, pct: 0 });
      try {
        const m = await uploadMedia(tournamentId, file, (pct) => setProgress({ name: file.name, pct }));
        await api.post(`/tournaments/${tournamentId}/shop/items`, { match_id: matchId, kind: form.kind, title: form.title || file.name.replace(/\.[^.]+$/, ""), media_id: m.id, player_ids: tags });
        toast.success(`${form.kind === "video" ? "Video" : "Foto"} in vendita`);
      } catch (e) { toast.error(apiError(e)); }
    }
    setProgress(null); setForm({ ...form, title: "" }); load();
  };
  const toggle = (it) => api.patch(`/tournaments/${tournamentId}/shop/items/${it.id}`, { active: !it.active }).then(load).catch((e) => toast.error(apiError(e)));
  const regen = (it) => { setBusyPreview(it.id); api.post(`/tournaments/${tournamentId}/shop/items/${it.id}/preview`).then(() => { toast.success("Anteprima generata"); load(); }).catch((e) => toast.error(apiError(e))).finally(() => setBusyPreview(null)); };
  return (
    <div className="space-y-4" data-testid="shop-manager">
      <div className="fsl-card p-4 grid sm:grid-cols-[140px_1fr_auto] gap-3 items-center">
        <select className="fsl-input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} data-testid="shop-kind"><option value="photo">Foto · 0,49 €</option><option value="video">Video · 0,99 €</option></select>
        <input className="fsl-input" placeholder="Titolo (facoltativo, altrimenti nome file)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-testid="shop-title" />
        <label className="btn-gold cursor-pointer"><Upload className="h-4 w-4" /> Carica e metti in vendita<input type="file" multiple accept={form.kind === "video" ? "video/*" : "image/*"} className="hidden" onChange={(e) => upload([...e.target.files])} data-testid="shop-file-input" /></label>
        <div className="sm:col-span-3" data-testid="shop-player-tags">
          <div className="fsl-label mb-1">Tag giocatori <span className="text-fsl-slate normal-case">(il contenuto compare nella loro scheda · scrivi il nome e scegli dall'elenco)</span></div>
          {rosterMissing && players.length > 0 && <p className="text-[11px] text-fsl-warning mb-1" data-testid="shop-tags-roster-warning">Le due squadre di questa gara non hanno ancora una rosa: puoi comunque cercare tra tutti i giocatori del torneo oppure <Link to={`/admin/t/${tournamentId}/rose`} className="text-fsl-gold hover:underline">caricare le rose</Link>.</p>}
          <PlayerTagPicker players={players} value={tags} onChange={setTags} rosterLink={`/admin/t/${tournamentId}/rose`} emptyHint="Nessun giocatore in rosa nel torneo: carica prima le rose delle società, poi potrai taggare i bambini." testId="shop-tags" />
        </div>
        {progress && <div className="sm:col-span-3 text-xs text-fsl-slate flex items-center gap-2" data-testid="shop-upload-progress"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {progress.name} · {progress.pct}%<span className="flex-1 h-1.5 rounded bg-ink-950 overflow-hidden"><span className="block h-full bg-fsl-gold" style={{ width: `${progress.pct}%` }} /></span></div>}
      </div>
      <p className="text-xs text-fsl-slate">Le foto vengono pubblicate con anteprima sfocata e filigrana; i video con un fotogramma estratto automaticamente (leggermente sfocato e con filigrana). L'originale è scaricabile solo dopo il pagamento.</p>
      <div className="fsl-card divide-y divide-white/[0.06]" data-testid="shop-items-list">
        {items?.length === 0 && <p className="p-6 text-center text-sm text-fsl-slate">Nessun contenuto in vendita per questa gara.</p>}
        {(items || []).map((it) => <div key={it.id} className="min-h-14 py-2 px-4 flex items-center gap-3 text-sm" data-testid={`shop-row-${it.id}`}>{it.preview_url ? <img src={mediaUrl(it.preview_url)} alt="" className="h-10 w-10 rounded object-cover" data-testid={`shop-row-preview-${it.id}`} /> : <span className="h-10 w-10 rounded bg-navy-700 inline-flex items-center justify-center"><Video className="h-4 w-4" /></span>}<div className="flex-1 min-w-0"><div className="font-semibold truncate">{it.title}</div><div className="text-xs text-fsl-slate num">{fmtPrice(it.price)} · venduti {it.sold} · {fmtDate(it.created_at)}</div><div className="flex flex-wrap gap-1 mt-1 items-center">{(it.player_ids || []).map((id) => players.find((p) => p.id === id)).filter(Boolean).map((p) => <span key={p.id} className="h-5 px-1.5 rounded-full text-[10px] border bg-fsl-gold/20 text-fsl-gold border-fsl-gold/50 inline-flex items-center" data-testid={`shop-item-tag-${it.id}-${p.id}`}>{p.label}</span>)}<button type="button" onClick={() => setEditTags(editTags === it.id ? null : it.id)} className="h-5 px-1.5 rounded-full text-[10px] border border-dashed border-white/25 text-fsl-slate hover:text-fsl-white" data-testid={`shop-item-tags-edit-${it.id}`}>{editTags === it.id ? "Chiudi" : (it.player_ids || []).length ? "Modifica tag" : "+ tag giocatori"}</button></div>{editTags === it.id && <div className="mt-2" data-testid={`shop-item-tags-editor-${it.id}`}><PlayerTagPicker players={players} value={it.player_ids || []} onChange={(ids) => saveTags(it, ids)} compact testId={`shop-item-tags-${it.id}`} /></div>}</div>{!it.preview_url && <button className="btn-ghost h-8 px-3 text-xs" disabled={busyPreview === it.id} onClick={() => regen(it)} data-testid={`shop-preview-regen-${it.id}`}>{busyPreview === it.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />} Genera anteprima</button>}<button className={`h-8 px-3 rounded-full text-xs font-semibold border ${it.active ? "border-fsl-success/50 text-fsl-success" : "border-white/20 text-fsl-slate"}`} onClick={() => toggle(it)} data-testid={`shop-toggle-${it.id}`}>{it.active ? "In vendita" : "Sospeso"}</button></div>)}
      </div>
    </div>
  );
}
