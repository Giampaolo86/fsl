import { useMemo, useState } from "react";
import { Archive, ChevronDown, Search, Trophy } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useTournaments } from "@/context/TournamentContext";
import { StatusBadge } from "./StatusBadge";
import { fmtPeriod } from "@/lib/format";

export function TournamentSwitcher() {
  const { tournaments, current, setCurrentId } = useTournaments();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("active");
  const [q, setQ] = useState("");
  const navigate = useNavigate();

  const list = useMemo(
    () =>
      tournaments.filter((t) => (tab === "archived" ? t.status === "archived" : t.status !== "archived")).filter((t) => t.name.toLowerCase().includes(q.toLowerCase())),
    [tournaments, tab, q]
  );
  const activeCount = tournaments.filter((t) => t.status !== "archived").length;
  const archivedCount = tournaments.length - activeCount;

  const pick = (t) => {
    setCurrentId(t.id);
    setOpen(false);
    navigate(`/admin/t/${t.id}`);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-11 max-w-[260px] items-center gap-2 rounded-md border border-fsl-gold/40 bg-ink-950/60 px-3 text-left hover:border-fsl-gold transition-colors"
        data-testid="tournament-switcher-button"
        aria-haspopup="dialog"
      >
        <Trophy className="h-4 w-4 shrink-0 text-fsl-gold" aria-hidden="true" />
        <span className="min-w-0">
          <span className="block text-[10px] uppercase tracking-wider text-fsl-slate leading-none">Torneo corrente</span>
          <span className="block truncate text-sm font-semibold text-fsl-white leading-tight" data-testid="tournament-switcher-current">
            {current ? current.name : "Seleziona torneo"}
          </span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-fsl-slate" aria-hidden="true" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md bg-navy-900 border-white/15 text-fsl-white p-0 flex flex-col" data-testid="tournament-drawer">
          <SheetHeader className="px-5 pt-5 pb-3 border-b border-white/10">
            <SheetTitle className="font-display uppercase text-2xl text-fsl-white">Tutti i tornei</SheetTitle>
            <SheetDescription className="text-fsl-slate text-xs">Seleziona il torneo su cui lavorare: tutti i moduli mostreranno solo i suoi dati.</SheetDescription>
          </SheetHeader>
          <div className="px-5 pt-4 space-y-3">
            <div className="grid grid-cols-2 gap-2" role="tablist">
              {[
                { k: "active", label: `Attivi (${activeCount})`, Icon: Trophy },
                { k: "archived", label: `Archivio (${archivedCount})`, Icon: Archive },
              ].map(({ k, label, Icon }) => (
                <button
                  key={k}
                  role="tab"
                  aria-selected={tab === k}
                  onClick={() => setTab(k)}
                  data-testid={`tournament-drawer-tab-${k}`}
                  className={`h-11 rounded-md border text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors ${
                    tab === k ? "bg-fsl-blue border-fsl-blue-light text-fsl-white" : "border-white/20 text-fsl-slate hover:text-fsl-white"
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" /> {label}
                </button>
              ))}
            </div>
            <label className="relative block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fsl-slate" aria-hidden="true" />
              <input className="fsl-input pl-9" placeholder="Cerca torneo…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="tournament-drawer-search" aria-label="Cerca torneo" />
            </label>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
            {list.length === 0 && <p className="text-sm text-fsl-slate py-8 text-center">Nessun torneo trovato.</p>}
            {list.map((t) => (
              <button
                key={t.id}
                onClick={() => pick(t)}
                data-testid={`tournament-drawer-item-${t.slug}`}
                className={`w-full text-left fsl-card px-4 py-3 flex items-center gap-3 hover:border-fsl-gold/50 transition-colors ${current?.id === t.id ? "border-fsl-gold/60" : ""}`}
              >
                <div className="h-12 w-16 shrink-0 rounded-md overflow-hidden bg-ink-950">
                  {t.visual?.cover_url && <img src={t.visual.cover_url} alt="" className="h-full w-full object-cover opacity-80" />}
                </div>
                <div className="min-w-0 flex-1">
                  <StatusBadge status={t.status} className="mb-1" />
                  <div className="font-semibold text-sm truncate">{t.name}</div>
                  <div className="text-xs text-fsl-slate num">
                    {t.summary?.teams_capacity} squadre · {t.counts?.fields} campi · {fmtPeriod(t.start_date, t.end_date)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
