import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, FileText, Plus, Trash2, Upload, XCircle } from "lucide-react";
import { toast } from "sonner";
import { ClubCrest } from "@/components/fsl/ClubCrest";
import { PageHeader, SectionTitle } from "@/components/fsl/Primitives";
import { EmptyState, LoadingState } from "@/components/fsl/States";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/context/AuthContext";
import { api, apiError } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { mediaUrl, uploadMedia } from "@/lib/upload";

const TONE = { valid: "bg-fsl-success text-ink-950", expiring_30: "bg-fsl-warning/70 text-ink-950", expiring_15: "bg-fsl-warning text-ink-950", expiring_7: "bg-fsl-danger text-fsl-white", expired: "bg-fsl-danger text-fsl-white", none: "bg-navy-700 text-fsl-slate" };
const VERIF = { pending: ["Da verificare", "text-fsl-warning"], verified: ["Verificato", "text-fsl-success"], rejected: ["Respinto", "text-fsl-danger"] };

export default function Documents({ clubMode = false }) {
  const params = useParams();
  const { user } = useAuth();
  const membership = user.memberships?.find((m) => m.role === "club_manager");
  const tid = clubMode ? membership?.tournament_id : params.tournamentId;
  const [data, setData] = useState(null);
  const [summary, setSummary] = useState(null);
  const [clubs, setClubs] = useState([]);
  const [players, setPlayers] = useState([]);
  const [clubFilter, setClubFilter] = useState("");
  const [open, setOpen] = useState(null);
  const [form, setForm] = useState({ kind: "certificato_medico", title: "", expires_at: "", player_id: "", note: "", media_id: null, club_id: "" });
  const [progress, setProgress] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { if (!tid) return; api.get(`/tournaments/${tid}/documents`, { params: clubFilter ? { club_id: clubFilter } : {} }).then((r) => setData(r.data)).catch((e) => toast.error(apiError(e))); api.get(`/tournaments/${tid}/documents/summary`).then((r) => setSummary(r.data)).catch(() => {}); }, [tid, clubFilter]);
  useEffect(load, [load]);
  useEffect(() => { if (!tid) return; if (!clubMode) api.get(`/tournaments/${tid}/clubs`).then((r) => setClubs(r.data)).catch(() => {}); api.get(`/tournaments/${tid}/players`).then((r) => setPlayers(r.data)).catch(() => {}); }, [tid, clubMode]);
  if (!tid) return <EmptyState icon={FileText} title="Nessuna società assegnata" />;
  const act = async (fn, ok) => { setBusy(true); try { await fn(); toast.success(ok); load(); } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); } };
  const save = () => act(async () => { await api.post(`/tournaments/${tid}/documents`, { ...form, player_id: form.player_id || null, expires_at: form.expires_at || null, replaces_id: open?.id || null }, { params: form.club_id ? { club_id: form.club_id } : {} }); setOpen(null); }, open?.id ? "Nuova versione caricata" : "Documento aggiunto");
  const verify = (d, v) => act(() => api.patch(`/tournaments/${tid}/documents/${d.id}`, { verification: v }), v === "verified" ? "Documento verificato" : "Documento respinto");
  const remove = (d) => act(() => api.delete(`/tournaments/${tid}/documents/${d.id}`), "Documento eliminato");
  const upload = async (file) => { setProgress(0); try { const m = await uploadMedia(tid, file, setProgress); setForm((f) => ({ ...f, media_id: m.id, title: f.title || file.name })); } catch (e) { toast.error(apiError(e)); } finally { setProgress(null); } };
  const openNew = (replace) => { setForm({ kind: replace?.kind || "certificato_medico", title: replace?.title || "", expires_at: "", player_id: replace?.player_id || "", note: "", media_id: null, club_id: replace?.club_id || clubFilter || "" }); setOpen(replace || {}); };
  const filteredPlayers = players.filter((p) => !form.club_id || p.club_id === form.club_id);

  return (
    <div className="space-y-6">
      <PageHeader kicker={clubMode ? "Area Società" : "Segreteria"} title="Documenti" subtitle="Certificati medici, documenti d'identità, consensi e iscrizioni con scadenze. Facoltativi: nessun blocco sulle gare." actions={<>{!clubMode && <select className="fsl-input w-56" value={clubFilter} onChange={(e) => setClubFilter(e.target.value)} data-testid="documents-club-filter"><option value="">Tutte le società</option>{clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}<button className="btn-gold" onClick={() => openNew(null)} data-testid="document-add"><Plus className="h-4 w-4" /> Documento</button></>} />
      {summary && <div className="grid grid-cols-3 gap-3" data-testid="documents-summary">{[["Scaduti", summary.expired, "text-fsl-danger"], ["In scadenza (30 gg)", summary.expiring, "text-fsl-warning"], ["Da verificare", summary.pending, "text-fsl-blue-light"]].map(([l, v, c]) => <div key={l} className="fsl-card p-4"><div className={`font-display font-extrabold text-3xl num ${c}`}>{v}</div><div className="text-[11px] uppercase tracking-wider text-fsl-slate">{l}</div></div>)}</div>}
      {!clubMode && summary?.clubs?.length > 0 && <div className="fsl-card overflow-x-auto"><table className="w-full table-dark" data-testid="documents-by-club"><thead><tr><th>Società</th><th className="text-right">Documenti</th><th className="text-right">Scaduti</th><th className="text-right">In scadenza</th><th className="text-right">Da verificare</th></tr></thead><tbody>{summary.clubs.map((r) => <tr key={r.club.id} className="cursor-pointer" onClick={() => setClubFilter(r.club.id)}><td className="flex items-center gap-2"><ClubCrest club={r.club} size={20} />{r.club.name}</td><td className="num text-right">{r.total}</td><td className={`num text-right ${r.expired ? "text-fsl-danger font-bold" : ""}`}>{r.expired}</td><td className={`num text-right ${r.expiring ? "text-fsl-warning font-bold" : ""}`}>{r.expiring}</td><td className="num text-right">{r.pending}</td></tr>)}</tbody></table></div>}
      <SectionTitle>Elenco</SectionTitle>
      {!data ? <LoadingState /> : data.documents.length === 0 ? <EmptyState icon={FileText} title="Nessun documento" description="Carica certificati, documenti e consensi con la relativa scadenza." /> : (
        <div className="fsl-card divide-y divide-white/[0.06]" data-testid="documents-list">{data.documents.map((d) => (
          <div key={d.id} className="px-4 py-3 flex flex-wrap items-center gap-3" data-testid={`document-row-${d.id}`}>
            <span className={`h-6 px-2 rounded text-[10px] font-bold uppercase inline-flex items-center ${TONE[d.expiry.code]}`} data-testid={`document-expiry-${d.id}`}>{d.expiry.label}</span>
            <div className="flex-1 min-w-[200px]"><div className="font-semibold">{d.title} <span className="text-xs text-fsl-slate">v{d.version}</span></div><div className="text-xs text-fsl-slate">{d.kind_label}{d.player_name ? ` · ${d.player_name}` : ""}{!clubMode ? ` · ${d.club_name}` : ""}{d.expires_at ? ` · scade ${fmtDate(d.expires_at)}` : ""}</div></div>
            <span className={`text-xs font-semibold ${VERIF[d.verification][1]}`} data-testid={`document-verif-${d.id}`}>{VERIF[d.verification][0]}</span>
            {d.file_url && <a className="btn-ghost h-9 px-3 text-xs" href={mediaUrl(d.file_url)} target="_blank" rel="noreferrer" data-testid={`document-open-${d.id}`}>Apri</a>}
            <button className="btn-ghost h-9 px-3 text-xs" onClick={() => openNew(d)} data-testid={`document-replace-${d.id}`}><Upload className="h-3.5 w-3.5" /> Nuova versione</button>
            {!clubMode && d.verification !== "verified" && <button className="btn-ghost h-9 px-3 text-fsl-success" disabled={busy} onClick={() => verify(d, "verified")} aria-label="Verifica" data-testid={`document-verify-${d.id}`}><CheckCircle2 className="h-4 w-4" /></button>}
            {!clubMode && d.verification !== "rejected" && <button className="btn-ghost h-9 px-3 text-fsl-warning" disabled={busy} onClick={() => verify(d, "rejected")} aria-label="Respingi" data-testid={`document-reject-${d.id}`}><XCircle className="h-4 w-4" /></button>}
            <button className="btn-ghost h-9 px-3 text-fsl-danger" disabled={busy} onClick={() => remove(d)} aria-label="Elimina" data-testid={`document-delete-${d.id}`}><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}</div>
      )}
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}><DialogContent className="bg-navy-800 border-white/20 text-fsl-white rounded-xl" aria-describedby={undefined} data-testid="document-dialog">
        <DialogHeader><DialogTitle className="font-display uppercase text-2xl">{open?.id ? "Nuova versione" : "Nuovo documento"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {!clubMode && <select className="fsl-input" value={form.club_id} onChange={(e) => setForm({ ...form, club_id: e.target.value })} data-testid="document-club"><option value="">Società…</option>{clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
          <select className="fsl-input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} data-testid="document-kind">{Object.entries(data?.kinds || {}).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <input className="fsl-input" placeholder="Titolo" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-testid="document-title" />
          <div className="grid grid-cols-2 gap-3"><label><span className="fsl-label">Scadenza (facoltativa)</span><input type="date" className="fsl-input mt-1" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} data-testid="document-expires" /></label><label><span className="fsl-label">Giocatore (facoltativo)</span><select className="fsl-input mt-1" value={form.player_id} onChange={(e) => setForm({ ...form, player_id: e.target.value })} data-testid="document-player"><option value="">—</option>{filteredPlayers.map((p) => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}</select></label></div>
          <label className="h-12 rounded-md border border-dashed border-white/25 flex items-center justify-center gap-2 text-xs text-fsl-slate cursor-pointer hover:border-fsl-gold/60"><Upload className="h-4 w-4" /> {progress != null ? `Caricamento ${progress}%` : form.media_id ? "File caricato ✓ (clicca per sostituire)" : "Carica file (immagine o PDF)"}<input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => e.target.files[0] && upload(e.target.files[0])} data-testid="document-file" /></label>
          <input className="fsl-input" placeholder="Note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </div>
        <DialogFooter><button className="btn-ghost" onClick={() => setOpen(null)}>Annulla</button><button className="btn-gold" disabled={busy || !form.title || (!clubMode && !form.club_id)} onClick={save} data-testid="document-save">Salva</button></DialogFooter>
      </DialogContent></Dialog>
    </div>
  );
}
