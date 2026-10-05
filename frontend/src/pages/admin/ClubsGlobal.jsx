import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2, ExternalLink, ListChecks, Pencil, Shield, Wand2 } from "lucide-react";
import { ClubCrest } from "@/components/fsl/ClubCrest";
import { KpiTile, PageHeader } from "@/components/fsl/Primitives";
import { EmptyState, ErrorState, LoadingState } from "@/components/fsl/States";
import { api, apiError } from "@/lib/api";

const ORDER = ["crest", "cover", "description", "contacts", "manager", "venue", "gallery"];

function ScoreBar({ score }) {
  const tone = score === 100 ? "bg-fsl-success" : score >= 60 ? "bg-fsl-gold" : "bg-fsl-danger";
  return <div className="flex items-center gap-2 min-w-[120px]"><div className="h-1.5 flex-1 rounded-full bg-white/10 overflow-hidden"><div className={`h-full ${tone}`} style={{ width: `${score}%` }} /></div><span className="num text-xs w-9 text-right">{score}%</span></div>;
}

function Checks({ c, labels }) {
  return (
    <div className="flex flex-wrap gap-1" data-testid={`club-checks-${c.id}`}>
      {ORDER.map((k) => <span key={k} title={labels[k]} className={`h-5 px-1.5 rounded text-[10px] font-bold uppercase inline-flex items-center ${c.checks[k] ? "bg-fsl-success/15 text-fsl-success" : "bg-fsl-danger/15 text-fsl-danger"}`}>{labels[k]}</span>)}
    </div>
  );
}

export default function ClubsGlobal() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tid, setTid] = useState("");
  const [onlyTodo, setOnlyTodo] = useState(false);
  const [q, setQ] = useState("");
  const load = () => api.get("/clubs/overview").then(({ data: d }) => setData(d)).catch(setError);
  useEffect(() => { load(); }, []);
  const tournaments = useMemo(() => Array.from(new Map((data?.items || []).map((c) => [c.tournament_id, c.tournament_name])).entries()), [data]);
  const rows = useMemo(() => (data?.items || []).filter((c) => (!tid || c.tournament_id === tid) && (!onlyTodo || c.missing.length) && (!q || c.name.toLowerCase().includes(q.toLowerCase()) || (c.city || "").toLowerCase().includes(q.toLowerCase()))).sort((a, b) => a.score - b.score || a.name.localeCompare(b.name)), [data, tid, onlyTodo, q]);
  if (error) return <ErrorState message={apiError(error)} onRetry={load} />;
  if (!data) return <LoadingState />;
  const items = data.items, todo = items.filter((c) => c.missing.length), drafts = items.filter((c) => c.has_draft);
  const first = rows.find((c) => c.missing.length) || todo[0];
  return (
    <div className="space-y-6" data-testid="clubs-global">
      <PageHeader kicker="Tutti i tornei · Società" title="Società" subtitle="Tutte le società di tutti i tornei: stato della homepage pubblica e checklist pre-torneo (rosa, foto, documenti, convocazioni, saldo, spunte del Responsabile). Sistema in sequenza quelle incomplete: ogni modifica dell'admin è pubblicata subito." actions={first && <button className="btn-gold" onClick={() => navigate(`/admin/t/${first.tournament_id}/societa/${first.id}?seq=1`)} data-testid="clubs-global-fix-sequence"><Wand2 className="h-4 w-4" /> Sistema in sequenza ({todo.length})</button>} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile icon={Shield} value={items.length} label="Società" testId="clubs-global-kpi-total" />
        <KpiTile icon={CheckCircle2} value={items.length - todo.length} label="Homepage complete" gold testId="clubs-global-kpi-complete" />
        <KpiTile icon={ListChecks} value={todo.length} label="Da sistemare" testId="clubs-global-kpi-todo" />
        <KpiTile icon={Pencil} value={drafts.length} label="Bozze società da approvare" hint={drafts.length ? "Vai nel torneo → Società" : undefined} testId="clubs-global-kpi-drafts" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input className="fsl-input h-10 w-56" placeholder="Cerca società o città…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="clubs-global-search" />
        <select className="fsl-input h-10 w-auto" value={tid} onChange={(e) => setTid(e.target.value)} data-testid="clubs-global-tournament">
          <option value="">Tutti i tornei</option>
          {tournaments.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <label className="inline-flex items-center gap-2 text-sm text-fsl-slate cursor-pointer"><input type="checkbox" checked={onlyTodo} onChange={(e) => setOnlyTodo(e.target.checked)} data-testid="clubs-global-only-todo" /> Solo da sistemare</label>
        <span className="ml-auto text-xs text-fsl-slate num">{rows.length} società</span>
      </div>
      {rows.length === 0 ? <EmptyState title="Nessuna società" description="Nessuna società corrisponde ai filtri." /> : (
        <div className="fsl-card overflow-x-auto">
          <table className="w-full table-dark" data-testid="clubs-global-table">
            <thead><tr><th>Società</th><th>Torneo</th><th>Squadre</th><th>Homepage</th><th>Cosa manca</th><th>Pre-torneo</th><th className="text-right">Azioni</th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} data-testid={`clubs-global-row-${c.id}`}>
                  <td><div className="flex items-center gap-3"><ClubCrest club={c} size={32} /><div><div className="font-semibold">{c.name}</div><div className="text-xs text-fsl-slate">{c.city || "—"}{c.has_draft && <span className="ml-2 text-fsl-warning">bozza in attesa</span>}</div></div></div></td>
                  <td className="text-xs text-fsl-slate">{c.tournament_name}</td>
                  <td className="num">{c.teams_count}</td>
                  <td><ScoreBar score={c.score} /></td>
                  <td><Checks c={c} labels={data.labels} /></td>
                  <td title={c.readiness?.todo?.length ? `Da fare: ${c.readiness.todo.join(", ")}` : "Pronta"} data-testid={`clubs-global-readiness-${c.id}`}><ScoreBar score={c.readiness?.score ?? 0} /><div className="text-[10px] text-fsl-slate mt-0.5">{c.readiness ? `${c.readiness.done}/${c.readiness.total} fatte` : ""}</div></td>
                  <td className="text-right">
                    <div className="inline-flex gap-1">
                      <Link to={`/admin/t/${c.tournament_id}/societa/${c.id}?seq=1`} className="btn-gold h-9" data-testid={`clubs-global-edit-${c.id}`}><Pencil className="h-4 w-4" /> Modifica</Link>
                      <Link to={`/tornei/${c.tournament_slug}/squadre/${c.slug}`} target="_blank" rel="noreferrer" className="btn-ghost h-9" data-testid={`clubs-global-open-${c.id}`}><ExternalLink className="h-4 w-4" /> Apri</Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
