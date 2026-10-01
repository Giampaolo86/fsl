import { useCallback, useEffect, useState } from "react";
import { BedDouble, Download, Shield } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionTitle } from "@/components/fsl/Primitives";
import { EmptyState, ErrorState, LoadingState } from "@/components/fsl/States";
import { HospitalityBookingDialog, HospitalityCards } from "@/components/fsl/Hospitality";
import { fmtEur } from "@/components/fsl/HospitalityEditor";
import { useTournamentDetail } from "@/hooks/useTournamentData";
import { useMyClub } from "@/pages/club/ClubDashboard";
import { api, apiError } from "@/lib/api";
import { fmtDate } from "@/lib/format";

const STATUS = { requested: ["Richiesta", "text-fsl-warning border-fsl-warning/50"], confirmed: ["Confermata", "text-fsl-success border-fsl-success/50"], cancelled: ["Annullata", "text-fsl-slate border-white/20"] };

function BookingsTable({ rows, canManage, onStatus, clubMode }) {
  if (rows.length === 0) return <EmptyState icon={BedDouble} title="Nessuna prenotazione" description={clubMode ? "Richiedi pernotti, pasti o trasporto dai servizi qui sopra." : "Le richieste di società e genitori compariranno qui."} />;
  return (
    <div className="fsl-card overflow-x-auto">
      <table className="w-full table-dark" data-testid="hospitality-bookings-table">
        <thead><tr><th>Codice</th><th>Data</th><th>Servizio</th><th className="text-right">Qtà</th><th className="text-right">Importo</th>{!clubMode && <th>Prenotante</th>}<th>Contatti</th><th>Note</th><th>Stato</th>{(canManage || clubMode) && <th className="text-right">Azioni</th>}</tr></thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.id} data-testid={`hospitality-booking-${b.id}`}>
              <td className="num text-xs">{b.code}</td>
              <td className="num text-xs text-fsl-slate whitespace-nowrap">{fmtDate(b.created_at)}</td>
              <td className="font-semibold">{b.item_label}</td>
              <td className="num text-right">{b.qty}</td>
              <td className="num text-right">{fmtEur(b.qty * b.unit_price)}</td>
              {!clubMode && <td>{b.club_name ? <span className="inline-flex items-center gap-1"><Shield className="h-3.5 w-3.5 text-fsl-gold" /> {b.club_name}</span> : <span>{b.name} <span className="text-[10px] uppercase text-fsl-slate">{b.booker_type === "fan" ? "genitore" : "ospite"}</span></span>}</td>}
              <td className="text-xs text-fsl-slate">{[b.email, b.phone].filter(Boolean).join(" · ")}</td>
              <td className="text-xs text-fsl-slate max-w-[200px] truncate" title={b.note}>{b.note || "—"}</td>
              <td><span className={`h-7 px-2 rounded-full border text-[11px] font-bold inline-flex items-center ${STATUS[b.status][1]}`} data-testid={`hospitality-status-${b.id}`}>{STATUS[b.status][0]}</span></td>
              {(canManage || clubMode) && (
                <td className="text-right whitespace-nowrap">
                  {canManage && b.status !== "confirmed" && <button className="btn-ghost h-8 text-xs" onClick={() => onStatus(b, "confirmed")} data-testid={`hospitality-confirm-${b.id}`}>Conferma</button>}
                  {b.status !== "cancelled" && <button className="btn-ghost h-8 text-xs text-fsl-danger" onClick={() => onStatus(b, "cancelled")} data-testid={`hospitality-cancel-${b.id}`}>Annulla</button>}
                  {canManage && b.status === "cancelled" && <button className="btn-ghost h-8 text-xs" onClick={() => onStatus(b, "requested")}>Ripristina</button>}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Hospitality({ clubMode = false }) {
  return clubMode ? <ClubHospitality /> : <AdminHospitality />;
}

function AdminHospitality() {
  const { data } = useTournamentDetail();
  if (!data) return <LoadingState />;
  return <HospitalityPanel tid={data.id} slug={data.slug} canManage={["super_admin", "director", "secretary"].includes(data.my_role) && !data.read_only} />;
}

function ClubHospitality() {
  const { data, membership } = useMyClub();
  if (!membership) return <EmptyState icon={Shield} title="Nessuna società assegnata" description="Il tuo account non è collegato a una società." />;
  if (!data) return <LoadingState />;
  return <HospitalityPanel tid={membership.tournament_id} slug={data.tournament.slug} clubMode />;
}

function HospitalityPanel({ tid, slug, canManage = false, clubMode = false }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [book, setBook] = useState(false);
  const load = useCallback(() => { if (tid) api.get(`/tournaments/${tid}/hospitality/bookings`).then((r) => setData(r.data)).catch(setError); }, [tid]);
  useEffect(() => { load(); }, [load]);
  if (error) return <ErrorState message={apiError(error)} onRetry={load} />;
  if (!data) return <LoadingState />;
  const setStatus = async (b, status) => { try { await api.patch(`/tournaments/${tid}/hospitality/bookings/${b.id}`, { status }); toast.success(`Prenotazione ${STATUS[status][0].toLowerCase()}`); load(); } catch (e) { toast.error(apiError(e)); } };
  const active = data.items.filter((i) => i.enabled);
  const download = async () => {
    try {
      const r = await api.get(`/tournaments/${tid}/hospitality/export`, { responseType: "blob" });
      const url = URL.createObjectURL(r.data); const a = document.createElement("a"); a.href = url; a.download = `FSL_Ospitalita_${slug}.xlsx`; a.click(); URL.revokeObjectURL(url);
    } catch (e) { toast.error(apiError(e)); }
  };
  return (
    <div className="space-y-8">
      <PageHeader kicker={clubMode ? "Servizi per la tua società" : "Prenotazioni"} title="Ospitalità" subtitle={clubMode ? "Pernotto, pasti e trasporto offerti dall'organizzazione: richiedi quantità e persone, il pagamento avviene sul posto." : "Richieste di pernotto, pasti e trasporto da società e genitori. Totali per servizio e per prenotante, esportabili in Excel."}
        actions={<div className="flex gap-2">{clubMode && active.length > 0 && <button className="btn-gold" onClick={() => setBook(true)} data-testid="club-hospitality-book">Nuova richiesta</button>}{canManage && <button className="btn-ghost" onClick={download} data-testid="hospitality-export"><Download className="h-4 w-4" /> Excel</button>}</div>} />
      {active.length === 0 ? <p className="text-sm text-fsl-slate" data-testid="hospitality-none">{clubMode ? "L'organizzazione non ha attivato servizi di ospitalità per questo torneo." : "Nessun servizio attivo: attivali in Impostazioni → Ospitalità e logistica."}</p> : (
        <section><SectionTitle>Servizi attivi</SectionTitle><HospitalityCards items={active} onBook={clubMode ? () => setBook(true) : undefined} /></section>
      )}
      {!clubMode && data.totals.per_item.length > 0 && (
        <section data-testid="hospitality-totals">
          <SectionTitle>Totali (escluse annullate)</SectionTitle>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{data.totals.per_item.map((r) => <div key={r.key} className="rounded-md bg-ink-950/50 border border-white/10 p-3" data-testid={`hospitality-total-${r.key}`}><div className="font-display font-extrabold text-3xl num">{r.qty}</div><div className="text-[11px] uppercase tracking-wider text-fsl-slate">{r.label}</div><div className="text-xs text-fsl-gold num mt-1">{fmtEur(r.amount)} · {r.bookings} richieste</div></div>)}</div>
          <div className="mt-4 fsl-card overflow-x-auto"><table className="w-full table-dark" data-testid="hospitality-per-club"><thead><tr><th>Società / prenotante</th><th className="text-right">Quantità</th><th className="text-right">Importo</th></tr></thead><tbody>{data.totals.per_club.map((r) => <tr key={r.name}><td className="font-semibold">{r.name}</td><td className="num text-right">{r.qty}</td><td className="num text-right">{fmtEur(r.amount)}</td></tr>)}</tbody></table></div>
        </section>
      )}
      <section><SectionTitle>{clubMode ? "Le nostre richieste" : "Tutte le richieste"}</SectionTitle><BookingsTable rows={data.bookings} canManage={canManage} clubMode={clubMode} onStatus={setStatus} /></section>
      {book && slug && <HospitalityBookingDialog slug={slug} items={active} onClose={() => setBook(false)} onDone={load} />}
    </div>
  );
}
