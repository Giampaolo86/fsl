import { useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, apiError } from "@/lib/api";

export const FOOT_LABEL = { destro: "Destro", sinistro: "Sinistro", ambidestro: "Ambidestro" };

function Field({ label, children }) { return <label className="block"><span className="fsl-label">{label}</span><div className="mt-1">{children}</div></label>; }

export function PlayerProfileEditor({ open, onClose, tournamentId, card, onSaved }) {
  const p = card.profile || {};
  const [f, setF] = useState({ height_cm: p.height_cm ?? "", weight_kg: p.weight_kg ?? "", foot: p.foot || "", quote: p.quote || "", nickname: p.nickname || "", idol: p.idol || "", favorite_team: p.favorite_team || "", bio: p.bio || "", tagline: p.tagline || "", strengths: (p.strengths || []).join(", "), testimonials: p.testimonials?.length ? p.testimonials : [{ author: "", text: "" }], guardian_emails: (card.guardian_emails || []).join(", ") });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF({ ...f, [k]: v });
  const setT = (i, k, v) => set("testimonials", f.testimonials.map((t, j) => (j === i ? { ...t, [k]: v } : t)));
  const staff = card.can_edit === "staff" || card.can_edit === "club";
  const save = async () => {
    setBusy(true);
    try {
      const body = { ...f, testimonials: f.testimonials.filter((t) => t.text.trim()), strengths: f.strengths.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean).slice(0, 6) };
      if (staff) body.guardian_emails = f.guardian_emails.split(/[,;\s]+/).filter(Boolean); else delete body.guardian_emails;
      await api.put(`/tournaments/${tournamentId}/players/${card.player_id}/profile`, body);
      toast.success("Scheda aggiornata");
      onSaved();
      onClose();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-navy-800 border-white/20 text-fsl-white rounded-xl max-w-2xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined} data-testid="player-profile-editor">
        <DialogHeader><DialogTitle className="font-display uppercase text-2xl">Mi presento · {card.name}</DialogTitle></DialogHeader>
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Altezza (cm)"><input type="number" className="fsl-input num" value={f.height_cm} onChange={(e) => set("height_cm", e.target.value)} data-testid="pp-height" /></Field>
          <Field label="Peso (kg)"><input type="number" className="fsl-input num" value={f.weight_kg} onChange={(e) => set("weight_kg", e.target.value)} data-testid="pp-weight" /></Field>
          <Field label="Piede preferito"><select className="fsl-input" value={f.foot} onChange={(e) => set("foot", e.target.value)} data-testid="pp-foot"><option value="">—</option>{Object.entries(FOOT_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Soprannome"><input className="fsl-input" value={f.nickname} onChange={(e) => set("nickname", e.target.value)} data-testid="pp-nickname" /></Field>
          <Field label="Il mio idolo"><input className="fsl-input" value={f.idol} onChange={(e) => set("idol", e.target.value)} data-testid="pp-idol" /></Field>
          <Field label="Squadra del cuore"><input className="fsl-input" value={f.favorite_team} onChange={(e) => set("favorite_team", e.target.value)} data-testid="pp-favorite-team" /></Field>
        </div>
        <Field label="Profilo del giocatore (bio)"><textarea className="fsl-input h-28 py-2" placeholder="Es. Riccardo è un portiere classe 2014: reattività tra i pali, ottima lettura del gioco e sicurezza nelle uscite alte…" value={f.bio} onChange={(e) => set("bio", e.target.value)} maxLength={1200} data-testid="pp-bio" /></Field>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Punti di forza (max 6, separati da virgola)"><input className="fsl-input" placeholder="Reattività, Uscite alte, Personalità, Gioco con i piedi" value={f.strengths} onChange={(e) => set("strengths", e.target.value)} data-testid="pp-strengths" /></Field>
          <Field label="Tagline (riga sotto il nome)"><input className="fsl-input" placeholder="Portiere · Leader difensivo · Top performer" value={f.tagline} onChange={(e) => set("tagline", e.target.value)} maxLength={120} data-testid="pp-tagline" /></Field>
        </div>
        <Field label="La mia citazione"><textarea className="fsl-input h-20 py-2" placeholder="Es. «Il pallone è il mio migliore amico»" value={f.quote} onChange={(e) => set("quote", e.target.value)} data-testid="pp-quote" /></Field>
        <div>
          <div className="flex items-center justify-between mb-1"><span className="fsl-label">Dicono di me</span><button type="button" className="text-xs text-fsl-gold inline-flex items-center gap-1" onClick={() => set("testimonials", [...f.testimonials, { author: "", text: "" }])} disabled={f.testimonials.length >= 8} data-testid="pp-add-testimonial"><Plus className="h-3 w-3" /> Aggiungi</button></div>
          <div className="space-y-2">{f.testimonials.map((t, i) => <div key={i} className="grid grid-cols-[1fr_2fr_auto] gap-2"><input className="fsl-input h-10" placeholder="Chi (es. il mister)" value={t.author} onChange={(e) => setT(i, "author", e.target.value)} data-testid={`pp-testimonial-author-${i}`} /><input className="fsl-input h-10" placeholder="Cosa dice" value={t.text} onChange={(e) => setT(i, "text", e.target.value)} data-testid={`pp-testimonial-text-${i}`} /><button type="button" className="text-fsl-danger" onClick={() => set("testimonials", f.testimonials.filter((_, j) => j !== i))} aria-label="Rimuovi"><Trash2 className="h-4 w-4" /></button></div>)}</div>
        </div>
        {staff && <Field label="Email genitore/tutore (abbinamento account: chi accede con queste email può modificare la scheda)"><input className="fsl-input" placeholder="mamma@email.it, papa@email.it" value={f.guardian_emails} onChange={(e) => set("guardian_emails", e.target.value)} data-testid="pp-guardians" /></Field>}
        <DialogFooter><button className="btn-ghost" onClick={onClose}>Annulla</button><button className="btn-gold" disabled={busy} onClick={save} data-testid="pp-save"><Save className="h-4 w-4" /> Salva</button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
