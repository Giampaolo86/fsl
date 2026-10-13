import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Plus, Search, Trash2, Trophy, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ClubCrest } from "@/components/fsl/ClubCrest";
import { api, apiError } from "@/lib/api";

const Field = ({ label, children }) => <label className="block"><span className="fsl-label">{label}</span><div className="mt-1">{children}</div></label>;

export function CategoryPicker({ categories, selected, onChange, existing = [], groups = [], onRemove }) {
  const byCat = Object.fromEntries(groups.map((g) => [g.category, g]));
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" data-testid="club-category-picker">
      {categories.map((cat) => { const has = existing.includes(cat); const g = byCat[cat]; const on = has || selected.includes(cat); return (
        <label key={cat} className={`rounded-md border px-3 py-2 text-sm cursor-pointer select-none ${on ? "border-fsl-gold/60 bg-fsl-gold/10" : "border-white/10 hover:border-white/30"} ${has ? "opacity-70 cursor-default" : ""}`}>
          <span className="flex items-center gap-2"><input type="checkbox" checked={on} disabled={has} onChange={(e) => onChange(e.target.checked ? [...selected, cat] : selected.filter((x) => x !== cat))} data-testid={`club-category-${cat}`} /><span className="num font-display font-bold text-fsl-gold text-base">{cat}</span></span>
          <span className="flex items-center justify-between text-[11px] text-fsl-slate mt-0.5">{has ? "già iscritta" : g ? `gruppo dichiarato${g.roster ? ` · rosa ${g.roster.rows} giocatori` : ""}` : "squadra + rosa"}{has && onRemove && <button type="button" onClick={(e) => { e.preventDefault(); onRemove(cat); }} className="text-fsl-slate/60 hover:text-fsl-danger" title="Elimina la squadra di questa categoria" data-testid={`club-category-remove-${cat}`}><Trash2 className="h-3.5 w-3.5" /></button>}</span>
        </label>
      ); })}
    </div>
  );
}

async function enroll(orgKey, tid, categories) {
  const r = await api.post(`/org-clubs/${orgKey}/enroll`, { tournament_id: tid, categories });
  return r.data;
}

export function AddClubDialog({ t, present, onClose, onDone }) {
  const [registry, setRegistry] = useState(null);
  const [groups, setGroups] = useState([]);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState([]);
  const [cats, setCats] = useState([]);
  const [creating, setCreating] = useState(false);
  const [nf, setNf] = useState({ name: "", city: "", contact_name: "", email: "", phone: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get("/org-clubs").then((r) => setRegistry(r.data.items || [])).catch((e) => toast.error(apiError(e))); api.get("/org-groups").then((r) => setGroups(r.data.pending || [])).catch(() => {}); }, []);
  const presentKeys = useMemo(() => new Set(present.map((c) => c.org_key || c.org_club_id)), [present]);
  const rows = useMemo(() => { const s = q.trim().toLowerCase(); return (registry || []).filter((c) => !s || c.name.toLowerCase().includes(s) || (c.city || "").toLowerCase().includes(s)).slice(0, 12); }, [registry, q]);
  const pickedKeys = new Set(picked.map((c) => c.org_key));
  const clubGroups = groups.filter((g) => pickedKeys.has(g.org_key));
  const toggle = (c) => {
    setCreating(false);
    if (pickedKeys.has(c.org_key)) { setPicked(picked.filter((x) => x.org_key !== c.org_key)); return; }
    setPicked([...picked, c]);
    const declared = groups.filter((g) => g.org_key === c.org_key).map((g) => g.category).filter((x) => t.settings.categories.includes(x) && !cats.includes(x));
    if (declared.length) setCats([...cats, ...declared]);
  };
  const submit = async () => {
    setBusy(true);
    try {
      if (creating) {
        const r = await api.post("/org-clubs", { ...nf, name: nf.name || q });
        const data = await enroll(r.data.org_key, t.id, cats);
        toast.success(`«${r.data.name}» partecipa a ${t.name}${data.teams.length ? ` con ${data.teams.length} squadr${data.teams.length === 1 ? "a" : "e"}` : ""}`);
        onDone(data);
        return;
      }
      const results = [];
      const failed = [];
      for (const c of picked) {
        try { results.push(await enroll(c.org_key, t.id, cats)); } catch (e) { failed.push(`${c.name}: ${apiError(e)}`); }
      }
      const teams = results.reduce((n, d) => n + d.teams.length, 0);
      if (results.length) toast.success(`${results.length} societ${results.length === 1 ? "à" : "à"} iscritt${results.length === 1 ? "a" : "e"} a ${t.name}${teams ? ` · ${teams} squadre` : ""}`);
      failed.forEach((f) => toast.error(f));
      if (results.length) onDone(results[results.length - 1]);
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  const canSubmit = !busy && (creating ? (nf.name || q).trim().length >= 2 : picked.length > 0);
  const nTeams = picked.length * cats.length;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-navy-800 border-white/20 text-fsl-white rounded-xl max-w-2xl" data-testid="club-add-dialog" aria-describedby={undefined}>
        <DialogHeader><DialogTitle className="font-display uppercase text-2xl">Aggiungi società al torneo</DialogTitle></DialogHeader>
        <p className="text-xs text-fsl-slate">Le società si registrano a FSL una sola volta. Qui scegli chi partecipa a <strong className="text-fsl-white">{t.name}</strong> (anche più società insieme) e in quali categorie: per ogni categoria nasce una squadra con la sua rosa, e il responsabile trova subito il torneo nella sua Area Società. Nessun nuovo invito.</p>
        <div className="relative"><Search className="h-4 w-4 absolute left-3 top-3 text-fsl-slate" /><input className="fsl-input pl-9" autoFocus placeholder="Cerca nell'anagrafe FSL (nome o città)…" value={q} onChange={(e) => { setQ(e.target.value); setCreating(false); }} data-testid="club-add-search" /></div>
        {!registry ? <p className="text-sm text-fsl-slate">Carico l'anagrafe…</p> : (
          <div className="max-h-56 overflow-y-auto fsl-scroll rounded-md border border-white/10 divide-y divide-white/5" data-testid="club-add-results">
            {rows.map((c) => { const here = presentKeys.has(c.org_key); const sel = pickedKeys.has(c.org_key); return (
              <button key={c.org_key} type="button" disabled={here} onClick={() => toggle(c)} className={`w-full text-left px-3 py-2 flex items-center gap-3 ${sel ? "bg-fsl-gold/10" : "hover:bg-white/5"} ${here ? "opacity-50" : ""}`} aria-pressed={sel} data-testid={`club-add-row-${c.org_key}`}>
                <span className={`h-4 w-4 rounded border inline-flex items-center justify-center shrink-0 ${sel ? "bg-fsl-gold border-fsl-gold text-ink-950" : "border-white/30"}`} aria-hidden="true">{sel && <CheckCircle2 className="h-3 w-3" />}</span>
                <ClubCrest club={c} size={28} />
                <span className="flex-1 min-w-0"><span className="block font-semibold truncate">{c.name}</span><span className="block text-[11px] text-fsl-slate truncate">{c.city || "—"} · {c.manager ? <><UserRound className="inline h-3 w-3 text-fsl-gold" /> {c.manager.full_name || c.manager.email}</> : "nessun responsabile registrato"}{c.pending_groups ? ` · ${c.pending_groups} grupp${c.pending_groups === 1 ? "o" : "i"} in attesa` : ""}</span></span>
                {here && <span className="text-[11px] text-fsl-success inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> già nel torneo</span>}
              </button>
            ); })}
            {rows.length === 0 && <p className="px-3 py-3 text-sm text-fsl-slate">Nessuna società trovata.</p>}
            <button type="button" onClick={() => { setCreating(true); setPicked([]); setCats([]); setNf((f) => ({ ...f, name: q })); }} className={`w-full text-left px-3 py-2 text-sm inline-flex items-center gap-2 ${creating ? "bg-fsl-gold/10 text-fsl-gold" : "text-fsl-slate hover:bg-white/5"}`} data-testid="club-add-new"><Plus className="h-4 w-4" /> Non c'è: registra una nuova società FSL{q ? ` «${q}»` : ""}</button>
          </div>
        )}
        {picked.length > 0 && !creating && (
          <div className="flex flex-wrap gap-1.5" data-testid="club-add-picked">
            {picked.map((c) => <button key={c.org_key} type="button" onClick={() => toggle(c)} className="inline-flex items-center gap-1 rounded-full border border-fsl-gold/40 bg-fsl-gold/10 px-2.5 py-1 text-xs hover:border-fsl-danger hover:text-fsl-danger" title="Rimuovi dalla selezione" data-testid={`club-add-picked-${c.org_key}`}>{c.name} <X className="h-3 w-3" /></button>)}
          </div>
        )}
        {creating && (
          <div className="grid grid-cols-2 gap-3" data-testid="club-add-new-form">
            <Field label="Nome società"><input className="fsl-input" value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} data-testid="club-add-new-name" /></Field>
            <Field label="Città"><input className="fsl-input" value={nf.city} onChange={(e) => setNf({ ...nf, city: e.target.value })} /></Field>
            <Field label="Referente"><input className="fsl-input" value={nf.contact_name} onChange={(e) => setNf({ ...nf, contact_name: e.target.value })} /></Field>
            <Field label="Email referente"><input type="email" className="fsl-input" value={nf.email} onChange={(e) => setNf({ ...nf, email: e.target.value })} /></Field>
            <p className="col-span-2 text-[11px] text-fsl-slate">Dopo l'iscrizione potrai generare una volta sola il «codice FSL» con cui il responsabile crea il proprio account.</p>
          </div>
        )}
        {(picked.length > 0 || creating) && (
          <div>
            <div className="fsl-label mb-2">Categorie a cui partecipa{picked.length > 1 ? "no (valgono per tutte le società selezionate)" : ""}</div>
            <CategoryPicker categories={t.settings.categories} selected={cats} onChange={setCats} groups={clubGroups} />
          </div>
        )}
        <DialogFooter><button className="btn-ghost" onClick={onClose}>Annulla</button><button className="btn-gold" disabled={!canSubmit} onClick={submit} data-testid="club-add-submit"><Trophy className="h-4 w-4" /> {busy ? "Iscrivo…" : creating ? (cats.length ? `Iscrivi con ${cats.length} squadr${cats.length === 1 ? "a" : "e"}` : "Aggiungi al torneo") : picked.length > 1 ? `Iscrivi ${picked.length} società${nTeams ? ` · ${nTeams} squadre` : ""}` : cats.length ? `Iscrivi con ${cats.length} squadr${cats.length === 1 ? "a" : "e"}` : "Aggiungi al torneo"}</button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CategoriesDialog({ t, club, onClose, onDone }) {
  const [cats, setCats] = useState([]);
  const [groups, setGroups] = useState([]);
  const [busy, setBusy] = useState(false);
  const [existing, setExisting] = useState(club.categories || []);
  useEffect(() => { api.get("/org-groups").then((r) => setGroups((r.data.pending || []).filter((g) => g.org_key === club.org_key))).catch(() => {}); }, [club.org_key]);
  const removeTeam = async (cat) => {
    const tm = (club.teams || []).find((x) => x.category === cat);
    if (!tm) return;
    if (!window.confirm(`Eliminare definitivamente «${tm.name}» e la sua rosa?${tm.competition_id ? " Nel girone resterà un segnaposto con le stesse gare." : ""}`)) return;
    setBusy(true);
    try { const { data } = await api.delete(`/tournaments/${t.id}/simple/teams/${tm.id}`, { params: { hard: true } }); toast.success(`«${tm.name}» eliminata${data.players_removed ? ` · ${data.players_removed} giocatori rimossi` : ""}`); setExisting((e) => e.filter((x) => x !== cat)); onDone(data, { keepOpen: true }); } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  const submit = async () => {
    setBusy(true);
    try { const data = await enroll(club.org_key, t.id, cats); toast.success(`${data.teams.length} squadr${data.teams.length === 1 ? "a" : "e"} iscritt${data.teams.length === 1 ? "a" : "e"} per ${club.name}`); onDone(data); } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-navy-800 border-white/20 text-fsl-white rounded-xl max-w-2xl" data-testid="club-categories-dialog" aria-describedby={undefined}>
        <DialogHeader><DialogTitle className="font-display uppercase text-2xl">Categorie · {club.name}</DialogTitle></DialogHeader>
        <p className="text-xs text-fsl-slate">Una squadra e una rosa per ogni categoria. Le squadre nuove compaiono «fuori girone» in Gironi e calendario: lì le metti al posto di un segnaposto. Con il cestino elimini la squadra di una categoria (es. squadre di prova).</p>
        <CategoryPicker categories={t.settings.categories} selected={cats} onChange={setCats} existing={existing} groups={groups} onRemove={removeTeam} />
        <DialogFooter><button className="btn-ghost" onClick={onClose}>Annulla</button><button className="btn-gold" disabled={busy || cats.length === 0} onClick={submit} data-testid="club-categories-submit"><Plus className="h-4 w-4" /> {busy ? "Iscrivo…" : `Iscrivi ${cats.length || ""} squadr${cats.length === 1 ? "a" : "e"}`}</button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
