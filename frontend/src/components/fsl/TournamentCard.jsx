import { Copy, Eye, EyeOff, LayoutGrid, Settings, Trophy, Users, Calendar, Grid3X3, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { StatusBadge } from "./StatusBadge";
import { ProgressBar } from "./Primitives";
import { FORMULA, fmtPeriod } from "@/lib/format";

export function TournamentCard({ t, onDuplicate, onDelete, onTogglePublished, canWrite }) {
  const isArchived = t.status === "archived";
  return (
    <article className="fsl-card overflow-hidden flex flex-col animate-rise" data-testid={`tournament-card-${t.slug}`}>
      <div className="relative h-40 bg-ink-950">
        {t.visual?.cover_url && <img src={t.visual.cover_url} alt="" className="absolute inset-0 h-full w-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-navy-800 via-navy-800/40 to-transparent" />
        <div className="absolute left-4 bottom-3 right-4">
          <StatusBadge status={t.status} />
          <h3 className="mt-2 text-2xl font-extrabold leading-none truncate">{t.name}</h3>
          <p className="text-xs text-fsl-slate truncate">{t.payoff || t.description || "—"}</p>
        </div>
      </div>
      <div className="p-4 space-y-4 flex-1 flex flex-col">
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            [Users, t.summary?.teams_capacity ?? 0, "Squadre"],
            [Grid3X3, t.counts?.fields ?? 0, "Campi"],
            [Trophy, t.settings?.categories?.length ?? 0, "Categorie"],
          ].map(([Icon, v, l]) => (
            <div key={l} className="rounded-md bg-ink-950/50 border border-white/10 py-2">
              <Icon className="mx-auto h-4 w-4 text-fsl-gold" aria-hidden="true" />
              <div className="font-display font-extrabold text-xl num leading-none mt-1">{v}</div>
              <div className="text-[10px] uppercase tracking-wider text-fsl-slate">{l}</div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-fsl-slate">
          <Calendar className="h-4 w-4 text-fsl-gold shrink-0" aria-hidden="true" />
          <span className="uppercase font-semibold text-fsl-white">{fmtPeriod(t.start_date, t.end_date)}</span>
          <span>· {t.season_label || FORMULA[t.settings?.formula]}</span>
        </div>
        <ProgressBar value={t.counts?.completion_pct ?? 0} label={isArchived ? "Torneo archiviato · sola lettura" : "Completamento torneo"} />
        <button type="button" className={`flex items-center gap-2 w-full rounded-md border px-3 h-9 text-xs transition-colors ${t.published ? "border-fsl-success/40 text-fsl-success hover:bg-fsl-success/10" : "border-fsl-warning/40 text-fsl-warning hover:bg-fsl-warning/10"} disabled:opacity-60`} onClick={() => onTogglePublished?.(t)} disabled={!canWrite || !onTogglePublished || isArchived} title={t.published ? "Visibile sul sito pubblico: clicca per nasconderlo" : "Non visibile sul sito pubblico: clicca per pubblicarlo"} aria-pressed={!!t.published} data-testid={`tournament-card-published-${t.slug}`}>
          {t.published ? <Eye className="h-4 w-4" aria-hidden="true" /> : <EyeOff className="h-4 w-4" aria-hidden="true" />}
          <span className="font-semibold">{t.published ? "Visibile sul sito" : "Nascosto dal sito"}</span>
          <span className="ml-auto text-[10px] uppercase tracking-wider opacity-70">{t.published ? "Nascondi" : "Pubblica"}</span>
        </button>
        <div className="mt-auto space-y-2">
          <Link to={`/admin/t/${t.id}`} className="btn-primary w-full" data-testid={`tournament-card-open-${t.slug}`}>
            <LayoutGrid className="h-4 w-4" aria-hidden="true" /> Apri Control Room
          </Link>
          <div className="grid grid-cols-2 gap-2">
            <Link to={`/admin/t/${t.id}/impostazioni`} className="btn-ghost" data-testid={`tournament-card-settings-${t.slug}`}>
              <Settings className="h-4 w-4" aria-hidden="true" /> Impostazioni
            </Link>
            <button className="btn-ghost" onClick={() => onDuplicate(t)} disabled={!canWrite} data-testid={`tournament-card-duplicate-${t.slug}`}>
              <Copy className="h-4 w-4" aria-hidden="true" /> Duplica
            </button>
          </div>
          {onDelete && (
            <button className="btn-ghost w-full h-9 text-xs text-fsl-danger hover:bg-fsl-danger/10" onClick={() => onDelete(t)} data-testid={`tournament-card-delete-${t.slug}`}>
              <Trash2 className="h-4 w-4" aria-hidden="true" /> Elimina definitivamente
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
