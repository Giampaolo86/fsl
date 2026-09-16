import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badges, EventIcons } from "@/components/fsl/Ratings";
import { BadgeChips } from "@/components/fsl/BadgeChips";
import { ROLE_TONE, fmtVote } from "@/lib/fanta";
import { apiError } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { mediaUrl } from "@/lib/upload";

export function PlayerCardDialog({ playerId, onClose, fetcher }) {
  const [card, setCard] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { setCard(null); setError(null); if (playerId) fetcher(playerId).then((r) => setCard(r.data)).catch(setError); }, [playerId, fetcher]);
  const t = card?.totals || {};
  const tiles = [["Presenze", t.presences || 0], ["Gol", t.goal || 0], ["Assist", t.assist || 0], ["Media voto", fmtVote(card?.avg_vote)], ["Media fanta", fmtVote(card?.avg_fanta)], ["MVP", t.mvp || 0]];
  return (
    <Dialog open={!!playerId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-navy-800 border-white/20 text-fsl-white rounded-xl max-w-lg max-h-[85vh] overflow-y-auto" data-testid="player-card-dialog">
        <DialogHeader>
          <DialogTitle className="font-display uppercase flex items-center gap-3">
            {card && (card.photo_url ? <img src={mediaUrl(card.photo_url)} alt="" className="h-12 w-12 rounded-full object-cover border border-fsl-gold/50" data-testid="player-card-photo" /> : <span className={`h-9 w-9 rounded-full inline-flex items-center justify-center text-[10px] font-bold uppercase ${ROLE_TONE[card.role_code] || "bg-navy-700"}`}>{card.role_code || "—"}</span>)}
            <span data-testid="player-card-name">{card ? <><span className="num text-fsl-gold mr-2">{card.shirt_number ?? ""}</span>{card.name}</> : "Scheda giocatore"}</span>
          </DialogTitle>
          <DialogDescription className="text-fsl-slate">{card ? `${card.team}${card.birth_year ? ` · ${card.birth_year}` : ""} · statistiche da gare ufficiali` : error ? apiError(error) : "Caricamento…"}</DialogDescription>
        </DialogHeader>
        {card && (
          <>
            <div className="grid grid-cols-3 gap-2">{tiles.map(([l, v]) => <div key={l} className="fsl-card p-3"><div className="font-display font-extrabold text-2xl num">{v}</div><div className="text-[10px] uppercase tracking-wider text-fsl-slate">{l}</div></div>)}</div>
            <div className="flex flex-wrap gap-2 text-xs text-fsl-slate">{[["Ammonizioni", t.yellow_card], ["Espulsioni", t.red_card], ["Autogol", t.own_goal], ["Rigori parati", t.penalty_saved], ["Porte inviolate", t.clean_sheets]].filter(([, v]) => v).map(([l, v]) => <span key={l} className="h-6 px-2 rounded-full border border-white/15 inline-flex items-center gap-1">{l} <span className="num text-fsl-white">{v}</span></span>)}</div>
            <div data-testid="player-card-badges"><div className="fsl-label mb-1.5">Badge ({card.badges?.length || 0})</div><BadgeChips list={card.badges || []} max={12} small={false} /></div>
            <div className="fsl-card divide-y divide-white/[0.06]" data-testid="player-card-history">
              {card.history.length === 0 && <p className="p-4 text-xs text-fsl-slate">Nessuna presenza in gare ufficiali.</p>}
              {card.history.map((h) => (
                <div key={h.match_id} className="h-12 px-3 flex items-center gap-2 text-xs">
                  <span className="text-fsl-slate num w-16 shrink-0">{fmtDate(h.kickoff_at)}</span>
                  <span className="flex-1 min-w-0 truncate">vs {h.opponent} <span className="text-fsl-slate num">{h.score}</span></span>
                  <div className="w-[110px] overflow-x-auto no-scrollbar flex gap-1"><EventIcons ev={h.events} compact /><Badges list={h.badges} /></div>
                  <span className="num text-fsl-slate">{fmtVote(h.vote)}</span>
                  <span className="num font-display font-extrabold text-base text-fsl-blue-light w-8 text-right">{fmtVote(h.fanta)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
