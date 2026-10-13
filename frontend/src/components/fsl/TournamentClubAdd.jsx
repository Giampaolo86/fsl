import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Plus, Search, Trophy, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ClubCrest } from "@/components/fsl/ClubCrest";
import { api, apiError } from "@/lib/api";

const Field = ({ label, children }) => <label className="block"><span className="fsl-label">{label}</span><div className="mt-1">{children}</div></label>;

export function CategoryPicker({ categories, selected, onChange, existing = [], groups = [] }) {
  const byCat = Object.fromEntries(groups.map((g) => [g.category, g]));
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" data-testid="club-category-picker">
      {categories.map((cat) => { const has = existing.includes(cat); const g = byCat[cat]; const on = has || selected.includes(cat); return (
        <label key={cat} className={`rounded-md border px-3 py-2 text-sm cursor-pointer select-none ${on ? "border-fsl-gold/60 bg-fsl-gold/10" : "border-white/10 hover:border-white/30"} ${has ? "opacity-70 cursor-default" : ""}`}>
          <span className="flex items-center gap-2"><input type="checkbox" checked={on} disabled={has} onChange={(e) => onChange(e.target.checked ? [...selected, cat] : selected.filter((x) => x !== cat))} data-testid={`club-category-${cat}`} /><span className="num font-display font-bold text-fsl-gold text-base">{cat}</span></span>
          <span className="block text-[11px] text-fsl-slate mt-0.5">{has ? "già iscritta" : g ? `gruppo dichiarato${g.roster ? ` · rosa ${g.roster.rows} giocatori` : ""}` : "squadra + rosa"}</span>
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
  const [club, setClub] = useState(null);
  const [cats, setCats] = useState([]);
  const [creating, setCreating] = useState(false);
  const [nf, setNf] = useState({ name: "", city: "", contact_name: "", email: "", phone: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get("/org-clubs").then((r) => setRegistry(r.data.items || [])).catch((e) => toast.error(apiError(e))); api.get("/org-groups").then((r) => setGroups(r.data.pending || [])).catch(() => {}); }, []);
  const presentKeys = useMemo(() => new Set(present.map((c) => c.org_key || c.org_club_id)), [present]);
  const rows = useMemo(() => { const s = q.trim().toLowerCase(); return (registry || []).filter((c) => !s || c.name.toLowerCase().includes(s) || (c.city || "").toLowerCase().includes(s)).slice(0, 12); }, [registry, q]);
  const clubGroups = club ? groups.filter((g) => g.org_key === club.org_key) : [];
  const pick = (c) => { setClub(c); setCreating(false); setCats(groups.filter((g) => g.org_key === c.org_key).map((g) => g.category).filter((x) => t.settings.categories.includes(x))); };
  const submit = async () => {
    setBusy(true);
    try {
      let key = club?.org_key, name = club?.name;
      if (creating) { const r = await api.post("/org-clubs", { ...nf, name: nf.name || q }); key = r.data.org_key; name = r.data.name; }
      const data = await enroll(key, t.id, cats);
      toast.success(`«${name}» partecipa a ${t.name}${data.teams.length ? ` con ${data.teams.length} squadr${data.teams.length === 1 ? "a" : "e"}` : ""}`);
      onDone(data);
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  const canSubmit = !busy && (creating ? (nf.name || q).trim().length >= 2 : !!club);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-navy-800 border-white/20 text-fsl-white rounded-xl max-w-2xl" data-testid="club-add-dialog" aria-describedby={undefined}>
        <DialogHeader><DialogTitle className="font-display uppercase text-2xl">Aggiungi società al torneo</DialogTitle></DialogHeader>
        <p className="text-xs text-fsl-slate">Le società si registrano a FSL una sola volta. Qui scegli chi partecipa a <strong className="text-fsl-white">{t.name}</strong> e in quali categorie: per ogni categoria nasce una squadra con la sua rosa, e il responsabile trova subito il torneo nella sua Area Società. Nessun nuovo invito.</p>
        <div className="relative"><Search className="h-4 w-4 absolute left-3 top-3 text-fsl-slate" /><input className="fsl-input pl-9" autoFocus placeholder="Cerca nell'anagrafe FSL (nome o città)…" value={q} onChange={(e) => { setQ(e.target.value); if (club) setClub(null); setCreating(false); }} data-testid="club-add-search" /></div>
        {!registry ? <p className="text-sm text-fsl-slate">Carico l'anagrafe…</p> : (
          <div className="max-h-56 overflow-y-auto fsl-scroll rounded-md border border-white/10 divide-y divide-white/5" data-testid="club-add-results">
            {rows.map((c) => { const here = presentKeys.has(c.org_key); const sel = club?.org_key === c.org_key; return (
              <button key={c.org_key} type="button" disabled={here} onClick={() => pick(c)} className={`w-full text-left px-3 py-2 flex items-center gap-3 ${sel ? "bg-fsl-gold/10" : "hover:bg-white/5"} ${here ? "opacity-50" : ""}`} data-testid={`club-add-row-${c.org_key}`}>
                <ClubCrest club={c} size={28} />
                <span className="flex-1 min-w-0"><span className="block font-semibold truncate">{c.name}</span><span className="block text-[11px] text-fsl-slate truncate">{c.city || "—"} · {c.manager ? <><UserRound className="inline h-3 w-3 text-fsl-gold" /> {c.manager.full_name || c.manager.email}</> : "nessun responsabile registrato"}{c.pending_groups ? ` · ${c.pending_groups} grupp${c.pending_groups === 1 ? "o" : "i"} in attesa` : ""}</span></span>
                {here ? <span className="text-[11px] text-fsl-success inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> già nel torneo</span> : sel && <CheckCircle2 className="h-4 w-4 text-fsl-gold" />}
              </button>
            ); })}
            {rows.length === 0 && <p className="px-3 py-3 text-sm text-fsl-slate">Nessuna società trovata.</p>}
            <button type="button" onClick={() => { setCreating(true); setClub(null); setCats([]); setNf((f) => ({ ...f, name: q })); }} className={`w-full text-left px-3 py-2 text-sm inline-flex items-center gap-2 ${creating ? "bg-fsl-gold/10 text-fsl-gold" : "text-fsl-slate hover:bg-white/5"}`} data-testid="club-add-new"><Plus className="h-4 w-4" /> Non c'è: registra una nuova società FSL{q ? ` «${q}»` : ""}</button>
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
        {(club || creating) && (
          <div>
            <div className="fsl-label mb-2">Categorie a cui partecipa</div>
            <CategoryPicker categories={t.settings.categories} selected={cats} onChange={setCats} groups={clubGroups} />
          </div>
        )}
        <DialogFooter><button className="btn-ghost" onClick={onClose}>Annulla</button><button className="btn-gold" disabled={!canSubmit} onClick={submit} data-testid="club-add-submit"><Trophy className="h-4 w-4" /> {busy ? "Iscrivo…" : cats.length ? `Iscrivi con ${cats.length} squadr${cats.length === 1 ? "a" : "e"}` : "Aggiungi al torneo"}</button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CategoriesDialog({ t, club, onClose, onDone }) {
  const [cats, setCats] = useState([]);
  const [groups, setGroups] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get("/org-groups").then((r) => setGroups((r.data.pending || []).filter((g) => g.org_key === club.org_key))).catch(() => {}); }, [club.org_key]);
  const submit = async () => {
    setBusy(true);
    try { const data = await enroll(club.org_key, t.id, cats); toast.success(`${data.teams.length} squadr${data.teams.length === 1 ? "a" : "e"} iscritt${data.teams.length === 1 ? "a" : "e"} per ${club.name}`); onDone(data); } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-navy-800 border-white/20 text-fsl-white rounded-xl max-w-2xl" data-testid="club-categories-dialog" aria-describedby={undefined}>
        <DialogHeader><DialogTitle className="font-display uppercase text-2xl">Categorie · {club.name}</DialogTitle></DialogHeader>
        <p className="text-xs text-fsl-slate">Una squadra e una rosa per ogni categoria. Le squadre nuove compaiono «fuori girone» in Gironi e calendario: lì le metti al posto di un segnaposto.</p>
        <CategoryPicker categories={t.settings.categories} selected={cats} onChange={setCats} existing={club.categories || []} groups={groups} />
        <DialogFooter><button className="btn-ghost" onClick={onClose}>Annulla</button><button className="btn-gold" disabled={busy || cats.length === 0} onClick={submit} data-testid="club-categories-submit"><Plus className="h-4 w-4" /> {busy ? "Iscrivo…" : `Iscrivi ${cats.length || ""} squadr${cats.length === 1 ? "a" : "e"}`}</button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
