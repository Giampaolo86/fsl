import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TeamCard } from "@/components/fsl/TeamCard";
import { buyProduct } from "@/pages/DigitalProduct";
import { api, apiError } from "@/lib/api";

export function TeamCardDialog({ slug, team, onClose }) {
  const [data, setData] = useState(null);
  const [buying, setBuying] = useState(false);
  useEffect(() => { api.get(`/public/tournaments/${slug}/teams/${team.id}/card-preview`).then((r) => setData(r.data)).catch((e) => toast.error(apiError(e))); }, [slug, team.id]);
  const buy = async () => { setBuying(true); try { await buyProduct(slug, "team_card", team.id, team.name); } catch (e) { toast.error(apiError(e)); } finally { setBuying(false); } };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-navy-800 border-white/20 text-fsl-white rounded-xl max-w-2xl" aria-describedby={undefined} data-testid="team-card-dialog">
        <DialogHeader><DialogTitle className="font-display uppercase text-2xl">Cartolina squadra · {team.name}</DialogTitle></DialogHeader>
        {data ? <TeamCard data={data} preview onBuy={buy} buying={buying} /> : <p className="text-sm text-fsl-slate">Preparo l'anteprima…</p>}
        <p className="text-[11px] text-fsl-slate">Dopo il pagamento sicuro (Stripe) ricevi un link personale: la cartolina si aggiorna con i risultati ufficiali fino a fine stagione. I nomi dei giocatori compaiono solo con il consenso delle famiglie.</p>
      </DialogContent>
    </Dialog>
  );
}
