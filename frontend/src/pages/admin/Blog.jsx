import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Eye, Newspaper, Pencil, Plus, Sparkles, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Article, KIND_LABEL, STATUS_LABEL } from "@/components/fsl/Article";
import { PostEditor } from "@/components/fsl/PostEditor";
import { PageHeader } from "@/components/fsl/Primitives";
import { EmptyState, LoadingState } from "@/components/fsl/States";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/context/AuthContext";
import { api, apiError } from "@/lib/api";
import { fmtDate } from "@/lib/format";

const FILTERS = [["", "Tutti"], ["draft", "Bozze"], ["scheduled", "Programmati"], ["published", "Pubblicati"], ["withdrawn", "Ritirati"]];

export default function BlogManager({ clubMode = false }) {
  const params = useParams();
  const { user } = useAuth();
  const membership = user.memberships?.find((m) => m.role === "club_manager");
  const tid = clubMode ? membership?.tournament_id : params.tournamentId;
  const [list, setList] = useState(null);
  const [filter, setFilter] = useState("");
  const [clubs, setClubs] = useState([]);
  const [matches, setMatches] = useState([]);
  const [editing, setEditing] = useState(undefined);
  const [preview, setPreview] = useState(null);
  const [storyMatch, setStoryMatch] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { if (tid) api.get(`/tournaments/${tid}/posts`, { params: filter ? { status: filter } : {} }).then((r) => setList(r.data)).catch((e) => toast.error(apiError(e))); }, [tid, filter]);
  useEffect(load, [load]);
  useEffect(() => { if (!tid) return; if (!clubMode) api.get(`/tournaments/${tid}/clubs`).then((r) => setClubs(r.data)).catch(() => {}); api.get(`/tournaments/${tid}/matches`, { params: { status: "official,rectified" } }).then((r) => setMatches(r.data)).catch(() => {}); }, [tid, clubMode]);
  if (!tid) return <EmptyState icon={Newspaper} title="Nessuna società assegnata" />;
  const act = async (fn, ok) => { setBusy(true); try { await fn(); toast.success(ok); load(); } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); } };
  const status = (p, action) => act(() => api.post(`/tournaments/${tid}/posts/${p.id}/status`, { action }), action === "withdraw" ? "Contenuto ritirato" : action === "publish" ? "Pubblicato" : "Riportato in bozza");
  const remove = (p) => act(() => api.delete(`/tournaments/${tid}/posts/${p.id}`), "Contenuto eliminato");
  const story = () => act(async () => { const r = await api.post(`/tournaments/${tid}/matches/${storyMatch}/story`); setEditing(r.data); }, "Match story generata: rivedi e pubblica");
  const counts = (list || []).reduce((a, p) => { a[p.status] = (a[p.status] || 0) + 1; return a; }, {});

  return (
    <div>
      <PageHeader kicker="Portale pubblico" title="Blog e interviste" subtitle={clubMode ? "Notizie, interviste, gallery e video della tua società. I contenuti programmati diventano pubblici alla data stabilita." : "Notizie, interviste, gallery e video collegati a società e partite. Bozza, programmazione e pubblicazione immediata."} actions={<>
        <div className="flex items-center gap-1"><select className="fsl-input h-10 w-56" value={storyMatch} onChange={(e) => setStoryMatch(e.target.value)} data-testid="story-match-select"><option value="">Match story da gara…</option>{matches.map((m) => <option key={m.id} value={m.id}>{m.home.club?.short_name} {m.score.home}-{m.score.away} {m.away.club?.short_name} · {m.round_name}</option>)}</select><button className="btn-ghost h-10" disabled={!storyMatch || busy} onClick={story} data-testid="story-generate"><Sparkles className="h-4 w-4" /> Genera</button></div>
        <button className="btn-gold" onClick={() => setEditing(null)} data-testid="post-new"><Plus className="h-4 w-4" /> Nuovo contenuto</button>
      </>} />
      <div className="flex flex-wrap gap-1 mb-4" role="tablist">{FILTERS.map(([k, l]) => <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)} className={`h-9 px-3 rounded-full text-xs font-semibold uppercase ${filter === k ? "bg-fsl-blue" : "border border-white/15 text-fsl-slate hover:text-fsl-white"}`} data-testid={`post-filter-${k || "all"}`}>{l}{k && counts[k] ? <span className="num ml-1 text-fsl-gold">{counts[k]}</span> : null}</button>)}</div>
      {!list ? <LoadingState /> : list.length === 0 ? <EmptyState icon={Newspaper} title="Nessun contenuto" description="Crea una notizia, un'intervista o genera una Match story da una gara ufficiale." /> : (
        <div className="fsl-card divide-y divide-white/[0.06]" data-testid="posts-list">
          {list.map((p) => {
            const [sl, tone] = STATUS_LABEL[p.status] || STATUS_LABEL.draft;
            return (
              <div key={p.id} className="px-4 py-3 flex flex-wrap items-center gap-3" data-testid={`post-row-${p.id}`}>
                <span className={`h-6 px-2 rounded text-[10px] font-bold uppercase inline-flex items-center ${tone}`} data-testid={`post-status-${p.id}`}>{sl}</span>
                <span className="text-[10px] uppercase tracking-wider text-fsl-gold w-20">{KIND_LABEL[p.kind]}</span>
                <div className="flex-1 min-w-[200px]"><div className="font-semibold truncate">{p.title}</div><div className="text-xs text-fsl-slate num">{p.status === "scheduled" ? `Uscita ${fmtDate(p.publish_at, { time: true })}` : fmtDate(p.updated_at, { time: true })}{p.clubs?.length ? ` · ${p.clubs.map((c) => c.short_name || c.name).join(", ")}` : ""}{p.auto ? " · automatico" : ""}</div></div>
                <div className="flex items-center gap-1">
                  <button className="btn-ghost h-9 px-3" onClick={() => setPreview(p)} aria-label="Anteprima" data-testid={`post-preview-${p.id}`}><Eye className="h-4 w-4" /></button>
                  <button className="btn-ghost h-9 px-3" onClick={() => setEditing(p)} aria-label="Modifica" data-testid={`post-edit-${p.id}`}><Pencil className="h-4 w-4" /></button>
                  {(p.status === "published" || p.status === "scheduled") && <button className="btn-ghost h-9 px-3 text-fsl-warning" disabled={busy} onClick={() => status(p, "withdraw")} data-testid={`post-withdraw-${p.id}`}><Undo2 className="h-4 w-4" /> Ritira</button>}
                  {p.status === "withdrawn" && <button className="btn-ghost h-9 px-3" disabled={busy} onClick={() => status(p, "publish")} data-testid={`post-republish-${p.id}`}>Ripubblica</button>}
                  {p.status !== "published" && <button className="btn-ghost h-9 px-3 text-fsl-danger" disabled={busy} onClick={() => remove(p)} aria-label="Elimina" data-testid={`post-delete-${p.id}`}><Trash2 className="h-4 w-4" /></button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {editing !== undefined && <PostEditor tournamentId={tid} post={editing} clubMode={clubMode} clubs={clubs} matches={matches} onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); load(); }} />}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}><DialogContent className="bg-navy-900 border-white/20 text-fsl-white rounded-xl max-w-4xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined} data-testid="post-preview-dialog"><DialogHeader><DialogTitle className="fsl-kicker">Anteprima · come apparirà nel portale</DialogTitle></DialogHeader>{preview && <Article p={preview} compact />}</DialogContent></Dialog>
    </div>
  );
}
