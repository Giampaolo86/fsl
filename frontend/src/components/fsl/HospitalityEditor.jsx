import { BedDouble, Bus, MapPin, Utensils } from "lucide-react";

export const HOSPITALITY_PRESETS = [
  { key: "lodging", label: "Pernotto atleti", audience: "athletes", unit: "a notte / persona", lodging: true },
  { key: "lunch", label: "Pranzo atleti", audience: "athletes", unit: "a pasto" },
  { key: "dinner", label: "Cena atleti", audience: "athletes", unit: "a pasto" },
  { key: "parent_lunch", label: "Pranzo genitore", audience: "parents", unit: "a pasto" },
  { key: "parent_dinner", label: "Cena genitore", audience: "parents", unit: "a pasto" },
  { key: "parent_lodging", label: "Pernotto genitore", audience: "parents", unit: "a notte / persona", lodging: true },
  { key: "transport", label: "Trasporto pullman", audience: "all", unit: "a persona", transport: true },
];

export const ICON_FOR = (it) => (it.lodging ? BedDouble : it.transport ? Bus : Utensils);
export const AUDIENCE = { athletes: "Atleti e staff", parents: "Genitori e accompagnatori", all: "Tutti" };
export const fmtEur = (v) => `${Number(v || 0).toFixed(2).replace(".", ",")} €`;

export function mergeHospitality(saved) {
  const map = Object.fromEntries((saved || []).filter((i) => i.key).map((i) => [i.key, i]));
  return HOSPITALITY_PRESETS.map((p) => ({ ...p, enabled: false, price: 0, venue_name: "", address: "", maps_url: "", when: "", notes: "", ...(map[p.key] || {}) }));
}

export function HospitalityEditor({ items, onChange }) {
  const list = mergeHospitality(items);
  const upd = (key, patch) => onChange(list.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  return (
    <div className="space-y-3" data-testid="hospitality-editor">
      <p className="text-xs text-fsl-slate">Servizi informativi del torneo: compaiono sulla home pubblica con prezzo, struttura e link Google Maps. Le richieste di prenotazione arrivano in Control Room → «Ospitalità», il pagamento avviene sul posto.</p>
      {list.map((it) => {
        const Icon = ICON_FOR(it);
        return (
          <div key={it.key} className={`rounded-xl border p-3 transition-colors ${it.enabled ? "border-fsl-gold/40 bg-ink-950/50" : "border-white/10 bg-ink-950/20"}`} data-testid={`hospitality-item-${it.key}`}>
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 text-sm font-semibold min-w-[200px]"><input type="checkbox" checked={!!it.enabled} onChange={(e) => upd(it.key, { enabled: e.target.checked })} data-testid={`hospitality-enabled-${it.key}`} /><Icon className="h-4 w-4 text-fsl-gold" /> {it.label}</label>
              <span className="text-[11px] uppercase tracking-wider text-fsl-slate">{AUDIENCE[it.audience]}</span>
              <label className="ml-auto inline-flex items-center gap-2 text-sm"><span className="fsl-label">Quota (€)</span><input type="number" min="0" step="0.5" className="fsl-input h-9 w-24 num" value={it.price} onChange={(e) => upd(it.key, { price: Number(e.target.value) })} disabled={!it.enabled} data-testid={`hospitality-price-${it.key}`} /><span className="text-xs text-fsl-slate">{it.unit}</span></label>
            </div>
            {it.enabled && (
              <div className="mt-3 grid md:grid-cols-4 gap-2">
                <input className="fsl-input h-9" placeholder={it.transport ? "Punto di partenza" : it.lodging ? "Struttura (hotel, ostello…)" : "Luogo (ristorante, mensa…)"} value={it.venue_name} onChange={(e) => upd(it.key, { venue_name: e.target.value })} data-testid={`hospitality-venue-${it.key}`} />
                <input className="fsl-input h-9" placeholder="Indirizzo (genera il link Google Maps)" value={it.address} onChange={(e) => upd(it.key, { address: e.target.value, maps_url: "" })} data-testid={`hospitality-address-${it.key}`} />
                <input className="fsl-input h-9" placeholder={it.transport ? "Orari / tappe" : "Quando (es. sabato 13:00)"} value={it.when} onChange={(e) => upd(it.key, { when: e.target.value })} data-testid={`hospitality-when-${it.key}`} />
                <input className="fsl-input h-9" placeholder="Note (menù, cosa include…)" value={it.notes} onChange={(e) => upd(it.key, { notes: e.target.value })} data-testid={`hospitality-notes-${it.key}`} />
                {it.address && <a className="text-xs text-fsl-gold hover:underline inline-flex items-center gap-1 md:col-span-4" href={it.maps_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(it.address)}`} target="_blank" rel="noreferrer"><MapPin className="h-3 w-3" /> Apri su Google Maps</a>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
