import { useState } from "react";
import { Check, ExternalLink, Grid3X3, MapPin, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionTitle } from "@/components/fsl/Primitives";
import { ErrorState, LoadingState } from "@/components/fsl/States";
import { useScoped, useTournamentDetail } from "@/hooks/useTournamentData";
import { api, apiError } from "@/lib/api";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const SERVICES = ["Parcheggio interno", "Spogliatoi", "Bar & area ristoro", "Primo soccorso", "Accessibilità disabili", "Defibrillatore", "Tribuna coperta", "Illuminazione serale"];
const SURFACES = ["sintetico", "erba naturale", "terra", "indoor"];
const EMPTY_VENUE = { name: "", address: "", city: "", maps_url: "", services: [], notes: "" };

function Field({ label, hint, children }) {
  return <label className="block"><span className="fsl-label">{label}</span>{children}{hint && <span className="mt-1 block text-[11px] text-fsl-slate">{hint}</span>}</label>;
}

function VenueDialog({ tid, venue, onClose, onSaved }) {
  const [f, setF] = useState(venue ? { ...EMPTY_VENUE, ...venue } : EMPTY_VENUE);
  const [busy, setBusy] = useState(false);
  const up = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    setBusy(true);
    try { venue ? await api.patch(`/tournaments/${tid}/venues/${venue.id}`, f) : await api.post(`/tournaments/${tid}/venues`, f); toast.success(venue ? "Sede aggiornata" : "Sede creata"); onSaved(); onClose(); } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-navy-800 border-white/20 text-fsl-white rounded-xl max-w-xl" aria-describedby={undefined} data-testid="venue-dialog">
        <DialogHeader><DialogTitle className="font-display uppercase text-2xl">{venue ? "Modifica sede" : "Nuova sede"}</DialogTitle></DialogHeader>
        <Field label="Nome sede"><input className="fsl-input" value={f.name} onChange={(e) => up("name", e.target.value)} placeholder="Es. Centro Sportivo Aurora" data-testid="venue-name-input" /></Field>
        <div className="grid sm:grid-cols-[1fr_160px] gap-3">
          <Field label="Indirizzo"><input className="fsl-input" value={f.address} onChange={(e) => up("address", e.target.value)} placeholder="Via delle Stelle 24" data-testid="venue-address-input" /></Field>
          <Field label="Città"><input className="fsl-input" value={f.city} onChange={(e) => up("city", e.target.value)} placeholder="Roma" data-testid="venue-city-input" /></Field>
        </div>
        <Field label="Link Google Maps" hint="Incolla il link «Condividi» di Google Maps. Se vuoto, il link viene generato dall'indirizzo."><input className="fsl-input" value={f.maps_url} onChange={(e) => up("maps_url", e.target.value)} placeholder="https://maps.app.goo.gl/…" data-testid="venue-maps-input" /></Field>
        <div>
          <span className="fsl-label">Servizi</span>
          <div className="flex flex-wrap gap-2">{SERVICES.map((s) => <button key={s} type="button" className={`h-8 px-3 rounded-full border text-xs ${f.services.includes(s) ? "border-fsl-gold bg-fsl-gold text-ink-950 font-bold" : "border-white/20 text-fsl-slate"}`} onClick={() => up("services", f.services.includes(s) ? f.services.filter((x) => x !== s) : [...f.services, s])} data-testid={`venue-service-${s}`}>{s}</button>)}</div>
        </div>
        <Field label="Note (opzionale)"><input className="fsl-input" value={f.notes} onChange={(e) => up("notes", e.target.value)} placeholder="Ingresso da via secondaria, parcheggio pullman…" data-testid="venue-notes-input" /></Field>
        <DialogFooter>
          <button type="button" className="btn-ghost h-10" onClick={onClose} data-testid="venue-cancel">Annulla</button>
          <button type="button" className="btn-gold h-10" disabled={busy || !f.name.trim()} onClick={save} data-testid="venue-save">{busy ? "Salvo…" : "Salva sede"}</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FieldRow({ f, venues, canWrite, tid, reload }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState({ code: f.code, name: f.name, venue_id: f.venue_id || "", size: f.size, surface: f.surface });
  const save = async () => { try { await api.patch(`/tournaments/${tid}/fields/${f.id}`, { ...v, size: Number(v.size) }); toast.success("Campo aggiornato"); setEdit(false); reload(); } catch (e) { toast.error(apiError(e)); } };
  const toggle = async () => { try { await api.patch(`/tournaments/${tid}/fields/${f.id}`, { active: !f.active }); reload(); } catch (e) { toast.error(apiError(e)); } };
  const remove = async () => { if (!window.confirm(`Eliminare il campo ${f.code} · ${f.name}?`)) return; try { await api.delete(`/tournaments/${tid}/fields/${f.id}`); toast.success("Campo eliminato"); reload(); } catch (e) { toast.error(apiError(e)); } };
  if (edit) return (
    <tr data-testid={`field-row-${f.code}`} className="bg-white/[0.03]">
      <td><input className="fsl-input h-9 w-20 uppercase" value={v.code} onChange={(e) => setV({ ...v, code: e.target.value })} data-testid="field-edit-code" /></td>
      <td><input className="fsl-input h-9 w-40" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} data-testid="field-edit-name" /></td>
      <td><select className="fsl-input h-9" value={v.venue_id} onChange={(e) => setV({ ...v, venue_id: e.target.value })} data-testid="field-edit-venue"><option value="">— nessuna sede —</option>{venues.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></td>
      <td><select className="fsl-input h-9 w-32" value={v.size} onChange={(e) => setV({ ...v, size: e.target.value })} data-testid="field-edit-size">{[5, 7, 8, 9, 11].map((n) => <option key={n} value={n}>Calcio a {n}</option>)}</select></td>
      <td><select className="fsl-input h-9 w-36" value={v.surface} onChange={(e) => setV({ ...v, surface: e.target.value })} data-testid="field-edit-surface">{SURFACES.map((s) => <option key={s} value={s}>{s}</option>)}</select></td>
      <td><div className="flex gap-1"><button className="btn-gold h-9 px-3" onClick={save} data-testid="field-edit-save"><Check className="h-4 w-4" /></button><button className="btn-ghost h-9 px-3" onClick={() => setEdit(false)} data-testid="field-edit-cancel"><X className="h-4 w-4" /></button></div></td>
    </tr>
  );
  return (
    <tr data-testid={`field-row-${f.code}`} className={f.active ? "" : "opacity-60"}>
      <td className="num font-semibold">{f.code}</td>
      <td>{f.name}</td>
      <td className="text-fsl-slate">{venues.find((x) => x.id === f.venue_id)?.name || "—"}</td>
      <td className="num">Calcio a {f.size}</td>
      <td className="text-fsl-slate">{f.surface}</td>
      <td>
        <div className="flex items-center gap-2">
          <button className={`inline-flex items-center gap-1.5 text-xs ${f.active ? "text-fsl-success" : "text-fsl-warning"}`} disabled={!canWrite} onClick={toggle} title={canWrite ? "Attiva/disattiva" : ""} data-testid={`field-toggle-${f.code}`}><Grid3X3 className="h-3.5 w-3.5" /> {f.active ? "Attivo" : "Disattivato"}</button>
          {canWrite && <><button className="btn-ghost h-8 px-2" onClick={() => setEdit(true)} data-testid={`field-edit-${f.code}`}><Pencil className="h-3.5 w-3.5" /></button><button className="btn-ghost h-8 px-2 text-fsl-danger" onClick={remove} data-testid={`field-delete-${f.code}`}><Trash2 className="h-3.5 w-3.5" /></button></>}
        </div>
      </td>
    </tr>
  );
}

export default function Venues() {
  const { data: t } = useTournamentDetail();
  const { data, error, loading, reload } = useScoped("venues");
  const [name, setName] = useState("");
  const [venueId, setVenueId] = useState("");
  const [dialog, setDialog] = useState(null);
  if (loading || !t) return <LoadingState />;
  if (error) return <ErrorState message={apiError(error)} onRetry={reload} />;
  const canWrite = ["super_admin", "director"].includes(t.my_role) && !t.read_only;

  const addField = async () => {
    try { await api.post(`/tournaments/${t.id}/fields`, { name: name || `Campo ${data.fields.length + 1}`, venue_id: venueId || data.venues[0]?.id }); toast.success("Campo aggiunto"); setName(""); reload(); } catch (e) { toast.error(apiError(e)); }
  };
  const removeVenue = async (v) => { if (!window.confirm(`Eliminare la sede «${v.name}»?`)) return; try { await api.delete(`/tournaments/${t.id}/venues/${v.id}`); toast.success("Sede eliminata"); reload(); } catch (e) { toast.error(apiError(e)); } };

  return (
    <div className="space-y-8">
      <PageHeader kicker="Campi, sedi e disponibilità" title="Campi" subtitle={`${data.fields.length} campi configurati in ${data.venues.length} sedi.`} />
      <section>
        <SectionTitle right={canWrite && <button className="btn-primary h-9" onClick={() => setDialog({})} data-testid="venue-add-button"><Plus className="h-4 w-4" /> Nuova sede</button>}>Sedi</SectionTitle>
        <div className="grid md:grid-cols-2 gap-4">
          {data.venues.length === 0 && <p className="text-sm text-fsl-slate">Nessuna sede: creane una per assegnare i campi e mostrare l'indirizzo alle famiglie.</p>}
          {data.venues.map((v) => (
            <div key={v.id} className="fsl-card p-5" data-testid={`venue-card-${v.id}`}>
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 text-fsl-gold mt-1" aria-hidden="true" />
                <div className="flex-1 min-w-0"><span className="font-semibold">{v.name}</span><p className="text-sm text-fsl-slate mt-0.5">{[v.address, v.city].filter(Boolean).join(", ") || "Indirizzo da completare"}</p></div>
                {canWrite && <div className="flex gap-1"><button className="btn-ghost h-8 px-2" onClick={() => setDialog({ venue: v })} data-testid={`venue-edit-${v.id}`}><Pencil className="h-3.5 w-3.5" /></button><button className="btn-ghost h-8 px-2 text-fsl-danger" onClick={() => removeVenue(v)} data-testid={`venue-delete-${v.id}`}><Trash2 className="h-3.5 w-3.5" /></button></div>}
              </div>
              {v.maps_url && <a href={v.maps_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-xs text-fsl-gold hover:underline" data-testid={`venue-maps-${v.id}`}><ExternalLink className="h-3.5 w-3.5" /> Apri in Google Maps</a>}
              {v.services?.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{v.services.map((s) => <span key={s} className="text-[11px] px-2 h-6 inline-flex items-center rounded-full border border-white/15 text-fsl-slate">{s}</span>)}</div>}
              {v.notes && <p className="mt-2 text-xs text-fsl-slate">{v.notes}</p>}
              <div className="mt-2 text-[11px] text-fsl-slate num">{data.fields.filter((f) => f.venue_id === v.id).length} campi</div>
            </div>
          ))}
        </div>
      </section>
      <section>
        <SectionTitle right={canWrite && (
          <div className="flex flex-wrap gap-2">
            <select className="fsl-input h-9 w-44" value={venueId} onChange={(e) => setVenueId(e.target.value)} data-testid="field-venue-select"><option value="">{data.venues[0]?.name || "Sede"}</option>{data.venues.slice(1).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
            <input className="fsl-input h-9 w-40" placeholder="Nome campo" value={name} onChange={(e) => setName(e.target.value)} data-testid="field-name-input" />
            <button className="btn-primary h-9" onClick={addField} data-testid="field-add-button"><Plus className="h-4 w-4" /> Aggiungi</button>
          </div>
        )}>Campi</SectionTitle>
        <div className="fsl-card overflow-x-auto">
          <table className="w-full table-dark" data-testid="fields-table">
            <thead><tr><th>Codice</th><th>Nome</th><th>Sede</th><th>Formato</th><th>Superficie</th><th>Stato</th></tr></thead>
            <tbody>{data.fields.map((f) => <FieldRow key={f.id} f={f} venues={data.venues} canWrite={canWrite} tid={t.id} reload={reload} />)}</tbody>
          </table>
        </div>
      </section>
      {dialog && <VenueDialog tid={t.id} venue={dialog.venue} onClose={() => setDialog(null)} onSaved={reload} />}
    </div>
  );
}
