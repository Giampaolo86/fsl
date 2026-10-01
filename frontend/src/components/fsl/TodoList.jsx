import { useEffect, useState } from "react";
import { CalendarClock, CheckCircle2, Circle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { fmtDate } from "@/lib/format";

const today = () => new Date().toISOString().slice(0, 10);

export function TodoList({ tournamentId, onChange }) {
  const [items, setItems] = useState([]);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => api.get(`/tournaments/${tournamentId}/todos`).then((r) => setItems(r.data)).catch(() => {});
  useEffect(() => { load(); }, [tournamentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      await api.post(`/tournaments/${tournamentId}/todos`, { title: title.trim(), due_date: due || null });
      setTitle(""); setDue("");
      await load(); onChange?.();
    } catch (err) { toast.error(apiError(err)); } finally { setBusy(false); }
  };
  const toggle = async (t) => {
    try { await api.patch(`/tournaments/${tournamentId}/todos/${t.id}`, { done: !t.done }); await load(); onChange?.(); } catch (err) { toast.error(apiError(err)); }
  };
  const remove = async (t) => {
    try { await api.delete(`/tournaments/${tournamentId}/todos/${t.id}`); await load(); onChange?.(); } catch (err) { toast.error(apiError(err)); }
  };

  const open = items.filter((t) => !t.done).length;
  return (
    <div className="fsl-card p-5" data-testid="todo-list">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <div className="fsl-kicker">Le mie attività</div>
          <h2 className="font-display font-extrabold uppercase text-lg leading-none">Compiti e scadenze</h2>
        </div>
        <span className="text-xs text-fsl-slate num" data-testid="todo-open-count">{open} aperte</span>
      </div>
      <form onSubmit={add} className="flex flex-col sm:flex-row gap-2 mb-3">
        <input className="fsl-input flex-1" placeholder="Es. Ordinare le medaglie, chiamare il bar…" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} data-testid="todo-title-input" aria-label="Nuova attività" />
        <input type="date" className="fsl-input sm:w-40" value={due} onChange={(e) => setDue(e.target.value)} data-testid="todo-due-input" aria-label="Scadenza" />
        <button type="submit" className="btn-gold sm:w-auto" disabled={busy || !title.trim()} data-testid="todo-add-button"><Plus className="h-4 w-4" aria-hidden="true" /> Aggiungi</button>
      </form>
      {items.length === 0 ? (
        <p className="text-sm text-fsl-slate py-4 text-center" data-testid="todo-empty">Nessuna attività: aggiungi i compiti fuori piattaforma che vuoi tenere sotto controllo.</p>
      ) : (
        <ul className="divide-y divide-white/[0.06]">
          {items.map((t) => {
            const overdue = !t.done && t.due_date && t.due_date < today();
            return (
              <li key={t.id} className="flex items-center gap-3 py-2.5 group" data-testid={`todo-item-${t.id}`}>
                <button type="button" onClick={() => toggle(t)} aria-label={t.done ? "Riapri" : "Completa"} data-testid={`todo-toggle-${t.id}`} className="shrink-0">
                  {t.done ? <CheckCircle2 className="h-5 w-5 text-fsl-success" aria-hidden="true" /> : <Circle className={`h-5 w-5 ${overdue ? "text-fsl-danger" : "text-fsl-slate/60"} hover:text-fsl-gold`} aria-hidden="true" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className={`text-sm font-semibold ${t.done ? "text-fsl-slate line-through decoration-white/30" : ""}`}>{t.title}</div>
                  {t.due_date && <div className={`text-xs inline-flex items-center gap-1 ${overdue ? "text-fsl-danger" : "text-fsl-slate"}`}><CalendarClock className="h-3 w-3" aria-hidden="true" /> {overdue ? "Scaduta il" : "Entro il"} {fmtDate(t.due_date)}</div>}
                </div>
                <button type="button" onClick={() => remove(t)} className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-fsl-slate hover:text-fsl-danger transition-opacity" aria-label="Elimina" data-testid={`todo-delete-${t.id}`}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
