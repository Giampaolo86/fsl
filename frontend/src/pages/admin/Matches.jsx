import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CalendarClock, CalendarPlus, LayoutGrid, List, Pencil, Plus, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/fsl/Primitives";
import { MatchCard, MATCH_STATUS } from "@/components/fsl/MatchCard";
import { EmptyState, ErrorState, LoadingState } from "@/components/fsl/States";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useScoped, useTournamentDetail } from "@/hooks/useTournamentData";
import { api, apiError } from "@/lib/api";
import { CalendarGrid } from "@/components/fsl/CalendarStudio";
import { SimpleMatchEdit } from "@/components/fsl/SimpleMatchEdit";
import { RefereeAssignments } from "@/components/fsl/RefereeAssignments";

export default function Matches({ mode = "matches" }) {
  const { data: t, reload: reloadT } = useTournamentDetail();
  const [params, setParams] = useSearchParams();
  const comps = useScoped("competitions");
  const teams = useScoped("teams");
  const fields = useScoped("venues");
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  const [create, setCreate] = useState(false);
  const [editM, setEditM] = useState(null);
  const [form, setForm] = useState({ competition_id: "", home_team_id: "", away_team_id: "", kickoff_at: "", field_id: "", match_day: 1 });
  const [busy, setBusy] = useState(false);
  const comp = params.get("comp") || "";
  const status = params.get("status") || (mode === "reports" ? "in_progress,finished,report_submitted,under_review,official,rectified" : "");
  const day = params.get("day") || "";
  const upcoming = params.get("upcoming") === "1";
  const view = params.get("view") || "list";
  const setView = (v) => setP("view", v === "list" ? "" : v);

  const load = () => {
    if (!t) return;
    api.get(`/tournaments/${t.id}/matches`, { params: { competition_id: comp || undefined, status: status || undefined, date: day || undefined, upcoming_days: upcoming ? 7 : undefined } }).then((r) => setList(r.data)).catch(setError);
  };
  const refreshAll = () => { load(); teams.reload?.(); reloadT(); };
  useEffect(load, [t?.id, comp, status, day, upcoming]); // eslint-disable-line react-hooks/exhaustive-deps

  const setP = (k, v) => { const p = new URLSearchParams(params); v ? p.set(k, v) : p.delete(k); setParams(p); };
  const byRound = useMemo(() => {
    const g = {};
    (list || []).forEach((m) => { const k = m.stage === "finals" ? `Fase finale · ${m.round_name}` : m.round_name; (g[k] = g[k] || []).push(m); });
    return g;
  }, [list]);

  if (!t || comps.loading) return <LoadingState />;
  if (error) return <ErrorState message={apiError(error)} onRetry={load} />;
  const canWrite = ["super_admin", "director"].includes(t.my_role) && !t.read_only;
  const fieldList = fields.data?.fields || [];
  const teamList = (teams.data || []).map((tm) => ({ ...tm, name: tm.name || tm.club?.name }));
  const draftCount = (list || []).filter((m) => m.status === "draft").length;
  const submitCreate = async () => {
    setBusy(true);
    try {
      await api.post(`/tournaments/${t.id}/matches`, { ...form, match_day: Number(form.match_day), field_id: form.field_id || null });
      toast.success("Gara creata"); setCreate(false); load();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  const compTeams = (teams.data || []).filter((tm) => tm.competition_id === form.competition_id);

  return (
    <div>
      <PageHeader
        kicker={mode === "reports" ? "Referti, risultati e disciplina" : "Elenco gare, arbitri e campi"}
        title={mode === "reports" ? "Referti" : "Partite"}
        subtitle={mode === "reports" ? "Gare in corso, referti inviati e risultati ufficiali. Solo il Direttore ufficializza o rettifica." : `${list?.length ?? 0} gare${draftCount ? ` (${draftCount} in bozza, non visibili al pubblico)` : ""} · ${t.counts.fields} campi × ${t.settings.slots.length} slot`}
        actions={canWrite && mode !== "reports" && (
          <button className="btn-ghost" onClick={() => setCreate(true)} data-testid="matches-create-button"><Plus className="h-4 w-4" /> Nuova gara</button>
        )}
      />
      <div className="fsl-card px-4 py-3 mb-4 flex flex-col md:flex-row gap-3">
        <select className="fsl-input md:w-64" value={comp} onChange={(e) => setP("comp", e.target.value)} data-testid="matches-filter-competition"><option value="">Tutte le competizioni</option>{comps.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        {mode !== "reports" && <select className="fsl-input md:w-48" value={status} onChange={(e) => setP("status", e.target.value)} data-testid="matches-filter-status"><option value="">Tutti gli stati</option>{Object.entries(MATCH_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>}
        <input type="date" className="fsl-input md:w-48" value={day} onChange={(e) => setP("day", e.target.value)} data-testid="matches-filter-date" aria-label="Data" />
        <button type="button" onClick={() => { const p = new URLSearchParams(params); if (upcoming) p.delete("upcoming"); else { p.set("upcoming", "1"); p.delete("day"); } setParams(p); }} className={`${upcoming ? "btn-gold" : "btn-ghost"} md:ml-auto`} aria-pressed={upcoming} data-testid="matches-upcoming-button"><CalendarClock className="h-4 w-4" /> Prossimi impegni · 7 giorni</button>
        {mode !== "reports" && <button type="button" className="btn-ghost" onClick={() => setView(view === "grid" ? "list" : "grid")} data-testid="matches-view-toggle">{view === "grid" ? <><List className="h-4 w-4" /> Vista elenco</> : <><LayoutGrid className="h-4 w-4" /> Vista campi/orari</>}</button>}
        {mode !== "reports" && <button type="button" className={view === "referees" ? "btn-gold" : "btn-ghost"} onClick={() => setView(view === "referees" ? "list" : "referees")} aria-pressed={view === "referees"} data-testid="matches-referees-button"><UserCheck className="h-4 w-4" /> Designazioni arbitri</button>}
      </div>
      {upcoming && <p className="text-xs text-fsl-slate -mt-2 mb-4" data-testid="matches-upcoming-hint">Gare da oggi ai prossimi 7 giorni: assegna arbitri e campi, verifica le distinte e organizza in anticipo.</p>}
      {!list ? <LoadingState /> : list.length === 0 ? (
        <EmptyState icon={CalendarPlus} title={upcoming ? "Nessuna gara nei prossimi 7 giorni" : "Nessuna gara"} description={upcoming ? "Nessun impegno in programma da oggi a 7 giorni: rimuovi il filtro per vedere tutto il calendario." : canWrite ? "Crea i gironi e genera il calendario dalla pagina «Gironi e Calendario»." : "Il calendario non è ancora stato pubblicato."} action={canWrite && !upcoming && mode !== "reports" && <Link to={`/admin/t/${t.id}/calendario`} className="btn-gold">Vai a Gironi e Calendario</Link>} testId="matches-empty" />
      ) : view === "referees" && mode !== "reports" ? <RefereeAssignments tid={t.id} list={list} onDone={load} canWrite={["super_admin", "director", "secretary"].includes(t.my_role) && !t.read_only} /> : view === "grid" && mode !== "reports" ? <CalendarGrid list={list} slots={t.settings.slots} fields={fieldList} onPick={(m) => canWrite ? setEditM(m) : null} /> : (
        <div className="space-y-6">
          {Object.entries(byRound).map(([round, ms]) => (
            <section key={round}>
              <h2 className="fsl-section-title mb-2">{round} <span className="text-fsl-slate text-sm font-sans normal-case">· {ms.length} gare</span></h2>
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">{ms.map((m) => <div key={m.id} className="relative group"><MatchCard m={m} to={`/admin/t/${t.id}/partite/${m.id}`} />{canWrite && mode !== "reports" && <button className="absolute top-2 right-2 h-8 w-8 rounded-full bg-ink-950/80 border border-white/15 inline-flex items-center justify-center opacity-80 hover:opacity-100 hover:border-fsl-gold" onClick={() => setEditM(m)} title="Modifica data, ora, campo, squadre" data-testid={`match-edit-${m.id}`}><Pencil className="h-3.5 w-3.5" /></button>}</div>)}</div>
            </section>
          ))}
        </div>
      )}
      {editM && <SimpleMatchEdit tid={t.id} m={editM} teams={teamList} fields={fieldList} onClose={() => setEditM(null)} onDone={refreshAll} />}
      <Dialog open={create} onOpenChange={setCreate}>
        <DialogContent className="bg-navy-800 border-white/20 text-fsl-white rounded-xl" aria-describedby={undefined} data-testid="match-create-dialog">
          <DialogHeader><DialogTitle className="font-display uppercase text-2xl">Nuova gara</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <select className="fsl-input" value={form.competition_id} onChange={(e) => setForm({ ...form, competition_id: e.target.value, home_team_id: "", away_team_id: "" })} data-testid="match-create-competition"><option value="">Competizione…</option>{comps.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <div className="grid grid-cols-2 gap-3">
              <select className="fsl-input" value={form.home_team_id} onChange={(e) => setForm({ ...form, home_team_id: e.target.value })} data-testid="match-create-home"><option value="">Casa…</option>{compTeams.map((tm) => <option key={tm.id} value={tm.id}>{tm.name || tm.club?.name}</option>)}</select>
              <select className="fsl-input" value={form.away_team_id} onChange={(e) => setForm({ ...form, away_team_id: e.target.value })} data-testid="match-create-away"><option value="">Trasferta…</option>{compTeams.map((tm) => <option key={tm.id} value={tm.id}>{tm.name || tm.club?.name}</option>)}</select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input type="datetime-local" className="fsl-input" value={form.kickoff_at} onChange={(e) => setForm({ ...form, kickoff_at: e.target.value })} data-testid="match-create-kickoff" />
              <select className="fsl-input" value={form.field_id} onChange={(e) => setForm({ ...form, field_id: e.target.value })} data-testid="match-create-field"><option value="">Campo…</option>{(fields.data?.fields || []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
            </div>
            <input type="number" min="1" className="fsl-input" value={form.match_day} onChange={(e) => setForm({ ...form, match_day: e.target.value })} aria-label="Giornata" />
          </div>
          <DialogFooter><button className="btn-ghost" onClick={() => setCreate(false)}>Annulla</button><button className="btn-primary" disabled={busy || !form.competition_id || !form.home_team_id || !form.away_team_id || !form.kickoff_at} onClick={submitCreate} data-testid="match-create-submit">Crea gara</button></DialogFooter>
        </DialogContent>
      </Dialog>
      {mode === "reports" && <p className="mt-6 text-xs text-fsl-slate">Apri una gara per verificare referto ed eventi, ufficializzare, rettificare con motivazione o riaprire. <Link to={`/admin/t/${t.id}/audit`} className="text-fsl-gold">Audit</Link></p>}
    </div>
  );
}
