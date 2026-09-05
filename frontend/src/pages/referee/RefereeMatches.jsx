import { useEffect, useState } from "react";
import { ClipboardList } from "lucide-react";
import { EmptyState, ErrorState, LoadingState } from "@/components/fsl/States";
import { api, apiError } from "@/lib/api";

export default function RefereeMatches() {
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    api.get("/me/referee/matches").then((r) => setList(r.data)).catch(setError);
  }, []);
  if (error) return <ErrorState message={apiError(error)} />;
  if (!list) return <LoadingState />;
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-extrabold">La mia partita</h1>
      {list.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Nessuna gara assegnata" description="Quando il Direttore ti assegnerà una gara la troverai qui con checklist pre-partita, live referee e invio referto (Fase 4)." testId="referee-empty" />
      ) : (
        list.map((m) => <div key={m._id} className="fsl-card p-4">{m.home_team_name} vs {m.away_team_name}</div>)
      )}
    </div>
  );
}

export function RefereeModule({ title }) {
  return <EmptyState icon={ClipboardList} title={title} description="Disponibile durante una gara assegnata (Fase 4)." testId={`referee-module-${title.toLowerCase()}`} />;
}
