import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Award, CreditCard, Plus, Trophy } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionTitle } from "@/components/fsl/Primitives";
import { ClubCrest } from "@/components/fsl/ClubCrest";
import { DailyTakings } from "@/components/fsl/DailyTakings";
import { EmptyState, LoadingState } from "@/components/fsl/States";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTournamentDetail } from "@/hooks/useTournamentData";
import { useAuth } from "@/context/AuthContext";
import { api, apiError } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { BadgesAdmin } from "@/pages/admin/Badges";

const BADGE = { bomber: "Bomber", doppietta: "Doppietta", tripletta: "Tripletta", assistman: "Assistman", muro: "Muro" };

const SORTS = { mvp: ["MVP", (r) => -r.mvp, (r) => -(r.avg_fanta || 0)], avg_fanta: ["Media fantavoto", (r) => -(r.avg_fanta || 0)], goals: ["Gol", (r) => -r.goals], assists: ["Assist", (r) => -r.assists], badges: ["Badge", (r) => -Object.values(r.badges).reduce((a, b) => a + b, 0)], name: ["Nome", (r) => r.name.toLowerCase()], team: ["Squadra", (r) => r.team.toLowerCase(), (r) => r.name.toLowerCase()] };
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export function AwardsBoard({ rows, testId = "awards-board", linkFor }) {
  const [sort, setSort] = useState("mvp");
  const [q, setQ] = useState("");
  const [team, setTeam] = useState("");
  if (!rows?.length) return <EmptyState icon={Award} title="Nessun premio assegnato" description="I premi nascono dalle pagelle delle gare ufficiali." testId={testId} />;
  const teams = [...new Set(rows.map((r) => r.team).filter(Boolean))].sort();
  const keys = SORTS[sort].slice(1);
  const view = rows.filter((r) => (!team || r.team === team) && (!q || `${r.name} ${r.team}`.toLowerCase().includes(q.toLowerCase()))).sort((a, b) => { for (const k of keys) { const c = cmp(k(a), k(b)); if (c) return c; } return cmp(a.name, b.name); });
  return (
    <div className="space-y-3" data-testid={testId}>
      <div className="flex flex-wrap items-center gap-2" data-testid="awards-controls">
        <input className="fsl-input h-9 w-56" placeholder="Cerca giocatore o squadra…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="awards-search" />
        <select className="fsl-input h-9 w-52" value={team} onChange={(e) => setTeam(e.target.value)} data-testid="awards-team-filter"><option value="">Tutte le squadre</option>{teams.map((t) => <option key={t} value={t}>{t}</option>)}</select>
        <div className="flex items-center gap-1 ml-auto"><span className="text-xs text-fsl-slate mr-1">Ordina per</span>{Object.entries(SORTS).map(([k, [l]]) => <button key={k} type="button" onClick={() => setSort(k)} className={`h-8 px-3 rounded-full text-xs border transition-colors ${sort === k ? "bg-fsl-gold text-ink-950 border-fsl-gold font-semibold" : "border-white/20 text-fsl-slate hover:text-fsl-white"}`} data-testid={`awards-sort-${k}`}>{l}</button>)}</div>
        <span className="text-xs text-fsl-slate num" data-testid="awards-count">{view.length} giocatori</span>
      </div>
      <div className="fsl-card overflow-x-auto">
        <table className="w-full table-dark"><thead><tr><th>#</th><th>Giocatore</th><th>Ruolo</th><th className="text-right">MVP</th><th className="text-right">Media fantavoto</th><th className="text-right">Gol</th><th className="text-right">Assist</th><th>Badge</th></tr></thead>
          <tbody>{view.map((r, i) => <tr key={r.player_id || `${r.name}-${r.team}`} data-testid={`award-row-${i}`}><td className="num font-display font-extrabold text-xl text-fsl-gold">{i + 1}</td><td>{linkFor && r.player_id ? <Link to={linkFor(r.player_id)} className="font-semibold hover:text-fsl-gold" data-testid={`award-player-${r.player_id}`}>{r.name}</Link> : <div className="font-semibold">{r.name}</div>}<div className="text-xs text-fsl-slate">{r.team}</div></td><td className="text-xs">{r.role}</td><td className="num text-right font-display font-extrabold text-2xl">{r.mvp}</td><td className="num text-right text-fsl-blue-light font-semibold">{r.avg_fanta ?? "–"}</td><td className="num text-right">{r.goals}</td><td className="num text-right">{r.assists}</td><td className="text-xs">{Object.entries(r.badges).map(([b, n]) => <span key={b} className="inline-flex h-6 px-2 mr-1 rounded-full border border-fsl-gold/40 items-center gap-1">{BADGE[b] || b} <span className="num text-fsl-gold">×{n}</span></span>)}</td></tr>)}</tbody></table>
        {view.length === 0 && <p className="p-6 text-center text-sm text-fsl-slate">Nessun giocatore corrisponde ai filtri.</p>}
      </div>
    </div>
  );
}

export function OutcomesList({ outcomes, testId = "outcomes-list" }) {
  if (!outcomes?.length) return null;
  const Team = ({ r }) => <span className="inline-flex items-center gap-1.5 text-sm"><ClubCrest club={r.club} size={18} /> {r.club?.name || r.name}</span>;
  return (
    <div className="grid md:grid-cols-2 gap-3" data-testid={testId}>{outcomes.map((o) => (
      <div key={o.id} className="fsl-card-gold p-4" data-testid={`outcome-${o.competition_id}`}>
        <div className="fsl-kicker mb-1">{o.competition_name}</div>
        <div className="flex items-center gap-2 text-lg font-display font-extrabold uppercase"><Trophy className="h-5 w-5 text-fsl-gold" /> Campione: {o.champion?.club?.name || o.champion?.name}</div>
        {o.promoted.length > 0 && <div className="mt-2 text-xs text-fsl-success uppercase font-semibold">Promosse</div>}<div className="flex flex-wrap gap-3">{o.promoted.map((r) => <Team key={r.team_id} r={r} />)}</div>
        {o.relegated.length > 0 && <div className="mt-2 text-xs text-fsl-danger uppercase font-semibold">Retrocesse</div>}<div className="flex flex-wrap gap-3">{o.relegated.map((r) => <Team key={r.team_id} r={r} />)}</div>
        {o.playoff.length > 0 && <div className="mt-2 text-xs text-fsl-slate">Playoff: {o.playoff.map((r) => r.club?.short_name || r.name).join(", ")}</div>}
        <div className="mt-2 text-[11px] text-fsl-slate num">Chiusa il {fmtDate(o.created_at)}</div>
      </div>
    ))}</div>
  );
}

export function Awards() {
  const { tournamentId } = useParams();
  const { user } = useAuth();
  const [rows, setRows] = useState(null);
  const [outcomes, setOutcomes] = useState([]);
  useEffect(() => { api.get(`/tournaments/${tournamentId}/awards`).then((r) => setRows(r.data)); api.get(`/tournaments/${tournamentId}/outcomes`).then((r) => setOutcomes(r.data)); }, [tournamentId]);
  if (!rows) return <LoadingState />;
  return (
    <div className="space-y-8">
      <PageHeader kicker="Pagelle, premi e nomination" title="Premi" subtitle="Classifica MVP e badge calcolati dalle pagelle stile fantacalcio delle gare ufficiali." />
      <AwardsBoard rows={rows} linkFor={(pid) => `/admin/t/${tournamentId}/giocatori/${pid}`} />
      <BadgesAdmin tournamentId={tournamentId} canManage={user.is_super_admin || user.role === "director"} />
      {outcomes.length > 0 && <section><SectionTitle>Esiti stagione</SectionTitle><OutcomesList outcomes={outcomes} /></section>}
    </div>
  );
}

export function Payments({ clubMode = false }) {
  const params = useParams();
  const { user } = useAuth();
  const membership = user.memberships.find((m) => m.role === "club_manager");
  const tid = clubMode ? membership?.tournament_id : params.tournamentId;
  const { data: t } = useTournamentDetail();
  const [summary, setSummary] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [clubId, setClubId] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ club_id: "", amount: "", method: "bonifico", description: "" });
  const load = () => { if (!tid) return; api.get(`/tournaments/${tid}/payments/summary`).then((r) => setSummary(r.data)); api.get(`/tournaments/${tid}/payments`, { params: clubId ? { club_id: clubId } : {} }).then((r) => setLedger(r.data)); };
  useEffect(load, [tid, clubId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!tid) return <EmptyState icon={CreditCard} title="Nessuna società assegnata" />;
  if (!summary) return <LoadingState />;
  const canWrite = !clubMode && ["super_admin", "director", "secretary"].includes(t?.my_role) && !t?.read_only;
  const cur = summary.currency === "EUR" ? "€" : summary.currency;
  const save = async () => { try { const { data } = await api.post(`/tournaments/${tid}/payments`, { ...form, amount: Number(form.amount) }); toast.success(`Pagamento registrato · ricevuta ${data.receipt_no}`); setOpen(false); load(); } catch (e) { toast.error(apiError(e)); } };
  return (
    <div className="space-y-6">
      <PageHeader kicker="Pagamenti, ricevute e riconciliazione" title="Pagamenti" subtitle={`Quota per atleta presente: ${summary.fee} ${cur}${Object.keys(summary.fee_by_category || {}).length ? " · per categoria: " + Object.entries(summary.fee_by_category).map(([k, v]) => `${k} ${v} ${cur}`).join(", ") : ""} (impostabile nelle Impostazioni). Gli addebiti nascono automaticamente all'ufficializzazione di ogni gara.`} actions={canWrite && <button className="btn-primary" onClick={() => { setForm({ ...form, club_id: summary.clubs[0]?.club.id || "" }); setOpen(true); }} data-testid="payment-add-button"><Plus className="h-4 w-4" /> Registra pagamento</button>} />
      <div className="fsl-card overflow-x-auto"><table className="w-full table-dark" data-testid="payments-summary"><thead><tr><th>Società</th><th className="text-right">Addebitato</th><th className="text-right">Pagato</th><th className="text-right">Saldo</th></tr></thead>
        <tbody>{summary.clubs.map((c) => <tr key={c.club.id} className={clubId === c.club.id ? "bg-white/[0.04]" : ""} data-testid={`payment-club-${c.club.slug}`}><td><button className="flex items-center gap-2 font-semibold hover:text-fsl-gold" onClick={() => setClubId(clubId === c.club.id ? "" : c.club.id)}><ClubCrest club={c.club} size={24} /> {c.club.name}</button></td><td className="num text-right">{c.charged.toFixed(2)} {cur}</td><td className="num text-right text-fsl-success">{c.paid.toFixed(2)} {cur}</td><td className={`num text-right font-display font-extrabold text-xl ${c.balance > 0 ? "text-fsl-warning" : "text-fsl-success"}`}>{c.balance.toFixed(2)} {cur}</td></tr>)}</tbody>
        <tfoot><tr><td className="px-4 h-12 font-semibold">Totale da incassare</td><td /><td /><td className="px-4 num text-right font-display font-extrabold text-2xl text-fsl-gold">{summary.total_due.toFixed(2)} {cur}</td></tr></tfoot></table></div>
      {!clubMode && <DailyTakings tid={tid} cur={cur} />}
      <section><SectionTitle>Movimenti {clubId && <span className="text-fsl-slate text-sm font-sans normal-case">· filtro società attivo</span>}</SectionTitle>
        {ledger.length === 0 ? <EmptyState icon={CreditCard} title="Nessun movimento" description="Gli addebiti compaiono dopo la prima gara ufficiale con convocati." /> : <div className="fsl-card divide-y divide-white/[0.06]" data-testid="payments-ledger">{ledger.map((e) => <div key={e.id} className="flex items-center gap-4 px-4 h-14 text-sm"><span className={`h-7 px-2 rounded-full border text-[10px] font-bold uppercase inline-flex items-center ${e.kind === "charge" ? "border-fsl-warning/40 text-fsl-warning" : "border-fsl-success/40 text-fsl-success"}`}>{e.kind === "charge" ? "Addebito" : "Pagamento"}</span><div className="flex-1 min-w-0"><div className="truncate">{e.description}</div><div className="text-xs text-fsl-slate num">{fmtDate(e.created_at, { time: true })}{e.receipt_no ? ` · ${e.receipt_no} · ${e.method}` : ""}</div></div><span className={`num font-display font-extrabold text-xl ${e.kind === "charge" ? "" : "text-fsl-success"}`}>{e.kind === "charge" ? "" : "−"}{e.amount.toFixed(2)} {cur}</span></div>)}</div>}</section>
      <Dialog open={open} onOpenChange={setOpen}><DialogContent className="bg-navy-800 border-white/20 text-fsl-white rounded-xl" aria-describedby={undefined} data-testid="payment-dialog">
        <DialogHeader><DialogTitle className="font-display uppercase text-2xl">Registra pagamento</DialogTitle></DialogHeader>
        <div className="grid gap-3"><select className="fsl-input" value={form.club_id} onChange={(e) => setForm({ ...form, club_id: e.target.value })} data-testid="payment-club-select">{summary.clubs.map((c) => <option key={c.club.id} value={c.club.id}>{c.club.name} · saldo {c.balance.toFixed(2)}</option>)}</select>
          <input type="number" min="0" step="0.5" className="fsl-input" placeholder="Importo" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} data-testid="payment-amount" />
          <select className="fsl-input" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}><option value="bonifico">Bonifico</option><option value="contanti">Contanti</option><option value="pos">POS</option></select>
          <input className="fsl-input" placeholder="Causale" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        <DialogFooter><button className="btn-ghost" onClick={() => setOpen(false)}>Annulla</button><button className="btn-primary" disabled={!form.club_id || !(Number(form.amount) > 0)} onClick={save} data-testid="payment-submit">Registra e genera ricevuta</button></DialogFooter>
      </DialogContent></Dialog>
    </div>
  );
}
