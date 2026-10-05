import { useEffect, useRef, useState } from "react";
import { Bot, Check, History, ImagePlus, LayoutGrid, Loader2, Send, Sparkles, X } from "lucide-react";
import { PlanPreviewDialog } from "@/components/fsl/PlanPreviewDialog";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";

const TOOL_LABEL = { groups: "Gironi", calendar: "Calendario gironi", breaks: "Pause", finals: "Fase finale", extra_matches: "Gare libere" };
const sid = (tid, cat) => `cal-${tid}-${cat}`.replace(/[^a-zA-Z0-9_-]/g, "-");

function PlanCard({ plan, onApply, busy, applied, tid, category }) {
  const [preview, setPreview] = useState(false);
  return (
    <div className="rounded-lg border border-fsl-gold/50 bg-fsl-gold/10 p-3 space-y-2" data-testid="ai-plan">
      <div className="flex items-center gap-2 text-fsl-gold font-display font-extrabold uppercase text-sm"><Sparkles className="h-4 w-4" /> Piano proposto</div>
      {plan.summary && <p className="text-xs text-fsl-white/85">{plan.summary}</p>}
      <ol className="space-y-1 text-xs">
        {plan.steps.map((s, i) => (
          <li key={i} className="flex gap-2"><span className="num text-fsl-gold w-4 shrink-0">{i + 1}.</span><span><b>{TOOL_LABEL[s.tool] || s.tool}</b> <span className="text-fsl-slate break-all">{summarize(s)}</span></span></li>
        ))}
      </ol>
      {applied ? <div className="text-xs text-fsl-success inline-flex items-center gap-1"><Check className="h-3.5 w-3.5" /> Applicato · ogni gara resta modificabile dalla griglia</div> : (
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-ghost h-9" disabled={busy} onClick={() => setPreview(true)} data-testid="ai-plan-preview"><LayoutGrid className="h-4 w-4" /> Anteprima griglia</button>
          <button className="btn-gold h-9" disabled={busy} onClick={onApply} data-testid="ai-plan-apply">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Applica il piano</button>
        </div>
      )}
      <PlanPreviewDialog open={preview} onOpenChange={setPreview} tid={tid} category={category} plan={plan} applying={busy} onApply={async () => { const ok = await onApply(true); if (ok) setPreview(false); }} />
    </div>
  );
}

function summarize(s) {
  const a = s.args || {};
  if (s.tool === "groups") return `${a.count} × ${a.teams_per_group} squadre`;
  if (s.tool === "calendar") return `${(a.sessions || []).map((x) => `${x.date} ${x.start_time}–${x.end_time}`).join(", ")} · ${a.fields_count} campi · ${a.match_minutes}'+${a.buffer_minutes}'`;
  if (s.tool === "breaks") return (Array.isArray(a) ? a : a.items || a.breaks || []).map((b) => `${b.label} ${b.date} ${b.start_time}–${b.end_time}`).join(", ");
  if (s.tool === "finals") return `${a.mode === "placement" ? "tutte a premio" : "eliminazione diretta"} · ${a.teams} squadre · ${a.date} ${a.start_time}`;
  if (s.tool === "extra_matches") return `${(Array.isArray(a) ? a : a.items || []).length} gare`;
  return JSON.stringify(a);
}

export function AiCalendarAssistant({ tid, board, onApplied, onClose }) {
  const session = sid(tid, board.category);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState({});
  const end = useRef(null);
  const [formats, setFormats] = useState([]);
  const [images, setImages] = useState([]);
  const addFiles = (files) => {
    [...files].filter((f) => f.type.startsWith("image/")).slice(0, 4 - images.length).forEach((f) => {
      if (f.size > 4 * 1024 * 1024) return toast.error(`${f.name}: massimo 4 MB`);
      const fr = new FileReader(); fr.onload = () => setImages((im) => [...im, { name: f.name, data: fr.result }]); fr.readAsDataURL(f);
    });
  };
  useEffect(() => { api.get(`/ai/tournaments/${tid}/calendar/chat/${session}`).then((r) => setMsgs(r.data)).catch(() => {}); api.get(`/ai/tournaments/${tid}/calendar/formats`).then((r) => setFormats(r.data)).catch(() => {}); }, [tid, session]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);
  const sendMessage = async (message, display) => {
    if ((!message && !images.length) || busy) return;
    const imgs = images.map((i) => i.data);
    const msg = message || "Ecco il programma in immagine: leggilo e proponimi il piano.";
    setText(""); setImages([]); setBusy(true);
    setMsgs((m) => [...m, { role: "user", content: (display || msg) + (imgs.length ? `\n📎 ${imgs.length} immagine/i allegata/e` : ""), images: imgs }]);
    try {
      const { data } = await api.post(`/ai/tournaments/${tid}/calendar/chat`, { category: board.category, session_id: session, message: msg, display: display || null, images: imgs });
      setMsgs((m) => [...m, { role: "assistant", content: data.reply, plan: data.plan }]);
    } catch (err) { toast.error(apiError(err)); } finally { setBusy(false); }
  };
  const send = (e) => { e?.preventDefault(); sendMessage(text.trim()); };
  const reuseAndSend = (f) => {
    const same = f.tournament_id === tid && f.category === board.category;
    sendMessage(`Riproponi il formato salvato «${f.name}»${same ? "" : ` (usato in ${f.tournament_name || "un torneo precedente"}, categoria ${f.category})`} per questa categoria, adattando le date al torneo attuale: se non conosci le date chiedimele, altrimenti dammi subito il piano. Piano di riferimento: ${JSON.stringify(f.plan)}`, `Riproponi il formato «${f.name.slice(0, 80)}» per questa categoria, adattando le date.`);
  };
  const apply = async (plan, idx, fromPreview = false) => {
    if (!fromPreview && !window.confirm("Applicare il piano? Gironi, calendario e fase finale verranno creati o rigenerati come descritto.")) return false;
    setApplying(true);
    try {
      const { data } = await api.post(`/ai/tournaments/${tid}/calendar/apply`, { category: board.category, plan });
      if (data.error) toast.error(`Fermato a: ${data.error}${data.done.length ? ` · fatto: ${data.done.join(", ")}` : ""}`, { duration: 9000 }); else toast.success(`Piano applicato: ${data.done.join(" · ")}. Ogni gara resta modificabile a mano.`, { duration: 7000 });
      setApplied((a) => ({ ...a, [idx]: !data.error }));
      onApplied(data);
      return !data.error;
    } catch (err) { toast.error(`Applicazione non riuscita: ${apiError(err)}. Nulla è stato perso: puoi riprovare o modificare il piano in chat.`, { duration: 9000 }); return false; } finally { setApplying(false); }
  };
  return (
    <aside className="fixed inset-y-0 right-0 z-40 w-full sm:w-[420px] bg-navy-800 border-l border-white/10 shadow-2xl flex flex-col" data-testid="ai-calendar-assistant">
      <div className="h-14 px-4 flex items-center gap-2 border-b border-white/10 bg-ink-950/60"><Bot className="h-5 w-5 text-fsl-gold" /><div className="leading-tight"><div className="font-display font-extrabold uppercase">Assistente calendario</div><div className="text-[10px] text-fsl-slate">Categoria {board.category} · nulla viene toccato senza «Applica»</div></div><button type="button" onClick={onClose} className="ml-auto h-9 w-9 inline-flex items-center justify-center rounded-full hover:bg-white/10" aria-label="Chiudi" data-testid="ai-close"><X className="h-4 w-4" /></button></div>
      <div className="flex-1 overflow-y-auto fsl-scroll p-4 space-y-3 text-sm">
        {formats.length > 0 && (
          <div className="rounded-lg border border-white/10 bg-ink-950/40 p-3 text-xs space-y-2" data-testid="ai-formats">
            <div className="flex items-center gap-1.5 text-fsl-gold font-display font-extrabold uppercase"><History className="h-3.5 w-3.5" /> Formati già usati</div>
            <div className="flex flex-wrap gap-1.5">{formats.map((f) => <button key={`${f.tournament_id}-${f.category}`} type="button" onClick={() => { setText(""); setTimeout(() => reuseAndSend(f), 0); }} className="h-8 px-3 rounded-full border border-white/15 hover:border-fsl-gold hover:text-fsl-gold text-left truncate max-w-full" title={f.name} data-testid={`ai-format-${f.category}`}>{f.tournament_name ? `${f.tournament_name} · ` : ""}{f.category} — {f.name.length > 60 ? f.name.slice(0, 60) + "…" : f.name}</button>)}</div>
            <p className="text-[10px] text-fsl-slate">Un clic: l'assistente ripropone lo stesso format adattando le date; poi «Applica».</p>
          </div>
        )}
        {msgs.length === 0 && (
          <div className="rounded-lg border border-white/10 bg-ink-950/40 p-3 text-xs text-fsl-slate space-y-2" data-testid="ai-intro">
            <p className="text-fsl-white/85">Spiegami il format a parole e ti propongo gironi, fasce orarie, pause e finali. Esempio:</p>
            <button type="button" className="text-left text-fsl-gold hover:underline" onClick={() => setText("8 squadre in 2 gironi da 4, sola andata. Sabato 12 dicembre 2026 dalle 9 alle 13 su 3 campi, gare da 20 minuti e 5 di pausa, pausa pranzo 13–14. Domenica 13 dalle 9:30 finali tutte a premio (anche l'8ª gioca).")} data-testid="ai-example">«8 squadre in 2 gironi da 4, sola andata. Sabato 12 dicembre dalle 9 alle 13 su 3 campi, gare da 20' + 5', pausa pranzo 13–14. Domenica dalle 9:30 finali tutte a premio.»</button>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`} data-testid={`ai-msg-${m.role}`}>
            <div className={`max-w-[92%] rounded-xl px-3 py-2 whitespace-pre-wrap leading-relaxed ${m.role === "user" ? "bg-fsl-gold text-ink-950 rounded-br-sm" : "bg-ink-950/60 border border-white/10 rounded-bl-sm"}`}>
              {m.images?.length > 0 && <div className="flex gap-1 mb-1">{m.images.map((src, k) => <img key={k} src={src} alt="" className="h-14 w-14 object-cover rounded border border-ink-950/20" />)}</div>}
              {m.content}
              {m.plan && <div className="mt-3"><PlanCard plan={m.plan} busy={applying} applied={applied[i]} tid={tid} category={board.category} onApply={(fromPreview) => apply(m.plan, i, fromPreview === true)} /></div>}
            </div>
          </div>
        ))}
        {busy && <div className="flex items-center gap-2 text-xs text-fsl-slate"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Sto ragionando sul format…</div>}
        <div ref={end} />
      </div>
      <form onSubmit={send} className="p-3 border-t border-white/10 space-y-2" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}>
        {images.length > 0 && <div className="flex flex-wrap gap-2" data-testid="ai-attachments">{images.map((im, k) => <div key={k} className="relative"><img src={im.data} alt={im.name} className="h-16 w-16 object-cover rounded-md border border-fsl-gold/50" /><button type="button" onClick={() => setImages((a) => a.filter((_, j) => j !== k))} className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-ink-950 border border-white/20 inline-flex items-center justify-center" aria-label="Rimuovi immagine" data-testid={`ai-attachment-remove-${k}`}><X className="h-3 w-3" /></button></div>)}</div>}
        <div className="flex gap-2">
          <label className="btn-ghost h-11 w-11 p-0 shrink-0 cursor-pointer" title="Allega foto o screenshot del programma (anche incollando)" data-testid="ai-attach"><ImagePlus className="h-4 w-4" /><input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} data-testid="ai-attach-input" /></label>
          <textarea className="fsl-input flex-1 min-h-[44px] max-h-32 py-2 resize-none" rows={2} placeholder="Descrivi il format, incolla/allega una foto del programma, o rispondi…" value={text} onChange={(e) => setText(e.target.value)} onPaste={(e) => { const fs = [...e.clipboardData.files]; if (fs.length) { e.preventDefault(); addFiles(fs); } }} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) send(e); }} data-testid="ai-input" />
          <button type="submit" className="btn-gold h-11 w-11 p-0 shrink-0" disabled={busy || (!text.trim() && !images.length)} aria-label="Invia" data-testid="ai-send"><Send className="h-4 w-4" /></button>
        </div>
      </form>
    </aside>
  );
}
