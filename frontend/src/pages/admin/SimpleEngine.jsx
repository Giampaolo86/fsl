import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/fsl/Primitives";
import { ErrorState, LoadingState } from "@/components/fsl/States";
import { GroupsBlock } from "@/components/fsl/simple/GroupsBlock";
import { CalendarBlock } from "@/components/fsl/simple/CalendarBlock";
import { FinalsBlock } from "@/components/fsl/simple/FinalsBlock";
import { SimpleMatchEdit } from "@/components/fsl/SimpleMatchEdit";
import { useTournamentDetail } from "@/hooks/useTournamentData";
import { api, apiError } from "@/lib/api";

export default function SimpleEngine() {
  const { tournamentId: tid } = useParams();
  const { data: t } = useTournamentDetail();
  const [params, setParams] = useSearchParams();
  const category = params.get("cat") || "";
  const [board, setBoard] = useState(null);
  const [error, setError] = useState(null);
  const [editM, setEditM] = useState(null);

  const load = useCallback(() => {
    api.get(`/tournaments/${tid}/simple/board`, { params: category ? { category } : {} }).then((r) => { setBoard(r.data); setError(null); }).catch(setError);
  }, [tid, category]);
  useEffect(load, [load]);

  if (error) return <ErrorState message={apiError(error)} onRetry={load} />;
  if (!board || !t) return <LoadingState label="Caricamento gironi…" />;
  const canWrite = ["super_admin", "director", "secretary"].includes(t.my_role) && !t.read_only;
  const total = board.matches.length + board.finals.length;

  return (
    <div className="space-y-6" data-testid="simple-engine">
      <PageHeader
        kicker="Una pagina, tre passi"
        title="Gironi e Calendario"
        subtitle={`${board.groups.length} gironi · ${board.teams.filter((x) => board.groups.some((g) => g.id === x.competition_id)).length} squadre · ${total} partite`}
        actions={board.categories.length > 1 && (
          <select className="fsl-input h-10 w-44" value={board.category} onChange={(e) => { const p = new URLSearchParams(params); p.set("cat", e.target.value); setParams(p); }} data-testid="simple-category-select">
            {board.categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      />
      <GroupsBlock tid={tid} board={board} reload={load} canWrite={canWrite} />
      <CalendarBlock tid={tid} board={board} reload={load} canWrite={canWrite} onEdit={setEditM} />
      <FinalsBlock tid={tid} board={board} reload={load} canWrite={canWrite} onEdit={setEditM} />
      {editM && <SimpleMatchEdit tid={tid} m={editM} teams={board.teams} fields={board.fields} onClose={() => setEditM(null)} onDone={load} />}
    </div>
  );
}
