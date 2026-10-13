import { useState } from "react";
import { AlertTriangle, CheckCircle2, FileUp, Upload } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, apiError } from "@/lib/api";

export function CsvImportDialog({ tid, onClose, onDone }) {
  const [file, setFile] = useState(null);
  const [option, setOption] = useState("");
  const [preview, setPreview] = useState(null);
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async (f, opt) => {
    if (!f) return;
    setBusy(true);
    const fd = new FormData(); fd.append("file", f); fd.append("option", opt ?? "");
    try { const { data } = await api.post(`/tournaments/${tid}/simple/import-csv/preview`, fd, { headers: { "Content-Type": "multipart/form-data" } }); setPreview(data); if (opt == null || opt === "") setOption(data.option || ""); } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  const apply = async () => {
    setBusy(true);
    const fd = new FormData(); fd.append("file", file); fd.append("option", option); fd.append("replace", replace ? "true" : "false");
    try {
      const { data } = await api.post(`/tournaments/${tid}/simple/import-csv/apply`, fd, { headers: { "Content-Type": "multipart/form-data" }, timeout: 300000 });
      const tot = data.report.reduce((a, r) => a + r.matches_created, 0);
      toast.success(`Importate ${tot} gare in ${data.report.length} categorie`);
      onDone(data);
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  const needsReplace = preview?.categories.some((c) => c.existing.matches > 0);
  const blocked = preview?.problems.some((p) => p.startsWith("Riga")) || preview?.categories.some((c) => c.existing.played > 0);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-navy-800 border-white/20 text-fsl-white rounded-xl max-w-3xl" data-testid="csv-import-dialog" aria-describedby={undefined}>
        <DialogHeader><DialogTitle className="font-display uppercase text-2xl">Importa calendario da CSV</DialogTitle></DialogHeader>
        <p className="text-xs text-fsl-slate">Tracciato «master gare»: colonne <code>Categoria; Girone; Turno; Squadra_casa; Squadra_ospite; Data; Inizio; Campo</code> (facoltative <code>Formato; Minuti_gioco; Cambio_minuti; Fine_slot</code>, oppure più opzioni di collocazione). Importa <strong>tutte le categorie</strong> in un colpo solo: crea gironi, squadre segnaposto (o usa quelle reali se il nome coincide), campi («Campo 1» = C1) e gare, e aggiorna le impostazioni del torneo (campi, giorni, orari, sessioni, squadre per girone, durate per categoria). Nulla viene scritto prima di «Importa».</p>
        <label className={`btn-gold h-10 cursor-pointer w-fit ${busy ? "opacity-60 pointer-events-none" : ""}`} data-testid="csv-import-file-label"><FileUp className="h-4 w-4" /> {file ? file.name : "Scegli il file CSV"}<input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files[0]; setFile(f); setPreview(null); setOption(""); run(f, ""); e.target.value = ""; }} data-testid="csv-import-file-input" /></label>
        {busy && !preview && <p className="text-sm text-fsl-slate">Analizzo il file…</p>}
        {preview && (
          <div className="space-y-3" data-testid="csv-import-preview">
            {preview.options.length > 1 && <label className="block"><span className="fsl-label">Collocazione da usare</span><select className="fsl-input mt-1" value={option} onChange={(e) => { setOption(e.target.value); run(file, e.target.value); }} data-testid="csv-import-option">{preview.options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</select></label>}
            <div className="fsl-card overflow-x-auto"><table className="w-full table-dark text-xs" data-testid="csv-import-table">
              <thead><tr><th>Categoria</th><th>Gironi</th><th>Squadre</th><th>Turni</th><th>Gare</th><th>Collocate</th><th>Da collocare</th><th>Formato</th><th>Periodo</th><th>Già presenti</th></tr></thead>
              <tbody>{preview.categories.map((c) => <tr key={c.category} data-testid={`csv-import-cat-${c.category}`}><td className="font-bold text-fsl-gold num">{c.category}</td><td>{Object.entries(c.groups).map(([g, n]) => `${g} (${n})`).join(" · ")}</td><td className="num">{c.teams}</td><td className="num">{c.rounds}</td><td className="num">{c.matches}</td><td className="num text-fsl-success">{c.placed}</td><td className={`num ${c.unplaced ? "text-fsl-warning" : ""}`}>{c.unplaced}</td><td className="num whitespace-nowrap">{[Object.keys(c.formato || {}).join("/"), c.match_minutes ? `${c.match_minutes}'${c.buffer_minutes != null ? `+${c.buffer_minutes}'` : ""}` : ""].filter(Boolean).join(" · ") || "—"}</td><td className="num">{c.from ? `${c.from} → ${c.to}` : "—"}</td><td className="num">{c.existing.matches}{c.existing.played ? ` (${c.existing.played} giocate!)` : ""}</td></tr>)}</tbody>
            </table></div>
            <div className="text-xs text-fsl-slate">Campi nel file: {preview.fields_needed.join(", ") || "—"}{preview.fields_to_create.length > 0 && <span> · verranno creati: <strong className="text-fsl-white">{preview.fields_to_create.join(", ")}</strong></span>}</div>
            {preview.settings?.sessions > 0 && <div className="rounded-md border border-fsl-gold/30 bg-fsl-gold/5 p-3 text-xs" data-testid="csv-import-settings"><span className="fsl-label block mb-1">Impostazioni che verranno aggiornate</span><span className="num">{preview.settings.fields_count} campi · {preview.settings.teams_per_series} squadre per girone · {(preview.settings.series || []).join(", ")} · {(preview.settings.match_days || []).map((d) => ({ mon: "lun", tue: "mar", wed: "mer", thu: "gio", fri: "ven", sat: "sab", sun: "dom" }[d] || d)).join("/")} {preview.settings.day_start}–{preview.settings.day_end} · {preview.settings.sessions} sessioni{Object.keys(preview.settings.duration_by_category || {}).length > 0 && <> · durate: {Object.entries(preview.settings.duration_by_category).map(([k, v]) => `${k} ${v.match_minutes}'+${v.buffer_minutes}'`).join(", ")}</>}</span></div>}
            {preview.problems.length > 0 ? <ul className="space-y-1" data-testid="csv-import-problems">{preview.problems.map((p, i) => <li key={i} className="text-xs text-fsl-warning flex items-start gap-1.5"><AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {p}</li>)}</ul> : <p className="text-xs text-fsl-success inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> Nessuna collisione: ogni slot campo/orario è unico e nessuna squadra gioca due gare allo stesso orario.</p>}
            {preview.categories.some((c) => c.unplaced > 0) && <p className="text-xs text-fsl-warning">Le gare «da collocare» non vengono create: potrai aggiungerle dalla griglia o importare l'opzione con più campi.</p>}
            {needsReplace && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} data-testid="csv-import-replace" /> Sostituisci il calendario dei gironi esistente nelle categorie del file (solo se nessuna gara è stata giocata)</label>}
          </div>
        )}
        <DialogFooter><button className="btn-ghost" onClick={onClose}>Annulla</button><button className="btn-gold" disabled={!preview || busy || blocked || (needsReplace && !replace)} onClick={apply} data-testid="csv-import-apply"><Upload className="h-4 w-4" /> {busy ? "Importo…" : "Importa"}</button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
