import { useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/fsl/Primitives";
import { ClubGroups } from "@/components/fsl/ClubGroups";

export function ClubTeams() {
  const [search] = useSearchParams();
  return (
    <div className="space-y-6" data-testid="club-teams-page">
      <PageHeader kicker="Area Società" title="Squadre e rose" subtitle="Le squadre sono della società, non del torneo: aggiungile qui, carica le rose (modulo Excel o foto) anche prima di qualsiasi competizione e chiedi la partecipazione ai tornei pubblicati. L'organizzazione approva e la squadra entra in gara con la rosa già pronta." />
      <ClubGroups requestTournamentId={search.get("richiedi") || ""} />
    </div>
  );
}
