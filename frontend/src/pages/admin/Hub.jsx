import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Archive, Grid3X3, Plus, Search, Trophy, Users, Volleyball } from "lucide-react";
import { KpiTile, PageHeader, SectionTitle } from "@/components/fsl/Primitives";
import { TournamentCard } from "@/components/fsl/TournamentCard";
import { PurgeTestDataDialog } from "@/components/fsl/PurgeTestDataDialog";
import { EmptyState, LoadingState } from "@/components/fsl/States";
import { useTournaments } from "@/context/TournamentContext";
import { useAuth } from "@/context/AuthContext";
import { StatusBadge } from "@/components/fsl/StatusBadge";
import { fmtNum, fmtPeriod } from "@/lib/format";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";

const HERO = "https://images.unsplash.com/photo-1551958219-acbc608c6377?crop=entropy&cs=srgb&fm=jpg&q=80&w=1800";

export default function Hub() {
  const { tournaments, stats, loading, currentId, refresh } = useTournaments();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("created");
  const canWrite = user.is_super_admin || user.role === "director";
  const deleteTournament = async (t) => {
    const typed = window.prompt(`Eliminazione DEFINITIVA di «${t.name}»: società, squadre, rose, gare, risultati, foto e vendite del torneo verranno cancellati per sempre.\n\nPer confermare scrivi il nome del torneo:`);
    if (typed === null) return;
    if (typed.trim().toLowerCase() !== t.name.trim().toLowerCase()) { toast.error("Nome non corrispondente: eliminazione annullata"); return; }
    try { await api.delete(`/tournaments/${t.id}`); toast.success(`Torneo «${t.name}» eliminato`); refresh(); } catch (e) { toast.error(apiError(e)); }
  };

  const visible = useMemo(() => {
    const list = tournaments.filter((t) => t.status !== "archived" && t.name.toLowerCase().includes(q.toLowerCase()));
    if (sort === "name") return [...list].sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "recent") return [...list].reverse();
    return list;
  }, [tournaments, q, sort]);
  const archived = tournaments.filter((t) => t.status === "archived");

  if (loading && tournaments.length === 0) return <LoadingState label="Caricamento tornei…" />;
  if (currentId && tournaments.some((t) => t.id === currentId)) return <Navigate to={`/admin/t/${currentId}`} replace />;

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-xl border border-white/15 grain">
        <img src={HERO} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 hero-overlay" />
        <div className="relative p-6 md:p-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <div className="fsl-kicker">Hub tornei</div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[0.92]">I miei tornei</h1>
            <p className="mt-2 text-fsl-slate max-w-lg">Gestisci tutti i tuoi tornei da un'unica piattaforma: ogni torneo ha configurazione, dati e regole indipendenti.</p>
          </div>
          {canWrite && (
            <div className="flex flex-wrap gap-2">
              {user.is_super_admin && <PurgeTestDataDialog tournaments={tournaments} onDone={refresh} />}
              <Link to="/admin/tornei/nuovo" className="btn-gold" data-testid="hub-create-tournament-button">
                <Plus className="h-4 w-4" aria-hidden="true" /> Crea nuovo torneo
              </Link>
            </div>
          )}
        </div>
      </section>

      {stats && (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <KpiTile icon={Trophy} value={stats.active} label="Tornei attivi" hint={`${stats.draft} in bozza · ${stats.completed} terminati`} testId="hub-kpi-active" />
          <KpiTile icon={Users} value={fmtNum(stats.teams_capacity)} label="Squadre previste" hint={`${fmtNum(stats.teams_total)} già iscritte`} testId="hub-kpi-teams" />
          <KpiTile icon={Volleyball} value={fmtNum(stats.matches_total)} label="Partite programmate" hint="Calendari generati" testId="hub-kpi-matches" />
          <KpiTile icon={Grid3X3} value={stats.fields_total} label="Campi in uso" hint={`In ${stats.venues_total} strutture`} testId="hub-kpi-fields" />
        </div>
      )}

      <section>
        <div className="fsl-card px-4 py-3 mb-4 flex flex-col md:flex-row md:items-center gap-3">
          <h2 className="fsl-section-title flex-1">I miei tornei</h2>
          <label className="relative block md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fsl-slate" aria-hidden="true" />
            <input className="fsl-input pl-9" placeholder="Cerca torneo…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="hub-search-input" aria-label="Cerca torneo" />
          </label>
          <select className="fsl-input md:w-48" value={sort} onChange={(e) => setSort(e.target.value)} data-testid="hub-sort-select" aria-label="Ordina per">
            <option value="created">Ordine di creazione</option>
            <option value="recent">Più recenti</option>
            <option value="name">Nome A-Z</option>
          </select>
        </div>
        {visible.length === 0 ? (
          <EmptyState
            icon={Trophy}
            title="Nessun torneo attivo"
            description={canWrite ? "Crea il tuo primo torneo da zero, da un modello o duplicando un torneo esistente." : "Non sei ancora assegnato a nessun torneo. Contatta il Super Admin."}
            action={canWrite && <Link to="/admin/tornei/nuovo" className="btn-gold">Crea nuovo torneo</Link>}
            testId="hub-empty"
          />
        ) : (
          <div className="grid md:grid-cols-2 2xl:grid-cols-3 gap-4" data-testid="hub-tournament-grid">
            {visible.map((t) => (
              <TournamentCard key={t.id} t={t} canWrite={canWrite} onDuplicate={(src) => navigate(`/admin/tornei/nuovo?mode=duplicate&source=${src.id}`)} onDelete={user.is_super_admin ? deleteTournament : undefined} />
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionTitle right={<span className="text-xs text-fsl-slate">Sola lettura · ripristino solo Super Admin con motivazione</span>}>Tornei archiviati</SectionTitle>
        {archived.length === 0 ? (
          <p className="text-sm text-fsl-slate">Nessun torneo in archivio.</p>
        ) : (
          <div className="fsl-card divide-y divide-white/[0.06]" data-testid="hub-archived-list">
            {archived.map((t) => (
              <Link key={t.id} to={`/admin/t/${t.id}`} className="flex items-center gap-4 px-4 h-16 hover:bg-white/[0.04] transition-colors" data-testid={`hub-archived-item-${t.slug}`}>
                <Archive className="h-5 w-5 text-fsl-slate" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{t.name}</div>
                  <div className="text-xs text-fsl-slate num">
                    {t.summary?.teams_capacity} squadre · {t.counts?.fields} campi · {fmtPeriod(t.start_date, t.end_date)}
                  </div>
                </div>
                <StatusBadge status={t.status} />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
