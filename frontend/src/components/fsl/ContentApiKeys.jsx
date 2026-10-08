import { useCallback, useEffect, useState } from "react";
import { Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SectionTitle } from "@/components/fsl/Primitives";
import { useAuth } from "@/context/AuthContext";
import { api, apiError } from "@/lib/api";
import { fmtDate } from "@/lib/format";

const EXAMPLE = (slug) => JSON.stringify({ external_id: "cms-1234", tournament: slug, kind: "interview", title: "Intervista al mister", excerpt: "Sottotitolo", body: "<p>Testo <strong>HTML</strong> o Markdown</p>", cover_url: "https://…/copertina.jpg", author_name: "Redazione Partner", publish_at: "2026-10-12T09:00:00Z", status: "published" }, null, 2);

export function ContentApiKeys({ tournamentId, tournamentSlug }) {
  const { user } = useAuth();
  const [keys, setKeys] = useState([]);
  const [name, setName] = useState("");
  const [scope, setScope] = useState("tournament");
  const [issued, setIssued] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.get("/integrations/keys").then((r) => setKeys(r.data)).catch(() => setKeys([])), []);
  useEffect(() => { load(); }, [load]);
  const create = async () => {
    setBusy(true);
    try { const r = await api.post("/integrations/keys", { name: name.trim(), tournament_id: scope === "tournament" ? tournamentId : null }); setIssued(r.data); setName(""); load(); } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  const revoke = (k) => window.confirm(`Revocare la chiave «${k.name}»? Il partner non potrà più pubblicare.`) && api.delete(`/integrations/keys/${k.id}`).then(() => { toast.success("Chiave revocata"); load(); }).catch((e) => toast.error(apiError(e)));
  const copy = (t) => navigator.clipboard?.writeText(t).then(() => toast.success("Copiato"));
  const endpoint = `${process.env.REACT_APP_BACKEND_URL}/api/integrations/posts`;
  const mine = keys.filter((k) => !k.tournament_id || k.tournament_id === tournamentId);
  return (
    <section className="fsl-card p-6" data-testid="settings-content-api">
      <SectionTitle>Integrazioni · Content API</SectionTitle>
      <p className="text-xs text-fsl-slate mb-4">Un portale o CMS esterno può pubblicare notizie e interviste direttamente nel blog FSL (in veste grafica FSL) con una chiave API. Ogni chiave è mostrata una sola volta ed è revocabile. Feed in uscita: <code className="text-fsl-gold">/api/public/tournaments/{tournamentSlug}/posts.rss</code></p>
      <div className="flex flex-wrap items-end gap-2 mb-4">
        <label className="block flex-1 min-w-[200px]"><span className="fsl-label">Nome partner</span><input className="fsl-input mt-1" placeholder="es. Portale Sport Roma" value={name} onChange={(e) => setName(e.target.value)} data-testid="api-key-name" /></label>
        <label className="block"><span className="fsl-label">Ambito</span><select className="fsl-input mt-1" value={scope} onChange={(e) => setScope(e.target.value)} data-testid="api-key-scope"><option value="tournament">Solo questo torneo</option>{user.is_super_admin && <option value="all">Tutti i tornei</option>}</select></label>
        <button type="button" className="btn-gold h-10" disabled={busy || name.trim().length < 2} onClick={create} data-testid="api-key-create"><Plus className="h-4 w-4" /> Genera chiave</button>
      </div>
      {issued && (
        <div className="fsl-card-gold p-4 mb-4 space-y-2" data-testid="api-key-issued">
          <div className="text-sm">Chiave per <strong>{issued.name}</strong> — copiala ora, non sarà più visibile:</div>
          <div className="flex items-center gap-2"><code className="flex-1 break-all text-fsl-gold text-sm" data-testid="api-key-value">{issued.key}</code><button type="button" className="btn-ghost h-9" onClick={() => copy(issued.key)} data-testid="api-key-copy"><Copy className="h-4 w-4" /></button></div>
          <div className="text-xs text-fsl-slate">Endpoint: <code className="text-fsl-white">POST {endpoint}</code> · header <code className="text-fsl-white">Authorization: Bearer &lt;chiave&gt;</code> · stesso <code>external_id</code> = aggiornamento · <code>DELETE {endpoint}/&#123;external_id&#125;?tournament={tournamentSlug}</code> ritira l'articolo.</div>
          <details className="text-xs"><summary className="cursor-pointer text-fsl-gold">Esempio JSON</summary><pre className="mt-2 p-3 rounded bg-ink-950 overflow-x-auto text-[11px] leading-relaxed">{EXAMPLE(tournamentSlug)}</pre></details>
        </div>
      )}
      {mine.length === 0 ? <p className="text-sm text-fsl-slate" data-testid="api-keys-empty">Nessuna chiave attiva.</p> : (
        <div className="divide-y divide-white/[0.06] rounded-md border border-white/10" data-testid="api-keys-list">
          {mine.map((k) => <div key={k.id} className={`min-h-[44px] px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm ${k.revoked ? "opacity-50" : ""}`} data-testid={`api-key-${k.id}`}><KeyRound className="h-4 w-4 text-fsl-gold" /><span className="font-semibold">{k.name}</span><code className="text-xs text-fsl-slate">{k.prefix}…</code><span className="text-xs text-fsl-slate">{k.tournament_name}</span><span className="text-xs text-fsl-slate num ml-auto">{k.calls} chiamate{k.last_used_at ? ` · ultima ${fmtDate(k.last_used_at, { time: true })}` : ""}</span>{k.revoked ? <span className="text-xs text-fsl-danger">revocata</span> : <button type="button" className="btn-ghost h-9 text-fsl-danger" onClick={() => revoke(k)} data-testid={`api-key-revoke-${k.id}`}><Trash2 className="h-4 w-4" /></button>}</div>)}
        </div>
      )}
    </section>
  );
}
