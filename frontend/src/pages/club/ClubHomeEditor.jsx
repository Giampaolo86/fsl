import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Eye, Save, Upload } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/fsl/Primitives";
import { EmptyState, LoadingState } from "@/components/fsl/States";
import { useAuth } from "@/context/AuthContext";
import { api, apiError } from "@/lib/api";
import { mediaUrl, uploadMedia } from "@/lib/upload";

const SERVICES = ["Parcheggio interno", "Spogliatoi", "Bar e area ristoro", "Primo soccorso", "Accessibilità disabili", "Defibrillatore", "Tribuna", "Campo in erba sintetica"];
const STATUS = { approved: ["Pubblicata", "text-fsl-success"], pending_review: ["In attesa di approvazione admin", "text-fsl-warning"], rejected: ["Modifiche respinte", "text-fsl-danger"] };

function Field({ label, children }) { return <label className="block"><span className="fsl-label">{label}</span><div className="mt-1">{children}</div></label>; }

export default function ClubHomeEditor({ adminMode = false }) {
  const { user } = useAuth();
  const params = useParams();
  const membership = user.memberships?.find((m) => m.role === "club_manager");
  const tid = adminMode ? params.tournamentId : membership?.tournament_id;
  const cid = adminMode ? params.clubId : membership?.club_id;
  const [data, setData] = useState(null);
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const [slug, setSlug] = useState(null);
  const load = () => api.get(`/tournaments/${tid}/clubs/${cid}/profile`).then((r) => { setData(r.data); const c = r.data.club; setSlug(c.slug); setF({ name: c.name, short_name: c.short_name || "", city: c.city || "", motto: c.motto || "", description: c.description || "", colors: c.colors, crest_url: c.crest_url, cover_url: c.cover_url, founded_year: c.founded_year || "", phone: "", whatsapp: "", email: "", website: "", instagram: "", address: "", hours_office: "", hours_field: "", directions: "", services: [], manager: { name: "", role: "", phone: "", email: "", photo_url: null }, ...r.data.profile, ...(r.data.draft || {}) }); });
  useEffect(() => { if (tid && cid) load(); }, [tid, cid]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!tid || !cid) return <EmptyState title="Nessuna società assegnata" />;
  if (!f) return <LoadingState />;
  const set = (k, v) => setF({ ...f, [k]: v });
  const up = async (file, k, sub) => { try { const m = await uploadMedia(tid, file); if (sub) set(k, { ...f[k], [sub]: m.url }); else set(k, m.url); toast.success("Immagine caricata"); } catch (e) { toast.error(apiError(e)); } };
  const save = async () => { setBusy(true); try { const body = { ...f, founded_year: f.founded_year ? Number(f.founded_year) : null }; const r = await api.put(`/tournaments/${tid}/clubs/${cid}/profile`, body); toast.success(r.data.approval_status === "pending_review" ? "Modifiche inviate: saranno pubblicate dopo l'approvazione dell'admin" : "Homepage aggiornata"); load(); } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); } };
  const [sl, tone] = STATUS[data.approval_status] || STATUS.approved;
  const slugT = data.club.tournament_slug;
  return (
    <div className="space-y-6" data-testid="club-home-editor">
      <PageHeader kicker={adminMode ? "Control Room · Società" : "Area Società"} title={adminMode ? data.club.name : "La mia homepage"} subtitle={adminMode ? "Modifica direttamente identità, immagini, contatti e sede della società: le modifiche dell'admin sono pubblicate subito, senza approvazione." : "Racconta la tua società a genitori e tifosi: stemma, colori, sede, contatti, responsabile. Le modifiche vanno in approvazione all'admin prima di essere pubbliche."} actions={<>{adminMode && <Link to={`/admin/t/${tid}/societa`} className="btn-ghost" data-testid="club-home-back"><ArrowLeft className="h-4 w-4" /> Società</Link>}{slug && slugT && <Link to={`/tornei/${slugT}/squadre/${slug}`} className="btn-ghost" target="_blank" data-testid="club-home-preview"><Eye className="h-4 w-4" /> Vedi pagina pubblica</Link>}<button className="btn-gold" disabled={busy} onClick={save} data-testid="club-home-save"><Save className="h-4 w-4" /> {adminMode ? "Salva e pubblica" : "Salva e invia"}</button></>} />
      <p className={`text-sm font-semibold ${tone}`} data-testid="club-home-status">● {sl}{data.review_note ? ` · ${data.review_note}` : ""}</p>
      <div className="grid lg:grid-cols-2 gap-5">
        <section className="fsl-card p-5 space-y-3"><h2 className="fsl-kicker">Identità</h2>
          {adminMode && <div className="grid grid-cols-3 gap-3"><Field label="Nome società"><input className="fsl-input" value={f.name || ""} onChange={(e) => set("name", e.target.value)} data-testid="club-home-name" /></Field><Field label="Nome breve"><input className="fsl-input" value={f.short_name || ""} onChange={(e) => set("short_name", e.target.value)} data-testid="club-home-short-name" /></Field><Field label="Città"><input className="fsl-input" value={f.city || ""} onChange={(e) => set("city", e.target.value)} data-testid="club-home-city" /></Field></div>}
          <Field label="Motto"><input className="fsl-input" value={f.motto} onChange={(e) => set("motto", e.target.value)} placeholder="Passione. Rispetto. Crescita." data-testid="club-home-motto" /></Field>
          <Field label="Descrizione"><textarea className="fsl-input h-24 py-2" value={f.description} onChange={(e) => set("description", e.target.value)} data-testid="club-home-description" /></Field>
          <div className="grid grid-cols-3 gap-3"><Field label="Colore primario"><input type="color" className="fsl-input h-10 p-1" value={f.colors?.primary || "#7A1E2C"} onChange={(e) => set("colors", { ...f.colors, primary: e.target.value })} /></Field><Field label="Colore secondario"><input type="color" className="fsl-input h-10 p-1" value={f.colors?.secondary || "#F4AE2B"} onChange={(e) => set("colors", { ...f.colors, secondary: e.target.value })} /></Field><Field label="Anno fondazione"><input type="number" className="fsl-input num" value={f.founded_year} onChange={(e) => set("founded_year", e.target.value)} /></Field></div>
          <div className="grid grid-cols-2 gap-3">{[["crest_url", "Stemma (quadrato)"], ["cover_url", "Foto di copertina"]].map(([k, l]) => <div key={k}><div className="fsl-label mb-1">{l}</div><label className="relative block h-28 rounded-md border border-dashed border-white/25 overflow-hidden cursor-pointer hover:border-fsl-gold/60">{f[k] ? <img src={mediaUrl(f[k])} alt="" className="h-full w-full object-cover" /> : <span className="h-full flex items-center justify-center gap-2 text-xs text-fsl-slate"><Upload className="h-4 w-4" /> Carica</span>}<input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files[0] && up(e.target.files[0], k)} data-testid={`club-home-${k}`} /></label></div>)}</div>
          <div>
            <div className="fsl-label mb-1">Gallery (fino a 4 foto)</div>
            <p className="text-[11px] text-fsl-slate mb-2">Finché non carichi le tue foto, la homepage mostra copertina e gallery FSL di base.</p>
            <div className="grid grid-cols-4 gap-2" data-testid="club-home-gallery-editor">
              {[0, 1, 2, 3].map((i) => { const u = (f.gallery_urls || [])[i]; return (
                <label key={i} className="relative block aspect-square rounded-md border border-dashed border-white/25 overflow-hidden cursor-pointer hover:border-fsl-gold/60">
                  {u ? <img src={mediaUrl(u)} alt="" className="h-full w-full object-cover" /> : <span className="h-full flex items-center justify-center text-fsl-slate"><Upload className="h-4 w-4" /></span>}
                  <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const file = e.target.files[0]; if (!file) return; try { const m = await uploadMedia(tid, file); const g = [...(f.gallery_urls || [])]; g[i] = m.url; set("gallery_urls", g.filter(Boolean)); toast.success("Foto caricata"); } catch (err) { toast.error(apiError(err)); } }} data-testid={`club-home-gallery-${i}`} />
                </label>
              ); })}
            </div>
          </div>

        </section>
        <section className="fsl-card p-5 space-y-3"><h2 className="fsl-kicker">Contatti e social</h2>
          <div className="grid grid-cols-2 gap-3">{[["phone", "Telefono"], ["whatsapp", "WhatsApp"], ["email", "Email"], ["website", "Sito web"], ["instagram", "Instagram"]].map(([k, l]) => <Field key={k} label={l}><input className="fsl-input" value={f[k] || ""} onChange={(e) => set(k, e.target.value)} data-testid={`club-home-${k}`} /></Field>)}</div>
          <h2 className="fsl-kicker pt-2">Responsabile della società</h2>
          <div className="flex items-start gap-3"><label className="h-20 w-20 shrink-0 rounded-full overflow-hidden border border-dashed border-white/25 cursor-pointer inline-flex items-center justify-center hover:border-fsl-gold/60">{f.manager?.photo_url ? <img src={mediaUrl(f.manager.photo_url)} alt="" className="h-full w-full object-cover" /> : <Upload className="h-4 w-4 text-fsl-slate" />}<input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files[0] && up(e.target.files[0], "manager", "photo_url")} /></label><div className="grid grid-cols-2 gap-2 flex-1">{[["name", "Nome"], ["role", "Ruolo"], ["phone", "Telefono"], ["email", "Email"]].map(([k, l]) => <input key={k} className="fsl-input h-10" placeholder={l} value={f.manager?.[k] || ""} onChange={(e) => set("manager", { ...f.manager, [k]: e.target.value })} data-testid={`club-home-manager-${k}`} />)}</div></div>
        </section>
        <section className="fsl-card p-5 space-y-3 lg:col-span-2"><h2 className="fsl-kicker">Sede</h2>
          <div className="grid md:grid-cols-2 gap-3"><Field label="Indirizzo"><input className="fsl-input" value={f.address || ""} onChange={(e) => set("address", e.target.value)} data-testid="club-home-address" /></Field><Field label="Come arrivare (auto, metro, bus…)"><textarea className="fsl-input h-20 py-2" value={f.directions || ""} onChange={(e) => set("directions", e.target.value)} /></Field><Field label="Orari segreteria"><textarea className="fsl-input h-16 py-2" value={f.hours_office || ""} onChange={(e) => set("hours_office", e.target.value)} placeholder={"Lun–Ven 16:00–20:00\nSab 09:00–13:00"} /></Field><Field label="Orari campo"><textarea className="fsl-input h-16 py-2" value={f.hours_field || ""} onChange={(e) => set("hours_field", e.target.value)} /></Field></div>
          <div><div className="fsl-label mb-1">Servizi della sede</div><div className="flex flex-wrap gap-1.5">{SERVICES.map((s) => { const on = (f.services || []).includes(s); return <button key={s} type="button" onClick={() => set("services", on ? f.services.filter((x) => x !== s) : [...(f.services || []), s])} className={`h-8 px-3 rounded-full text-xs border ${on ? "bg-fsl-gold text-ink-950 border-fsl-gold" : "border-white/20 text-fsl-slate"}`} aria-pressed={on}>{s}</button>; })}</div></div>
        </section>
      </div>
    </div>
  );
}
