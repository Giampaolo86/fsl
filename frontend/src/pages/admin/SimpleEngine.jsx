import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/fsl/Primitives";
import { ErrorState, LoadingState } from "@/components/fsl/States";
import { GroupsBlock } from "@/components/fsl/simple/GroupsBlock";
import { CalendarBlock } from "@/components/fsl/simple/CalendarBlock";
import { FinalsBlock } from "@/components/fsl/simple/FinalsBlock";
import { SimpleMatchEdit } from "@/components/fsl/SimpleMatchEdit";
import { SimpleMatchCreate } from "@/components/fsl/SimpleMatchCreate";
import { AiCalendarAssistant } from "@/components/fsl/AiCalendarAssistant";
import { Sparkles } from "lucide-react";
import { useTournamentDetail } from "@/hooks/useTournamentData";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";

export default function SimpleEngine() {
  const { tournamentId: tid } = useParams();
  const { data: t } = useTournamentDetail();
  const [params, setParams] = useSearchParams();
  const category = params.get("cat") || "";
  const [board, setBoard] = useState(null);
  const [error, setError] = useState(null);
  const [editM, setEditM] = useState(null);
  const [createM, setCreateM] = useState(null);
  const [ai, setAi] = useState(false);

  const load = useCallback(() => {
    api.get(`/tournaments/${tid}/simple/board`, { params: category ? { category } : {} }).then((r) => { setBoard(r.data); setError(null); }).catch(setError);
  }, [tid, category]);
  useEffect(load, [load]);

  const swap = async (a, b) => {
    try { const { data } = await api.post(`/tournaments/${tid}/simple/matches/swap`, { a, b }); setBoard(data); toast.success("Orario e campo scambiati"); } catch (e) { toast.error(apiError(e)); }
  };

  const move = async (matchId, kickoff, fieldId) => {
    try { const { data } = await api.post(`/tournaments/${tid}/simple/matches/move`, { match_id: matchId, kickoff_at: kickoff, field_id: fieldId }); setBoard(data); toast.success(data.swapped ? "Partite scambiate" : "Partita spostata"); } catch (e) { toast.error(apiError(e)); }
  };

  const saveSlots = async (date, add, remove) => {
    try { const { data } = await api.put(`/tournaments/${tid}/simple/slots`, { category: board?.category, date, add, remove }); setBoard(data); } catch (e) { toast.error(apiError(e)); }
  };
  const saveBreaks = async (breaks) => {
    try { const { data } = await api.put(`/tournaments/${tid}/simple/breaks`, { category: board?.category, breaks }); setBoard(data); toast.success("Pause aggiornate"); } catch (e) { toast.error(apiError(e)); }
  };

  const quickTeam = async (matchId, side, teamId, force = false) => {
    try { await api.patch(`/tournaments/${tid}/groups/matches/${matchId}`, { [`${side}_team_id`]: teamId, force }); toast.success("Squadra cambiata"); load(); } catch (e) {
      if (e?.response?.status === 409 && !force && window.confirm(`${apiError(e)}\n\nCambiare comunque?`)) return quickTeam(matchId, side, teamId, true);
      toast.error(apiError(e));
    }
  };

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
        actions={<div className="flex flex-wrap items-center gap-2">
          {canWrite && <button type="button" className={`h-10 px-4 inline-flex items-center gap-2 rounded-md font-semibold text-sm border transition-colors ${ai ? "bg-fsl-gold text-ink-950 border-fsl-gold" : "border-fsl-gold/60 text-fsl-gold hover:bg-fsl-gold/10"}`} onClick={() => setAi((v) => !v)} data-testid="ai-toggle"><Sparkles className="h-4 w-4" /> Assistente IA</button>}
          {board.categories.length > 1 && (
            <select className="fsl-input h-10 w-44" value={board.category} onChange={(e) => { const p = new URLSearchParams(params); p.set("cat", e.target.value); setParams(p); }} data-testid="simple-category-select">
              {board.categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </div>}
      />
      <GroupsBlock tid={tid} board={board} reload={load} canWrite={canWrite} />
      <CalendarBlock tid={tid} board={board} reload={load} canWrite={canWrite} onEdit={setEditM} onSwap={swap} onMove={move} onBreaks={saveBreaks} onSlots={saveSlots} onQuickTeam={quickTeam} onCreate={setCreateM} />
      <FinalsBlock tid={tid} board={board} reload={load} canWrite={canWrite} onEdit={setEditM} onSwap={swap} onCreate={setCreateM} />
      {ai && <AiCalendarAssistant tid={tid} board={board} onApplied={(data) => setBoard(data)} onClose={() => setAi(false)} />}
      {createM && <SimpleMatchCreate tid={tid} board={board} defaults={createM} onClose={() => setCreateM(null)} onDone={load} />}
      {editM && <SimpleMatchEdit tid={tid} m={editM} teams={board.teams} fields={board.fields} onClose={() => setEditM(null)} onDone={load} />}
    </div>
  );
}
