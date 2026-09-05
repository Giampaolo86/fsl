import { Construction } from "lucide-react";
import { PageHeader } from "@/components/fsl/Primitives";
import { EmptyState, ErrorState, LoadingState } from "@/components/fsl/States";
import { ClubCrest } from "@/components/fsl/ClubCrest";
import { useMyClub } from "./ClubDashboard";
import { apiError } from "@/lib/api";

const MODULES = {
  rose: ["Rose e idoneità", "Fase 5", "Anagrafiche giocatori con visibilità limitata, tutori protetti, stato idoneità."],
  documenti: ["Documenti e consensi", "Fase 5", "Certificati medici, documenti, consensi privacy/immagine versionati con scadenze 30/15/7 giorni."],
  calendario: ["Calendario", "Fase 3", "Gare della società con esportazione iCal."],
  pagamenti: ["Pagamenti", "Fase 5", "Situazione contabile, scadenze, ricevute e caricamento bonifico."],
  profilo: ["Profilo e identità visiva", "Fase 6", "Stemma, colori, banner, foto squadre e giocatori con upload, anteprima, ritaglio e ripristino default; soggetti ad approvazione del Direttore."],
};

export function ClubModule({ module }) {
  const [title, phase, desc] = MODULES[module];
  return (
    <div>
      <PageHeader kicker={phase} title={title} />
      <EmptyState icon={Construction} title={`Modulo previsto in ${phase}`} description={desc} testId={`club-module-${module}`} />
    </div>
  );
}

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
