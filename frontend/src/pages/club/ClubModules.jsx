import { PageHeader } from "@/components/fsl/Primitives";
import { ErrorState, LoadingState } from "@/components/fsl/States";
import { ClubCrest } from "@/components/fsl/ClubCrest";
import { useMyClub } from "./ClubDashboard";
import { apiError } from "@/lib/api";

export function ClubTeams() {
  const { data, error } = useMyClub();
  if (error) return <ErrorState message={apiError(error)} />;
  if (!data) return <LoadingState />;
  return (
    <div>
      <PageHeader kicker={data.tournament.name} title="Squadre" subtitle="Le squadre della tua società iscritte alle competizioni del torneo." />
      <div className="fsl-card overflow-x-auto">
        <table className="w-full table-dark" data-testid="club-teams-table">
          <thead><tr><th>Squadra</th><th>Categoria</th><th>Serie</th><th>Competizione</th></tr></thead>
          <tbody>
            {data.teams.map((t) => (
              <tr key={t.id}>
                <td className="flex items-center gap-3 font-semibold"><ClubCrest club={data.club} size={28} /> {t.name}</td>
                <td className="num">{t.category}</td>
                <td>{t.series}</td>
                <td className="text-fsl-slate">{t.competition_name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
