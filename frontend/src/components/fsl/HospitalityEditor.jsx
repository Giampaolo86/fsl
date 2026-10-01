import { BedDouble, Bus, Coffee, MapPin, Package, Plus, Trash2, Utensils } from "lucide-react";

export const HOSPITALITY_PRESETS = [
  { key: "lodging", label: "Pernotto atleti", audience: "athletes", unit: "a notte / persona", includes: ["lodging"] },
  { key: "lunch", label: "Pranzo atleti", audience: "athletes", unit: "a pasto", includes: ["lunch"] },
  { key: "dinner", label: "Cena atleti", audience: "athletes", unit: "a pasto", includes: ["dinner"] },
  { key: "parent_lunch", label: "Pranzo genitore", audience: "parents", unit: "a pasto", includes: ["lunch"] },
  { key: "parent_dinner", label: "Cena genitore", audience: "parents", unit: "a pasto", includes: ["dinner"] },
  { key: "parent_lodging", label: "Pernotto genitore", audience: "parents", unit: "a notte / persona", includes: ["lodging"] },
  { key: "transport", label: "Trasporto pullman", audience: "all", unit: "a persona", includes: ["transport"] },
  { key: "package", label: "Quota generale (pacchetto)", audience: "athletes", unit: "a persona · totale", includes: ["lodging", "breakfast", "lunch", "dinner"], description: "Es. 135 € a persona: pernotto, colazione, due pranzi e cena." },
];
export const UNITS = ["a persona", "a notte / persona", "a pasto", "a persona · totale", "a famiglia", "a squadra", "totale (forfait)"];
export const SERVICES = [["lodging", "Pernotto", BedDouble], ["breakfast", "Colazione", Coffee], ["lunch", "Pranzo", Utensils], ["dinner", "Cena", Utensils], ["transport", "Trasporto", Bus]];
export const AUDIENCE = { athletes: "Atleti e staff", parents: "Genitori e accompagnatori", all: "Tutti" };
export const fmtEur = (v) => `${Number(v || 0).toFixed(2).replace(".", ",")} €`;
export const ICON_FOR = (it) => { const inc = it.includes || []; if (inc.length > 1) return Package; if (inc.includes("lodging") || it.lodging) return BedDouble; if (inc.includes("transport") || it.transport) return Bus; if (inc.includes("breakfast")) return Coffee; return Utensils; };

const blank = (p = {}) => ({ key: `${p.key || "item"}_${Math.random().toString(36).slice(2, 7)}`, label: "", audience: "all", unit: "a persona", includes: [], enabled: true, price: 0, description: "", venue_name: "", address: "", maps_url: "", when: "", notes: "", ...p });

export function HospitalityEditor({ items, onChange }) {
  const list = items || [];
  const upd = (key, patch) => onChange(list.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const add = (p) => onChange([...list, blank(p)]);
  const remove = (key) => { if (window.confirm("Eliminare questo servizio dalle impostazioni? Le prenotazioni già ricevute restano in Ospitalità.")) onChange(list.filter((i) => i.key !== key)); };
  return (
    <div className="space-y-3" data-testid="hospitality-editor">
      <p className="text-xs text-fsl-slate">Servizi e quote del torneo: compaiono sulla home pubblica con prezzo, cosa include, struttura e link Google Maps. Le richieste arrivano in Control Room → «Ospitalità»; il pagamento avviene sul posto.</p>
      {list.length === 0 && <p className="text-sm text-fsl-slate rounded-lg border border-dashed border-white/15 p-4 text-center" data-testid="hospitality-empty">Nessun servizio: aggiungine uno qui sotto (singolo o pacchetto «quota generale»).</p>}
      {list.map((it) => {
        const Icon = ICON_FOR(it);
        return (
          <div key={it.key} className={`rounded-xl border p-3 transition-colors ${it.enabled ? "border-fsl-gold/40 bg-ink-950/50" : "border-white/10 bg-ink-950/20 opacity-70"}`} data-testid={`hospitality-item-${it.key}`}>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-2 text-sm" title="Visibile al pubblico"><input type="checkbox" checked={!!it.enabled} onChange={(e) => upd(it.key, { enabled: e.target.checked })} data-testid={`hospitality-enabled-${it.key}`} /><Icon className="h-4 w-4 text-fsl-gold" /></label>
              <input className="fsl-input h-9 flex-1 min-w-[180px] font-semibold" placeholder="Nome (es. Quota generale weekend)" value={it.label} onChange={(e) => upd(it.key, { label: e.target.value })} data-testid={`hospitality-label-${it.key}`} />
              <select className="fsl-input h-9 w-44 text-xs" value={it.audience} onChange={(e) => upd(it.key, { audience: e.target.value })} data-testid={`hospitality-audience-${it.key}`}>{Object.entries(AUDIENCE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <label className="inline-flex items-center gap-1 text-sm"><input type="number" min="0" step="0.5" className="fsl-input h-9 w-24 num" value={it.price} onChange={(e) => upd(it.key, { price: Number(e.target.value) })} data-testid={`hospitality-price-${it.key}`} /><span className="text-xs text-fsl-slate">€</span></label>
              <select className="fsl-input h-9 w-44 text-xs" value={UNITS.includes(it.unit) ? it.unit : "a persona"} onChange={(e) => upd(it.key, { unit: e.target.value })} data-testid={`hospitality-unit-${it.key}`}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select>
              <button type="button" className="btn-ghost h-9 px-2 text-fsl-danger" onClick={() => remove(it.key)} aria-label="Elimina servizio" data-testid={`hospitality-delete-${it.key}`}><Trash2 className="h-4 w-4" /></button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" data-testid={`hospitality-includes-${it.key}`}>
              <span className="text-fsl-slate uppercase tracking-wider text-[10px]">Include</span>
              {SERVICES.map(([k, label, I]) => (
                <label key={k} className="inline-flex items-center gap-1.5"><input type="checkbox" checked={(it.includes || []).includes(k)} onChange={(e) => upd(it.key, { includes: e.target.checked ? [...(it.includes || []), k] : (it.includes || []).filter((x) => x !== k) })} data-testid={`hospitality-inc-${k}-${it.key}`} /><I className="h-3 w-3 text-fsl-gold" /> {label}</label>
              ))}
            </div>
            <div className="mt-2 grid md:grid-cols-5 gap-2">
              <input className="fsl-input h-9 md:col-span-2" placeholder="Cosa comprende (es. pernotto, colazione, 2 pranzi, cena)" value={it.description} onChange={(e) => upd(it.key, { description: e.target.value })} data-testid={`hospitality-description-${it.key}`} />
              <input className="fsl-input h-9" placeholder="Struttura / luogo" value={it.venue_name} onChange={(e) => upd(it.key, { venue_name: e.target.value })} data-testid={`hospitality-venue-${it.key}`} />
              <input className="fsl-input h-9" placeholder="Indirizzo (link Google Maps)" value={it.address} onChange={(e) => upd(it.key, { address: e.target.value, maps_url: "" })} data-testid={`hospitality-address-${it.key}`} />
              <input className="fsl-input h-9" placeholder="Quando / orari" value={it.when} onChange={(e) => upd(it.key, { when: e.target.value })} data-testid={`hospitality-when-${it.key}`} />
              <input className="fsl-input h-9 md:col-span-5" placeholder="Note (menù, intolleranze, acconto…)" value={it.notes} onChange={(e) => upd(it.key, { notes: e.target.value })} data-testid={`hospitality-notes-${it.key}`} />
              {it.address && <a className="text-xs text-fsl-gold hover:underline inline-flex items-center gap-1 md:col-span-5" href={it.maps_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(it.address)}`} target="_blank" rel="noreferrer"><MapPin className="h-3 w-3" /> Apri su Google Maps</a>}
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-2 pt-1" data-testid="hospitality-add-bar">
        <button type="button" className="btn-gold h-9" onClick={() => add(HOSPITALITY_PRESETS[7])} data-testid="hospitality-add-package"><Package className="h-4 w-4" /> Aggiungi quota generale</button>
        {HOSPITALITY_PRESETS.slice(0, 7).map((p) => <button key={p.key} type="button" className="btn-ghost h-9 text-xs" onClick={() => add(p)} data-testid={`hospitality-add-${p.key}`}><Plus className="h-3.5 w-3.5" /> {p.label}</button>)}
        <button type="button" className="btn-ghost h-9 text-xs" onClick={() => add()} data-testid="hospitality-add-custom"><Plus className="h-3.5 w-3.5" /> Altro servizio</button>
      </div>
    </div>
  );
}
