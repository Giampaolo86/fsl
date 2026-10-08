import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
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
      <AddPlayerRequest tid={tid} teamId={teamId} onDone={load} />
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
  const approve = async () => { setBusy(true); try { const r = await api.post(`/tournaments/${tid}/roster-imports/${imp.id}/approve`, { mode, note, rows: chosen }); toast.success(`Rosa caricata: ${r.data.created} nuovi, ${r.data.updated} aggiornati${imp.team_status === "pending" ? " · gruppo confermato" : ""}`); onDone(); } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); } };
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
        <DialogFooter className="gap-2"><button className="btn-ghost text-fsl-danger" disabled={busy} onClick={() => setReject(true)} data-testid="roster-review-reject"><XCircle className="h-4 w-4" /> Respingi</button><button className="btn-gold" disabled={busy || chosen.length === 0} onClick={approve} data-testid="roster-review-approve"><Upload className="h-4 w-4" /> {imp.team_status === "pending" ? `Conferma gruppo e carica rosa (${chosen.length})` : `Carica rosa (${chosen.length})`}</button></DialogFooter>
        <ReasonDialog open={reject} onOpenChange={setReject} title="Respingi modulo" description="La società riceverà una notifica con il motivo e potrà ricaricare il modulo corretto." confirmLabel="Respingi" danger onConfirm={doReject} />
      </DialogContent>
    </Dialog>
  );
}

export function RosterImportAdmin({ tid, onImported }) {
  const [list, setList] = useState([]);
  const [review, setReview] = useState(null);
  const [clubs, setClubs] = useState([]);
  const [teams, setTeams] = useState([]);
  const [clubId, setClubId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.get(`/tournaments/${tid}/roster-imports`).then((r) => setList(r.data)).catch(() => {}), [tid]);
  useEffect(() => { load(); api.get(`/tournaments/${tid}/clubs`).then((r) => setClubs(r.data)).catch(() => {}); api.get(`/tournaments/${tid}/teams`).then((r) => setTeams(r.data)).catch(() => {}); }, [load, tid]);
  const clubTeams = teams.filter((t) => t.club_id === clubId);
  useEffect(() => { setTeamId(clubTeams[0]?.id || ""); }, [clubId]); // eslint-disable-line react-hooks/exhaustive-deps
  const pending = list.filter((i) => i.status === "submitted");
  const pendingGroups = teams.filter((t) => t.status === "pending");
  const reloadTeams = () => api.get(`/tournaments/${tid}/teams`).then((r) => setTeams(r.data)).catch(() => {});
  const confirmGroup = (t) => api.post(`/tournaments/${tid}/club-groups/${t.id}/confirm`, {}).then(() => { toast.success(`Gruppo «${t.name}» confermato: ora puoi assegnarlo a un girone`); reloadTeams(); load(); }).catch((e) => toast.error(apiError(e)));
  const rejectGroup = (t) => { const note = window.prompt(`Motivo del rifiuto per «${t.name}» (la società riceverà una notifica):`); if (note === null) return; api.post(`/tournaments/${tid}/club-groups/${t.id}/reject`, { note }).then(() => { toast.success("Gruppo rifiutato"); reloadTeams(); load(); }).catch((e) => toast.error(apiError(e))); };
  const upload = async (file) => {
    if (!file || !teamId) return;
    setBusy(true);
    const fd = new FormData(); fd.append("team_id", teamId); fd.append("file", file);
    try { const r = await api.post(`/tournaments/${tid}/roster-imports`, fd, { headers: { "Content-Type": "multipart/form-data" } }); toast.success(`${r.data.rows.length} giocatori letti dal modulo: rivedi e carica la rosa`); load(); setReview(r.data); } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  return (
    <section className="fsl-card p-4 mb-5 space-y-3" data-testid="roster-import-admin">
      <div className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5 text-fsl-gold" /><span className="font-display font-bold uppercase">Moduli rosa Excel</span>{pending.length > 0 && <span className="h-6 px-2 rounded-full bg-fsl-warning text-ink-950 text-[11px] font-bold num" data-testid="roster-import-pending-count">{pending.length} da confermare</span>}</div>
      <div className="rounded-xl border border-fsl-gold/30 bg-ink-950/50 p-3 flex flex-wrap items-end gap-3" data-testid="roster-import-admin-upload">
        <div className="flex-1 min-w-[200px]"><div className="fsl-label mb-1">Carica un modulo per una società</div><select className="fsl-input" value={clubId} onChange={(e) => setClubId(e.target.value)} data-testid="roster-admin-club-select"><option value="">Scegli la società…</option>{clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div className="flex-1 min-w-[200px]"><div className="fsl-label mb-1">Squadra · categoria</div><select className="fsl-input" value={teamId} disabled={!clubId} onChange={(e) => setTeamId(e.target.value)} data-testid="roster-admin-team-select">{clubTeams.length === 0 && <option value="">{clubId ? "Nessuna squadra iscritta" : "—"}</option>}{clubTeams.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.category}</option>)}</select></div>
        <button className="btn-ghost h-10" disabled={!teamId} onClick={() => downloadTemplate(tid, teamId).catch((e) => toast.error(apiError(e)))} data-testid="roster-admin-template-download"><Download className="h-4 w-4" /> Modulo Excel</button>
        <label className={`btn-gold h-10 cursor-pointer ${busy || !teamId ? "opacity-60 pointer-events-none" : ""}`} data-testid="roster-admin-upload-label"><Upload className="h-4 w-4" /> {busy ? "Leggo il file…" : "Carica modulo compilato"}<input type="file" accept=".xlsx" className="hidden" onChange={(e) => { upload(e.target.files[0]); e.target.value = ""; }} data-testid="roster-admin-upload-input" /></label>
      </div>
      {pendingGroups.length > 0 && (
        <div className="rounded-xl border border-fsl-warning/40 bg-fsl-warning/5 p-3 space-y-2" data-testid="pending-groups">
          <div className="flex items-center gap-2 text-sm font-semibold"><span className="h-6 px-2 rounded-full bg-fsl-warning text-ink-950 text-[11px] font-bold num" data-testid="pending-groups-count">{pendingGroups.length}</span> Gruppi proposti dalle società da confermare</div>
          {pendingGroups.map((t) => <div key={t.id} className="min-h-[44px] flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" data-testid={`pending-group-${t.id}`}><span className="font-display font-extrabold text-xl num text-fsl-gold">{t.category}</span><span className="flex-1 min-w-0 truncate"><span className="font-semibold">{t.club?.name}</span> · {t.name}{t.birth_year ? ` · anno ${t.birth_year}` : ""}{t.level ? ` · ${t.level}` : ""}{t.description ? <span className="text-fsl-slate"> · {t.description}</span> : null}</span>{list.some((i) => i.team_id === t.id && i.status === "submitted") && <span className="h-6 px-2 rounded text-[10px] font-bold uppercase inline-flex items-center bg-fsl-warning text-ink-950">rosa già inviata</span>}<button className="btn-ghost h-9 text-fsl-danger" onClick={() => rejectGroup(t)} data-testid={`pending-group-reject-${t.id}`}><XCircle className="h-4 w-4" /></button><button className="btn-gold h-9" onClick={() => confirmGroup(t)} data-testid={`pending-group-confirm-${t.id}`}><CheckCircle2 className="h-4 w-4" /> Conferma gruppo</button></div>)}
        </div>
      )}
      {list.length > 0 && <div className="divide-y divide-white/[0.06]">{list.slice(0, 8).map((i) => <div key={i.id} className="min-h-[48px] py-1.5 px-2 flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-1 text-sm" data-testid={`roster-import-row-${i.id}`}><span className={`h-6 px-2 rounded text-[10px] font-bold uppercase inline-flex items-center shrink-0 ${STATUS[i.status][1]}`}>{STATUS[i.status][0]}</span><span className="flex-1 min-w-0 truncate"><span className="font-semibold">{i.club_name}</span> · {i.team_label} · {i.rows.length} giocatori</span>{i.team_status === "pending" && <span className="h-6 px-2 rounded text-[10px] font-bold uppercase inline-flex items-center shrink-0 border border-fsl-warning/50 text-fsl-warning" data-testid={`roster-import-group-pending-${i.id}`}>gruppo da confermare</span>}{i.error_count ? <span className="h-6 px-2 rounded-full border border-fsl-warning/50 text-fsl-warning text-[10px] font-bold inline-flex items-center shrink-0 num" data-testid={`roster-import-anomalies-${i.id}`}>{i.error_count} anomalie</span> : null}<span className="text-xs text-fsl-slate num">{fmtDate(i.created_at, { time: true })}</span>{i.status === "submitted" && <button className="btn-gold h-9" onClick={() => setReview(i)} data-testid={`roster-import-review-${i.id}`}>Rivedi e carica</button>}</div>)}</div>}
      {review && <ReviewDialog tid={tid} imp={review} onClose={() => setReview(null)} onDone={() => { setReview(null); load(); reloadTeams(); onImported?.(); }} />}
    </section>
  );
}


const EMPTY_REQ = { first_name: "", last_name: "", role: "", shirt_number: "", birth_year: "", note: "" };

// Pannello «Modulo rosa» per l'Area Società (home e profilo): scelta squadra + download/upload.
export function RosterModulePanel({ tid, teams = [] }) {
  const [teamId, setTeamId] = useState(teams[0]?.id || "");
  useEffect(() => { if (!teamId && teams[0]) setTeamId(teams[0].id); }, [teams, teamId]);
  if (!tid || teams.length === 0) return null;
  return (
    <section data-testid="roster-module-panel">
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <h2 className="fsl-section-title flex items-center gap-2"><FileSpreadsheet className="h-5 w-5 text-fsl-gold" /> Modulo rosa Excel</h2>
        <select className="fsl-input w-auto min-w-[220px] h-10" value={teamId} onChange={(e) => setTeamId(e.target.value)} data-testid="roster-module-team-select">{teams.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.category}</option>)}</select>
        <Link to="/societa/rose" className="text-xs text-fsl-gold hover:underline ml-auto" data-testid="roster-module-go-rose">Vai alle rose →</Link>
      </div>
      <RosterImportClub tid={tid} teamId={teamId} />
    </section>
  );
}

function AddPlayerRequest({ tid, teamId, onDone }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(EMPTY_REQ);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      await api.post(`/tournaments/${tid}/roster-imports/request-player`, { team_id: teamId, ...f, shirt_number: f.shirt_number === "" ? null : Number(f.shirt_number), birth_year: f.birth_year === "" ? null : Number(f.birth_year) });
      toast.success("Richiesta inviata all'organizzazione: il giocatore sarà aggiunto dopo l'approvazione"); setF(EMPTY_REQ); setOpen(false); onDone();
    } catch (err) { toast.error(apiError(err)); } finally { setBusy(false); }
  };
  return (
    <div className="rounded-md border border-dashed border-white/20 p-3" data-testid="roster-add-request">
      <div className="flex flex-wrap items-center gap-2 text-xs text-fsl-slate"><span className="flex-1 min-w-[200px]">La rosa non cambia durante il torneo: per aggiungere un giocatore invia una richiesta all'organizzazione.</span><button type="button" className="btn-ghost h-9" disabled={!teamId} onClick={() => setOpen((v) => !v)} data-testid="roster-add-toggle">{open ? "Chiudi" : "Richiedi aggiunta giocatore"}</button></div>
      {open && (
        <form onSubmit={submit} className="mt-3 grid grid-cols-2 sm:grid-cols-6 gap-2" data-testid="roster-add-form">
          <input className="fsl-input h-10 sm:col-span-2" placeholder="Nome" required value={f.first_name} onChange={(e) => setF({ ...f, first_name: e.target.value })} data-testid="roster-add-first" />
          <input className="fsl-input h-10 sm:col-span-2" placeholder="Cognome" required value={f.last_name} onChange={(e) => setF({ ...f, last_name: e.target.value })} data-testid="roster-add-last" />
          <select className="fsl-input h-10" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} data-testid="roster-add-role"><option value="">Ruolo</option>{["Portiere", "Difensore", "Centrocampista", "Attaccante"].map((r) => <option key={r} value={r}>{r}</option>)}</select>
          <input type="number" min="1" max="99" className="fsl-input h-10 num" placeholder="N. maglia" value={f.shirt_number} onChange={(e) => setF({ ...f, shirt_number: e.target.value })} data-testid="roster-add-shirt" />
          <input type="number" className="fsl-input h-10 num sm:col-span-1" placeholder="Anno nascita" value={f.birth_year} onChange={(e) => setF({ ...f, birth_year: e.target.value })} data-testid="roster-add-year" />
          <input className="fsl-input h-10 sm:col-span-3" placeholder="Motivo (es. nuovo tesserato, trasferimento)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} data-testid="roster-add-note" />
          <button className="btn-gold h-10 sm:col-span-2" disabled={busy} data-testid="roster-add-submit">Invia richiesta</button>
        </form>
      )}
    </div>
  );
}
