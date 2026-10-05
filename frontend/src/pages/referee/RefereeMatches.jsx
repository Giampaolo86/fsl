import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, ClipboardList, PlayCircle, Timer } from "lucide-react";
import { MatchCard } from "@/components/fsl/MatchCard";
import MatchWorkspace from "@/components/fsl/MatchWorkspace";
import { EmptyState, ErrorState, LoadingState } from "@/components/fsl/States";
import { api, apiError } from "@/lib/api";
import { fmtDate } from "@/lib/format";

const FINAL = ["official", "rectified"];
const isToday = (iso) => iso && new Date(iso).toDateString() === new Date().toDateString();

export default function RefereeMatches({ done = false }) {
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { api.get("/me/referee/matches").then((r) => setList(r.data)).catch(setError); }, []);
  if (error) return <ErrorState message={apiError(error)} />;
  if (!list) return <LoadingState />;
  const sorted = [...list].sort((a, b) => (a.kickoff_at || "").localeCompare(b.kickoff_at || ""));
  const todo = sorted.filter((m) => !FINAL.includes(m.status) && m.status !== "cancelled");
  const sent = sorted.filter((m) => FINAL.includes(m.status)).reverse();
  const to = (m) => `/arbitro/partite/${m.tournament.id}/${m.id}`;
  if (done) {
    return (
      <div className="space-y-4" data-testid="referee-reports">
        <h1 className="text-3xl font-extrabold">Referti inviati</h1>
        {sent.length === 0 ? <EmptyState icon={CheckCircle2} title="Nessun referto inviato" description="Le gare chiuse con tabellino ufficiale compariranno qui." testId="referee-reports-empty" /> : <div className="space-y-2">{sent.map((m) => <MatchCard key={m.id} m={m} to={to(m)} compact />)}</div>}
      </div>
    );
  }
  const live = todo.find((m) => m.status === "in_progress");
  const next = live || todo.find((m) => isToday(m.kickoff_at)) || todo[0];
  const rest = todo.filter((m) => m.id !== next?.id);
  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-extrabold">Le mie partite</h1>
      {list.length === 0 ? <EmptyState icon={ClipboardList} title="Nessuna gara assegnata" description="Quando il Direttore ti assegnerà una gara la troverai qui." testId="referee-empty" /> : todo.length === 0 ? <EmptyState icon={CheckCircle2} title="Tutto arbitrato" description="Nessuna gara in programma: i referti inviati sono nella tab Referti." testId="referee-all-done" /> : (
        <>
          {next && (
            <section className="fsl-card-gold p-4 space-y-3" data-testid="referee-next">
              <div className="flex items-center justify-between"><span className="fsl-kicker flex items-center gap-1.5">{live ? <><PlayCircle className="h-4 w-4" /> In corso</> : isToday(next.kickoff_at) ? <><Timer className="h-4 w-4" /> Oggi</> : "Prossima gara"}</span><span className="text-xs text-fsl-slate num">{fmtDate(next.kickoff_at, { time: true })}</span></div>
              <MatchCard m={next} to={to(next)} compact />
              <Link to={to(next)} className="btn-gold w-full" data-testid="referee-open-next"><ClipboardList className="h-4 w-4" /> Apri il tabellino</Link>
            </section>
          )}
          {rest.length > 0 && <section><h2 className="fsl-kicker mb-2">Da arbitrare ({rest.length})</h2><div className="space-y-2" data-testid="referee-todo">{rest.map((m) => <MatchCard key={m.id} m={m} to={to(m)} compact />)}</div></section>}
          {sent.length > 0 && <Link to="/arbitro/referti" className="block text-center text-xs text-fsl-gold" data-testid="referee-to-reports">Referti inviati ({sent.length}) →</Link>}
        </>
      )}
    </div>
  );
}

export function RefereeMatch() {
  const { tournamentId } = useParams();
  return (
    <div>
      <Link to="/arbitro" className="btn-ghost h-11 mb-3" data-testid="referee-back"><ArrowLeft className="h-4 w-4" /> Le mie partite</Link>
      <MatchWorkspace tournamentId={tournamentId} compact />
    </div>
  );
}

