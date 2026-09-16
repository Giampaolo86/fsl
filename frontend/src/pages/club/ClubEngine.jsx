import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, ClipboardList, Flag } from "lucide-react";
import { toast } from "sonner";
import { MatchCard } from "@/components/fsl/MatchCard";
import MatchWorkspace from "@/components/fsl/MatchWorkspace";
import { PageHeader } from "@/components/fsl/Primitives";
import { EmptyState, ErrorState, LoadingState } from "@/components/fsl/States";
import { useMyClub } from "./ClubDashboard";
import { api, apiError } from "@/lib/api";

export function ClubCalendar() {
  const { data, error, membership } = useMyClub();
  const [list, setList] = useState(null);
  useEffect(() => { if (membership) api.get(`/tournaments/${membership.tournament_id}/matches`).then((r) => setList(r.data)); }, [membership]);
  if (error) return <ErrorState message={apiError(error)} />;
  if (!data || !list) return <LoadingState />;
  return (
    <div>
      <PageHeader kicker={data.tournament.name} title="Calendario" subtitle={`${list.length} gare delle tue squadre. Convoca i giocatori aprendo la gara.`} />
      {list.length === 0 ? <EmptyState icon={CalendarDays} title="Nessuna gara programmata" /> : <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">{list.map((m) => <MatchCard key={m.id} m={m} to={`/societa/partite/${m.id}`} />)}</div>}
    </div>
  );
}

export function ClubReports() {
  const { data, membership } = useMyClub();
  const [list, setList] = useState(null);
  const [matches, setMatches] = useState([]);
  const [form, setForm] = useState({ match_id: "", subject: "", description: "" });
  const load = () => membership && api.get(`/tournaments/${membership.tournament_id}/error-reports`).then((r) => setList(r.data));
  useEffect(() => { load(); if (membership) api.get(`/tournaments/${membership.tournament_id}/matches`).then((r) => setMatches(r.data)); }, [membership]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!data || !list) return <LoadingState />;
  const send = async () => { try { await api.post(`/tournaments/${membership.tournament_id}/error-reports`, { ...form, match_id: form.match_id || null }); toast.success("Segnalazione inviata al Direttore"); setForm({ match_id: "", subject: "", description: "" }); load(); } catch (e) { toast.error(apiError(e)); } };
  return (
    <div className="grid lg:grid-cols-[1fr_1.2fr] gap-4">
      <div><PageHeader kicker="Segnalazioni" title="Segnala un errore" subtitle="La segnalazione crea un ticket per il Direttore: non sospende il risultato né modifica la classifica." />
        <div className="fsl-card p-5 grid gap-3" data-testid="club-report-form">
          <select className="fsl-input" value={form.match_id} onChange={(e) => setForm({ ...form, match_id: e.target.value })} data-testid="club-report-match"><option value="">Gara collegata (opzionale)</option>{matches.map((m) => <option key={m.id} value={m.id}>{m.round_name} · {m.home.club?.short_name} - {m.away.club?.short_name}</option>)}</select>
          <input className="fsl-input" placeholder="Oggetto" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} data-testid="club-report-subject" />
          <textarea className="fsl-input h-28 py-2" placeholder="Descrivi l'errore (risultato, marcatore, orario…)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} data-testid="club-report-description" />
          <button className="btn-primary" disabled={!form.subject || form.description.length < 5} onClick={send} data-testid="club-report-submit"><Flag className="h-4 w-4" /> Invia segnalazione</button>
        </div></div>
      <div><h2 className="fsl-section-title mb-3 mt-2">Le mie segnalazioni</h2>
        {list.length === 0 ? <EmptyState icon={ClipboardList} title="Nessuna segnalazione" /> : <div className="space-y-2">{list.map((e) => <div key={e.id} className="fsl-card p-4 text-sm" data-testid={`club-ticket-${e.id}`}><div className="flex justify-between text-xs"><span className="uppercase font-semibold text-fsl-gold">{{ open: "Aperta", reviewing: "In revisione", resolved: "Risolta", rejected: "Respinta" }[e.status]}</span></div><b>{e.subject}</b><p className="text-fsl-slate">{e.description}</p>{e.resolution && <p className="text-xs mt-1">Esito: {e.resolution}</p>}</div>)}</div>}</div>
    </div>
  );
}

export function ClubMatch() {
  const { membership } = useMyClub();
  if (!membership) return <LoadingState />;
  return <div><Link to="/societa/calendario" className="text-xs text-fsl-gold">← Calendario</Link><div className="mt-3"><MatchWorkspace tournamentId={membership.tournament_id} /></div></div>;
}
