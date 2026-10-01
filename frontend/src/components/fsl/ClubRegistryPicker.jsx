import { useEffect, useState } from "react";
import { Check, Link2 } from "lucide-react";
import { ClubCrest } from "@/components/fsl/ClubCrest";
import { api } from "@/lib/api";

export function ClubRegistryPicker({ tid, query, selected, onSelect }) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setItems([]); return undefined; }
    const h = setTimeout(() => api.get(`/tournaments/${tid}/clubs/registry`, { params: { q } }).then((r) => setItems(r.data)).catch(() => setItems([])), 250);
    return () => clearTimeout(h);
  }, [tid, query]);
  if (selected) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-fsl-success/50 bg-fsl-success/10 px-3 py-2 text-sm" data-testid="club-registry-selected">
        <ClubCrest club={selected} size={32} />
        <div className="flex-1 min-w-0"><div className="font-semibold truncate">{selected.name}</div><div className="text-xs text-fsl-slate truncate">Anagrafica FSL · da {selected.tournament_name}{selected.season_label ? ` · ${selected.season_label}` : ""} — stemma, colori, contatti e home verranno importati</div></div>
        <button type="button" className="text-xs text-fsl-slate hover:text-fsl-white" onClick={() => onSelect(null)} data-testid="club-registry-clear">Scollega</button>
      </div>
    );
  }
  if (items.length === 0) return null;
  return (
    <div className="rounded-lg border border-fsl-gold/40 bg-ink-950/60 overflow-hidden" data-testid="club-registry-list">
      <div className="px-3 py-2 text-[11px] uppercase tracking-wider text-fsl-gold inline-flex items-center gap-1"><Link2 className="h-3.5 w-3.5" /> Società già censite in FSL</div>
      <ul className="max-h-56 overflow-y-auto divide-y divide-white/[0.06]">
        {items.map((it) => (
          <li key={it.id}>
            <button type="button" disabled={it.already_here} onClick={() => onSelect(it)} className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-white/5 disabled:opacity-50" data-testid={`club-registry-item-${it.org_club_id}`}>
              <ClubCrest club={it} size={28} />
              <span className="flex-1 min-w-0"><span className="block text-sm font-semibold truncate">{it.name}</span><span className="block text-xs text-fsl-slate truncate">{[it.city, it.tournament_name, it.season_label].filter(Boolean).join(" · ")}</span></span>
              {it.already_here ? <span className="text-[11px] text-fsl-success inline-flex items-center gap-1"><Check className="h-3 w-3" /> già nel torneo</span> : <span className="text-[11px] text-fsl-gold">Collega</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
