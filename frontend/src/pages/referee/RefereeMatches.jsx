import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ClipboardList } from "lucide-react";
import { MatchCard } from "@/components/fsl/MatchCard";
import MatchWorkspace from "@/components/fsl/MatchWorkspace";
import { EmptyState, ErrorState, LoadingState } from "@/components/fsl/States";
import { api, apiError } from "@/lib/api";

export default function RefereeMatches() {
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { api.get("/me/referee/matches").then((r) => setList(r.data)).catch(setError); }, []);
  if (error) return <ErrorState message={apiError(error)} />;
  if (!list) return <LoadingState />;
  const todo = list.filter((m) => !["official", "rectified", "cancelled"].includes(m.status));
  const done = list.filter((m) => ["official", "rectified"].includes(m.status));
  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-extrabold">Le mie partite</h1>
      {list.length === 0 ? <EmptyState icon={ClipboardList} title="Nessuna gara assegnata" description="Quando il Direttore ti assegnerà una gara la troverai qui." testId="referee-empty" /> : (
        <>
          <section><h2 className="fsl-kicker mb-2">Da arbitrare ({todo.length})</h2><div className="space-y-2" data-testid="referee-todo">{todo.map((m) => <MatchCard key={m.id} m={m} to={`/arbitro/partite/${m.tournament.id}/${m.id}`} compact />)}</div></section>
          {done.length > 0 && <section><h2 className="fsl-kicker mb-2">Referti inviati ({done.length})</h2><div className="space-y-2">{done.map((m) => <MatchCard key={m.id} m={m} to={`/arbitro/partite/${m.tournament.id}/${m.id}`} compact />)}</div></section>}
        </>
      )}
    </div>
  );
}

export function RefereeMatch() {
  const { tournamentId } = useParams();
  return <div><Link to="/arbitro" className="text-xs text-fsl-gold" data-testid="referee-back">← Le mie partite</Link><div className="mt-3"><MatchWorkspace tournamentId={tournamentId} compact /></div></div>;
}

export function RefereeModule({ title }) {
  return <EmptyState icon={ClipboardList} title={title} description="Apri una gara assegnata per gestire eventi, convocazioni e note." testId={`referee-module-${title.toLowerCase()}`} />;
}
