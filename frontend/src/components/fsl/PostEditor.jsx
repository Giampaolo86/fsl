import { useEffect, useState } from "react";
import { Image as ImageIcon, Loader2, Trash2, Upload, Video } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { KIND_LABEL } from "@/components/fsl/Article";
import { api, apiError } from "@/lib/api";
import { PlayerTagPicker } from "@/components/fsl/PlayerTagPicker";
import { mediaUrl, uploadMedia } from "@/lib/upload";

const EMPTY = { kind: "news", title: "", excerpt: "", body: "", cover_url: null, media: [], club_ids: [], player_ids: [], match_id: "", publish_at: "" };

export function PostEditor({ tournamentId, post, clubMode, clubs, matches, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [players, setPlayers] = useState([]);
  useEffect(() => { Promise.all([api.get(`/tournaments/${tournamentId}/players`), api.get(`/tournaments/${tournamentId}/teams`)]).then(([p, t]) => { const tn = Object.fromEntries(t.data.map((x) => [x.id, x])); setPlayers(p.data.map((x) => ({ id: x.id, club_id: x.club_id, team_id: x.team_id, shirt_number: x.shirt_number, label: `${x.first_name} ${x.last_name}`, team: tn[x.team_id]?.name || "" })).sort((a, b) => a.label.localeCompare(b.label))); }).catch(() => {}); }, [tournamentId]);
  const matchSel = (matches || []).find((m) => m.id === form.match_id);
  const matchTeams = matchSel ? [matchSel.home_team_id, matchSel.away_team_id] : null;
  useEffect(() => { setForm(post ? { ...EMPTY, ...post, match_id: post.match_id || "", publish_at: post.publish_at ? post.publish_at.slice(0, 16) : "" } : EMPTY); }, [post]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const body = () => ({ kind: form.kind, title: form.title, excerpt: form.excerpt, body: form.body, cover_url: form.cover_url, media: form.media, club_ids: form.club_ids, player_ids: form.player_ids || [], match_id: form.match_id || null, publish_at: form.publish_at ? new Date(form.publish_at).toISOString() : null });

  const save = async (action) => {
    setBusy(true);
    try {
      let p = post?.id ? (await api.patch(`/tournaments/${tournamentId}/posts/${post.id}`, body())).data : (await api.post(`/tournaments/${tournamentId}/posts`, body())).data;
      if (action) p = (await api.post(`/tournaments/${tournamentId}/posts/${p.id}/status`, { action, publish_at: body().publish_at })).data;
      toast.success(action === "publish" ? "Contenuto pubblicato" : action === "schedule" ? "Contenuto programmato" : "Bozza salvata");
      onSaved(p);
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  const upload = async (files, asCover) => {
    for (const file of files) {
      setProgress({ name: file.name, pct: 0 });
      try {
        const m = await uploadMedia(tournamentId, file, (pct) => setProgress({ name: file.name, pct }));
        if (asCover) set("cover_url", m.url); else setForm((f) => ({ ...f, media: [...f.media, { id: m.id, url: m.url, kind: m.kind, original_filename: m.original_filename }] }));
      } catch (e) { toast.error(apiError(e)); }
    }
    setProgress(null);
  };
  const toggleClub = (id) => set("club_ids", form.club_ids.includes(id) ? form.club_ids.filter((x) => x !== id) : [...form.club_ids, id]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-navy-800 border-white/20 text-fsl-white rounded-xl max-w-3xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined} data-testid="post-editor">
        <DialogHeader><DialogTitle className="font-display uppercase text-2xl">{post?.id ? "Modifica contenuto" : "Nuovo contenuto"}</DialogTitle></DialogHeader>
        <div className="grid sm:grid-cols-[160px_1fr] gap-3">
          <select className="fsl-input" value={form.kind} onChange={(e) => set("kind", e.target.value)} data-testid="post-kind">{Object.entries(KIND_LABEL).filter(([k]) => k !== "badge").map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <input className="fsl-input" placeholder="Titolo" value={form.title} onChange={(e) => set("title", e.target.value)} data-testid="post-title" />
        </div>
        <input className="fsl-input" placeholder="Sommario (una frase)" value={form.excerpt} onChange={(e) => set("excerpt", e.target.value)} data-testid="post-excerpt" />
        <textarea className="fsl-input h-48 py-2 leading-relaxed" placeholder="Testo dell'articolo. Separa i paragrafi con una riga vuota." value={form.body} onChange={(e) => set("body", e.target.value)} data-testid="post-body" />
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="fsl-card p-3 space-y-2">
            <div className="fsl-label flex items-center gap-1"><ImageIcon className="h-3.5 w-3.5" /> Copertina</div>
            {form.cover_url ? <div className="relative"><img src={mediaUrl(form.cover_url)} alt="" className="h-28 w-full object-cover rounded-md" /><button className="absolute top-1 right-1 h-7 w-7 rounded-full bg-ink-950/80 inline-flex items-center justify-center text-fsl-danger" onClick={() => set("cover_url", null)} aria-label="Rimuovi copertina"><Trash2 className="h-3.5 w-3.5" /></button></div> : <label className="h-28 rounded-md border border-dashed border-white/25 flex flex-col items-center justify-center gap-1 text-xs text-fsl-slate cursor-pointer hover:border-fsl-gold/60"><Upload className="h-4 w-4" /> Carica immagine<input type="file" accept="image/*" className="hidden" onChange={(e) => upload([...e.target.files], true)} data-testid="post-cover-input" /></label>}
          </div>
          <div className="fsl-card p-3 space-y-2">
            <div className="fsl-label flex items-center gap-1"><Video className="h-3.5 w-3.5" /> Foto e filmati ({form.media.length})</div>
            <div className="flex flex-wrap gap-1.5">{form.media.map((m, i) => <span key={m.id || i} className="relative h-14 w-14 rounded-md overflow-hidden border border-white/15 bg-ink-950">{m.kind === "image" ? <img src={mediaUrl(m.url)} alt="" className="h-full w-full object-cover" /> : <Video className="h-5 w-5 absolute inset-0 m-auto text-fsl-slate" />}<button className="absolute top-0 right-0 h-5 w-5 bg-ink-950/80 text-fsl-danger text-[10px]" onClick={() => set("media", form.media.filter((_, j) => j !== i))} aria-label="Rimuovi media">✕</button></span>)}
              <label className="h-14 w-14 rounded-md border border-dashed border-white/25 flex items-center justify-center text-fsl-slate cursor-pointer hover:border-fsl-gold/60"><Upload className="h-4 w-4" /><input type="file" multiple accept="image/*,video/*" className="hidden" onChange={(e) => upload([...e.target.files], false)} data-testid="post-media-input" /></label>
            </div>
            {progress && <div className="text-xs text-fsl-slate flex items-center gap-2" data-testid="upload-progress"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {progress.name} · {progress.pct}%<span className="flex-1 h-1.5 rounded bg-ink-950 overflow-hidden"><span className="block h-full bg-fsl-gold transition-[width]" style={{ width: `${progress.pct}%` }} /></span></div>}
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><div className="fsl-label mb-1">Società collegate</div>{clubMode ? <p className="text-xs text-fsl-slate">Il contenuto è collegato alla tua società.</p> : <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto" data-testid="post-clubs">{clubs.map((c) => <button key={c.id} onClick={() => toggleClub(c.id)} className={`h-7 px-2 rounded-full text-[11px] border ${form.club_ids.includes(c.id) ? "bg-fsl-gold text-ink-950 border-fsl-gold" : "border-white/20 text-fsl-slate"}`}>{c.short_name || c.name}</button>)}</div>}</div>
          <div className="sm:col-span-2" data-testid="post-players"><div className="fsl-label mb-1 flex items-center justify-between"><span>Giocatori taggati <span className="text-fsl-slate normal-case">(il contenuto compare nella loro scheda)</span></span><span className="num text-fsl-gold">{(form.player_ids || []).length}</span></div>
            <PlayerTagPicker players={players.filter((p) => (form.player_ids || []).includes(p.id) || ((!form.club_ids.length || form.club_ids.includes(p.club_id)) && (!matchTeams || matchTeams.includes(p.team_id))))} value={form.player_ids || []} onChange={(ids) => set("player_ids", ids)} rosterLink={clubMode ? "/societa/rose" : `/admin/t/${tournamentId}/rose`} testId="post-players-picker" /></div>
          <div><div className="fsl-label mb-1">Partita collegata</div><select className="fsl-input h-9" value={form.match_id} onChange={(e) => set("match_id", e.target.value)} data-testid="post-match"><option value="">— nessuna —</option>{matches.map((m) => <option key={m.id} value={m.id}>{m.round_name} · {m.home.club?.short_name} - {m.away.club?.short_name}{m.score.home != null ? ` ${m.score.home}-${m.score.away}` : ""}</option>)}</select></div>
        </div>
        <div><div className="fsl-label mb-1">Programmazione (opzionale)</div><input type="datetime-local" className="fsl-input h-9 w-64" value={form.publish_at} onChange={(e) => set("publish_at", e.target.value)} data-testid="post-publish-at" /></div>
        <DialogFooter className="flex-wrap gap-2">
          <button className="btn-ghost" disabled={busy || !form.title} onClick={() => save(null)} data-testid="post-save-draft">Salva bozza</button>
          <button className="btn-primary" disabled={busy || !form.title || !form.publish_at} onClick={() => save("schedule")} data-testid="post-schedule">Programma</button>
          <button className="btn-gold" disabled={busy || !form.title} onClick={() => save("publish")} data-testid="post-publish">Pubblica subito</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
