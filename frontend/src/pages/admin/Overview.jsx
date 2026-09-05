import { useState } from "react";
import { Link } from "react-router-dom";
import { Archive, Calendar, CheckCircle2, ClipboardList, Grid3X3, Lock, PlayCircle, RotateCcw, Shield, Trophy, Users, Volleyball } from "lucide-react";
import { toast } from "sonner";
import { KpiTile, PageHeader, SectionTitle } from "@/components/fsl/Primitives";
import { StatusBadge } from "@/components/fsl/StatusBadge";
import { EmptyState, ErrorState, LoadingState } from "@/components/fsl/States";
import { ReasonDialog } from "@/components/fsl/ReasonDialog";
import { useTournamentDetail } from "@/hooks/useTournamentData";
import { useTournaments } from "@/context/TournamentContext";
import { useAuth } from "@/context/AuthContext";
import { api, apiError } from "@/lib/api";
import { DAYS, FORMULA, fmtNum, fmtPeriod } from "@/lib/format";

export default function Overview() {
  const { data, error, loading, reload } = useTournamentDetail();
  const { refresh } = useTournaments();
  const { user } = useAuth();
  const [dialog, setDialog] = useState(null);

  if (loading) return <LoadingState label="Caricamento torneo…" />;
  if (error) return <ErrorState message={apiError(error)} onRetry={reload} />;

  const t = data;
  const s = t.settings;
  const canWrite = ["super_admin", "director"].includes(t.my_role);
  const readOnly = t.read_only;

  const changeStatus = async (status, reason) => {
    try {
      await api.post(`/tournaments/${t.id}/status`, { status, reason });
      toast.success(`Stato aggiornato: ${status}`);
      await Promise.all([reload(), refresh()]);
    } catch (e) {
      toast.error(apiError(e));
      throw e;
    }
  };
  const restore = async (reason) => {
    try {
      await api.post(`/tournaments/${t.id}/restore`, { reason });
      toast.success("Torneo ripristinato");
      await Promise.all([reload(), refresh()]);
    } catch (e) {
      toast.error(apiError(e));
      throw e;
    }
  };

  const fields = Array.from({ length: s.fields_count }, (_, i) => `Campo ${i + 1}`);

  return (
    <div className="space-y-8">
      {readOnly && (
        <div className="flex items-center gap-3 rounded-lg border border-fsl-warning/40 bg-fsl-warning/10 px-4 h-12 text-sm text-fsl-warning" role="status" data-testid="read-only-banner">
          <Lock className="h-4 w-4" aria-hidden="true" /> Torneo archiviato: tutti i dati sono in sola lettura. Il ripristino è riservato al Super Admin con motivazione.
        </div>
      )}
      <PageHeader
        kicker={t.season_label || "Torneo"}
        title={t.name}
        subtitle={t.payoff}
        actions={
          <>
            <StatusBadge status={t.status} testId="overview-status-badge" />
            {canWrite && t.status === "draft" && (
              <button className="btn-gold" onClick={() => changeStatus("active")} data-testid="overview-activate-button">
                <PlayCircle className="h-4 w-4" aria-hidden="true" /> Attiva e pubblica
              </button>
            )}
            {canWrite && t.status === "active" && (
              <button className="btn-ghost" onClick={() => changeStatus("completed")} data-testid="overview-complete-button">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Termina torneo
              </button>
            )}
            {canWrite && (t.status === "completed" || t.status === "draft") && (
              <button className="btn-ghost" onClick={() => setDialog("archive")} data-testid="overview-archive-button">
                <Archive className="h-4 w-4" aria-hidden="true" /> Archivia
              </button>
            )}
            {user.is_super_admin && t.status === "archived" && (
              <button className="btn-ghost" onClick={() => setDialog("restore")} data-testid="overview-restore-button">
                <RotateCcw className="h-4 w-4" aria-hidden="true" /> Ripristina
              </button>
            )}
          </>
        }
      >
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-fsl-slate">
          <span className="inline-flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5 text-fsl-gold" /> {fmtPeriod(t.start_date, t.end_date)}</span>
          <span>{FORMULA[s.formula]}</span>
          <span className="num">Gara {s.match_duration_min}' · cambio campo {s.buffer_min}'</span>
          <span>{s.match_days.map((d) => DAYS[d]).join("/")} {s.day_start}–{s.day_end}</span>
          <span className="text-fsl-slate/70">slug: /tornei/{t.slug}</span>
        </div>
      </PageHeader>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiTile icon={Trophy} value={t.counts.competitions} label="Campionati" hint={`${s.categories.length} categorie · ${s.series.length} serie`} testId="overview-kpi-competitions" />
        <KpiTile icon={Users} value={`${t.counts.teams}/${t.summary.teams_capacity}`} label="Squadre iscritte" hint={`${t.counts.clubs} società`} testId="overview-kpi-teams" />
        <KpiTile icon={Volleyball} value={fmtNum(t.summary.matches_total)} label="Gare previste" hint={`${t.summary.rounds} giornate · ${t.summary.weekends_needed ?? "—"} weekend`} testId="overview-kpi-matches" />
        <KpiTile icon={Grid3X3} value={t.counts.fields} label="Campi" hint={`${s.slots.length} slot/giorno · ${t.summary.matches_per_day} gare/giorno`} testId="overview-kpi-fields" />
      </div>

      <section>
        <SectionTitle right={<span className="text-xs text-fsl-slate">Control Room del giorno · attiva in Fase 3/4 con calendario e referti</span>}>Campi in parallelo</SectionTitle>
        <div className={`grid gap-4 ${s.fields_count >= 3 ? "lg:grid-cols-3" : s.fields_count === 2 ? "lg:grid-cols-2" : ""}`} data-testid="overview-fields-grid">
          {fields.map((f) => (
            <div key={f} className="fsl-card overflow-hidden">
              <div className="h-12 px-4 flex items-center justify-between border-b border-white/10 bg-ink-950/40">
                <span className="font-display font-bold uppercase">{f}</span>
                <Grid3X3 className="h-4 w-4 text-fsl-slate" aria-hidden="true" />
              </div>
              <ul className="divide-y divide-white/[0.06]">
                {s.slots.map((slot) => (
                  <li key={slot} className="h-12 px-4 flex items-center gap-3 text-sm">
                    <span className="num font-semibold text-fsl-white w-12">{slot}</span>
                    <span className="inline-flex items-center gap-1.5 text-xs text-fsl-slate">
                      <span className="h-2 w-2 rounded-full bg-fsl-slate/50" aria-hidden="true" /> Slot libero · nessuna gara programmata
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <div className="grid lg:grid-cols-3 gap-4">
        <EmptyState icon={ClipboardList} title="Referti attesi" description="I referti compariranno qui quando le gare saranno programmate e assegnate (Fase 4)." testId="overview-empty-reports" />
        <EmptyState icon={Shield} title="Segnalazioni" description="I ticket collegati a gare, pagamenti e documenti saranno gestiti qui (Fase 5)." testId="overview-empty-tickets" />
        <div className="fsl-card p-5">
          <div className="fsl-kicker mb-2">Azioni rapide</div>
          <div className="grid gap-2">
            <Link to={`/admin/t/${t.id}/impostazioni`} className="btn-ghost justify-start" data-testid="overview-quick-settings">Configura formula, categorie e slot</Link>
            <Link to={`/admin/t/${t.id}/societa`} className="btn-ghost justify-start" data-testid="overview-quick-clubs">Gestisci società e squadre</Link>
            <Link to={`/admin/t/${t.id}/campi`} className="btn-ghost justify-start" data-testid="overview-quick-fields">Sedi e campi</Link>
            <Link to={`/admin/t/${t.id}/audit`} className="btn-ghost justify-start" data-testid="overview-quick-audit">Audit log</Link>
          </div>
        </div>
      </div>

      <ReasonDialog
        open={dialog === "archive"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Archivia torneo"
        description="Il torneo diventerà di sola lettura e resterà ricercabile nell'archivio. L'operazione viene registrata nell'audit log."
        confirmLabel="Archivia"
        danger
        onConfirm={(reason) => changeStatus("archived", reason)}
      />
      <ReasonDialog
        open={dialog === "restore"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Ripristina torneo archiviato"
        description="Il torneo tornerà nello stato Terminato e sarà nuovamente modificabile. Operazione riservata al Super Admin."
        confirmLabel="Ripristina"
        onConfirm={restore}
      />
    </div>
  );
}
