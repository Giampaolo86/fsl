import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ReasonDialog } from "@/components/fsl/ReasonDialog";
import { api, apiError } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { mediaUrl } from "@/lib/upload";

const ROLES = ["Portiere", "Difensore", "Centrocampista", "Esterno", "Attaccante"];
const STATUS = { submitted: ["In attesa di conferma", "bg-fsl-warning text-ink-950"], approved: ["Rosa caricata", "bg-fsl-success text-ink-950"], rejected: ["Respinto", "bg-fsl-danger text-fsl-white"] };

async function downloadTemplate(tid, teamId) {
  const r = await api.get(`/tournaments/${tid}/roster-imports/template`, { params: teamId ? { team_id: teamId } : {}, responseType: "blob" });
  const name = (r.headers["content-disposition"] || "").match(/filename="([^"]+)"/)?.[1] || "FSL_Modulo_Rosa.xlsx";
  const a = document.createElement("a"); a.href = URL.createObjectURL(r.data); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

export function RosterImportClub({ tid, teamId }) {
  const [list, setList] = useState([]);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.get(`/tournaments/${tid}/roster-imports`).then((r) => setList(r.data)).catch(() => {}), [tid]);
  useEffect(() => { load(); }, [load]);
  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    const fd = new FormData(); fd.append("team_id", teamId); fd.append("file", file);
    try { const r = await api.post(`/tournaments/${tid}/roster-imports`, fd, { headers: { "Content-Type": "multipart/form-data" } }); toast.success(r.data.error_count ? `Modulo inviato: ${r.data.rows.length} giocatori, ${r.data.error_count} righe da correggere (l'admin potrà sistemarle)` : `Modulo inviato: ${r.data.rows.length} giocatori in attesa di conferma`); load(); } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  return (
    <section className="fsl-card-gold p-4 mb-5 space-y-3" data-testid="roster-import-club">
      <div className="flex flex-wrap items-center gap-3">
        <FileSpreadsheet className="h-6 w-6 text-fsl-gold shrink-0" />
        <div className="flex-1 min-w-[220px]"><div className="font-display font-bold uppercase">Modulo rosa società</div><p className="text-xs text-fsl-slate">Scarica il modulo Excel, compila nome, cognome, ruolo, numero di maglia e data di nascita, poi ricaricalo: l'admin conferma e carica la rosa.</p></div>
        <button className="btn-ghost" disabled={!teamId} onClick={() => downloadTemplate(tid, teamId).catch((e) => toast.error(apiError(e)))} data-testid="roster-template-download"><Download className="h-4 w-4" /> Scarica modulo Excel</button>
        <label className={`btn-gold cursor-pointer ${busy || !teamId ? "opacity-60 pointer-events-none" : ""}`}><Upload className="h-4 w-4" /> Carica modulo compilato<input type="file" accept=".xlsx" className="hidden" onChange={(e) => upload(e.target.files[0])} data-testid="roster-import-input" /></label>
      </div>
      {list.length > 0 && <div className="divide-y divide-white/[0.06] rounded-md border border-white/10" data-testid="roster-import-history">{list.slice(0, 5).map((i) => <div key={i.id} className="h-11 px-3 flex items-center gap-3 text-xs"><span className={`h-6 px-2 rounded text-[10px] font-bold uppercase inline-flex items-center ${STATUS[i.status][1]}`} data-testid={`roster-import-status-${i.id}`}>{STATUS[i.status][0]}</span><span className="flex-1 truncate">{i.team_label} · {i.rows.length} giocatori{i.error_count ? ` · ${i.error_count} righe con anomalie` : ""}{i.status === "approved" ? ` · ${i.imported_count} caricati` : ""}</span>{i.note && <span className="text-fsl-slate truncate max-w-[220px]">{i.note}</span>}<span className="num text-fsl-slate">{fmtDate(i.created_at)}</span></div>)}</div>}
    </section>
  );
}

function ReviewDialog({ tid, imp, onClose, onDone }) {
  const [rows, setRows] = useState(imp.rows.map((r) => ({ ...r, include: r.errors.length === 0 })));
  const [mode, setMode] = useState("merge");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [reject, setReject] = useState(false);
  const set = (i, k, v) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const chosen = rows.filter((r) => r.include);
  const approve = async () => { setBusy(true); try { const r = await api.post(`/tournaments/${tid}/roster-imports/${imp.id}/approve`, { mode, note, rows: chosen }); toast.success(`Rooster caricato: ${r.data.created} nuovi, ${r.data.updated} aggiornati`); onDone(); } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); } };
  const doReject = async (reason) => { try { await api.post(`/tournaments/${tid}/roster-imports/${imp.id}/reject`, { note: reason }); toast.success("Modulo respinto: la società è stata avvisata"); onDone(); } catch (e) { toast.error(apiError(e)); } };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-navy-800 border-white/20 text-fsl-white rounded-xl max-w-5xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined} data-testid="roster-review-dialog">
        <DialogHeader><DialogTitle className="font-display uppercase text-2xl">Conferma rosa · {imp.club_name}</DialogTitle></DialogHeader>
        <div className="grid sm:grid-cols-4 gap-2 text-xs">{[["Squadra", imp.team_label], ["Nome nel modulo", imp.team_name], ["Allenatore", imp.coach], ["Referente", `${imp.contact}${imp.phone ? ` · ${imp.phone}` : ""}`]].map(([l, v]) => <div key={l} className="fsl-card p-2"><div className="fsl-label">{l}</div><div className="font-semibold truncate">{v || "—"}</div></div>)}</div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-fsl-slate">{imp.file_url && <a href={mediaUrl(imp.file_url)} className="text-fsl-gold hover:underline" data-testid="roster-review-file">Apri il file originale ({imp.filename})</a>}<span>{rows.length} righe · {rows.filter((r) => r.errors.length).length} con anomalie (correggile o escludile)</span></div>
        <div className="fsl-card overflow-x-auto"><table className="w-full table-dark text-sm" data-testid="roster-review-table"><thead><tr><th></th><th>N.</th><th>Nome</th><th>Cognome</th><th>Ruolo</th><th>Maglia</th><th>Anno</th><th>Anomalie</th></tr></thead><tbody>
          {rows.map((r, i) => <tr key={i} className={r.include ? "" : "opacity-50"} data-testid={`roster-review-row-${r.n}`}>
            <td><input type="checkbox" checked={r.include} onChange={(e) => set(i, "include", e.target.checked)} aria-label="Includi" data-testid={`roster-row-include-${r.n}`} /></td><td className="num text-fsl-slate">{r.n}</td>
            <td><input className="fsl-input h-8 w-28" value={r.first_name} onChange={(e) => set(i, "first_name", e.target.value)} /></td><td><input className="fsl-input h-8 w-32" value={r.last_name} onChange={(e) => set(i, "last_name", e.target.value)} /></td>
            <td><select className="fsl-input h-8 w-36" value={ROLES.includes(r.role) ? r.role : ""} onChange={(e) => set(i, "role", e.target.value)} data-testid={`roster-row-role-${r.n}`}><option value="">Ruolo…</option>{ROLES.map((x) => <option key={x}>{x}</option>)}</select></td>
            <td><input type="number" className="fsl-input h-8 w-16 num" value={r.shirt_number ?? ""} onChange={(e) => set(i, "shirt_number", e.target.value === "" ? null : Number(e.target.value))} /></td><td><input type="number" className="fsl-input h-8 w-20 num" value={r.birth_year ?? ""} onChange={(e) => set(i, "birth_year", e.target.value === "" ? null : Number(e.target.value))} /></td>
            <td className="text-xs">{r.errors.length ? <span className="text-fsl-warning inline-flex items-start gap-1"><AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />{r.errors.join(" · ")}</span> : <span className="text-fsl-success inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> ok</span>}</td>
          </tr>)}
        </tbody></table></div>
        <div className="grid sm:grid-cols-[220px_1fr] gap-3"><select className="fsl-input" value={mode} onChange={(e) => setMode(e.target.value)} data-testid="roster-review-mode"><option value="merge">Aggiungi/aggiorna (mantieni gli altri)</option><option value="replace">Sostituisci rosa (disattiva chi manca)</option></select><input className="fsl-input" placeholder="Nota per la società (facoltativa)" value={note} onChange={(e) => setNote(e.target.value)} data-testid="roster-review-note" /></div>
        <DialogFooter className="gap-2"><button className="btn-ghost text-fsl-danger" disabled={busy} onClick={() => setReject(true)} data-testid="roster-review-reject"><XCircle className="h-4 w-4" /> Respingi</button><button className="btn-gold" disabled={busy || chosen.length === 0} onClick={approve} data-testid="roster-review-approve"><Upload className="h-4 w-4" /> Carica rooster ({chosen.length})</button></DialogFooter>
        <ReasonDialog open={reject} onOpenChange={setReject} title="Respingi modulo" description="La società riceverà una notifica con il motivo e potrà ricaricare il modulo corretto." confirmLabel="Respingi" danger onConfirm={doReject} />
      </DialogContent>
    </Dialog>
  );
}

export function RosterImportAdmin({ tid, onImported }) {
  const [list, setList] = useState([]);
  const [review, setReview] = useState(null);
  const load = useCallback(() => api.get(`/tournaments/${tid}/roster-imports`).then((r) => setList(r.data)).catch(() => {}), [tid]);
  useEffect(() => { load(); }, [load]);
  const pending = list.filter((i) => i.status === "submitted");
  if (list.length === 0) return null;
  return (
    <section className="fsl-card p-4 mb-5 space-y-2" data-testid="roster-import-admin">
      <div className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5 text-fsl-gold" /><span className="font-display font-bold uppercase">Moduli rosa ricevuti</span>{pending.length > 0 && <span className="h-6 px-2 rounded-full bg-fsl-warning text-ink-950 text-[11px] font-bold num" data-testid="roster-import-pending-count">{pending.length} da confermare</span>}</div>
      <div className="divide-y divide-white/[0.06]">{list.slice(0, 8).map((i) => <div key={i.id} className="h-12 px-2 flex items-center gap-3 text-sm" data-testid={`roster-import-row-${i.id}`}><span className={`h-6 px-2 rounded text-[10px] font-bold uppercase inline-flex items-center ${STATUS[i.status][1]}`}>{STATUS[i.status][0]}</span><span className="flex-1 min-w-0 truncate"><span className="font-semibold">{i.club_name}</span> · {i.team_label} · {i.rows.length} giocatori{i.error_count ? <span className="text-fsl-warning"> · {i.error_count} anomalie</span> : null}</span><span className="text-xs text-fsl-slate num">{fmtDate(i.created_at, { time: true })}</span>{i.status === "submitted" && <button className="btn-gold h-9" onClick={() => setReview(i)} data-testid={`roster-import-review-${i.id}`}>Rivedi e carica</button>}</div>)}</div>
      {review && <ReviewDialog tid={tid} imp={review} onClose={() => setReview(null)} onDone={() => { setReview(null); load(); onImported?.(); }} />}
    </section>
  );
}
