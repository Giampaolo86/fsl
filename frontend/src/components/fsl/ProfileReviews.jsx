import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { ReasonDialog } from "@/components/fsl/ReasonDialog";
import { api, apiError } from "@/lib/api";

export function ProfileReviews({ tid, onDone }) {
  const [list, setList] = useState([]);
  const [reject, setReject] = useState(null);
  const load = useCallback(() => api.get(`/tournaments/${tid}/profile-reviews`).then((r) => setList(r.data)).catch(() => {}), [tid]);
  useEffect(() => { load(); }, [load]);
  const act = async (c, action, note) => { try { await api.post(`/tournaments/${tid}/clubs/${c.id}/profile/review`, { action, note }); toast.success(action === "approve" ? "Homepage pubblicata" : "Modifiche respinte"); load(); onDone?.(); } catch (e) { toast.error(apiError(e)); } };
  if (!list.length) return null;
  return (
    <section className="fsl-card-gold p-4 mb-5 space-y-2" data-testid="profile-reviews">
      <div className="font-display font-bold uppercase">Homepage società da approvare <span className="num text-fsl-gold">{list.length}</span></div>
      {list.map((c) => (
        <div key={c.id} className="rounded-md border border-white/10 p-3 flex flex-wrap items-center gap-3 text-sm" data-testid={`profile-review-${c.id}`}>
          <div className="flex-1 min-w-[220px]"><div className="font-semibold">{c.name}</div><div className="text-xs text-fsl-slate truncate">Campi modificati: {Object.keys(c.draft || {}).join(", ")}</div>{c.draft?.motto && <div className="text-xs mt-1">Motto: «{c.draft.motto}»</div>}</div>
          <button className="btn-gold h-9" onClick={() => act(c, "approve")} data-testid={`profile-approve-${c.id}`}><CheckCircle2 className="h-4 w-4" /> Approva e pubblica</button>
          <button className="btn-ghost h-9 text-fsl-danger" onClick={() => setReject(c)} data-testid={`profile-reject-${c.id}`}><XCircle className="h-4 w-4" /> Respingi</button>
        </div>
      ))}
      <ReasonDialog open={!!reject} onOpenChange={(o) => !o && setReject(null)} title="Respingi modifiche" description="La società riceve il motivo e può correggere." confirmLabel="Respingi" danger onConfirm={(note) => { act(reject, "reject", note); setReject(null); }} />
    </section>
  );
}
