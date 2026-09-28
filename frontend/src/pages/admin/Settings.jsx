import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionTitle } from "@/components/fsl/Primitives";
import { ErrorState, LoadingState } from "@/components/fsl/States";
import { useTournamentDetail } from "@/hooks/useTournamentData";
import { useTournaments } from "@/context/TournamentContext";
import { api, apiError } from "@/lib/api";
import { DAYS, FORMULA, TIEBREAK_LABELS, fmtNum } from "@/lib/format";

function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="fsl-label">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="text-xs text-fsl-slate/80">{hint}</span>}
    </label>
  );
}

export default function Settings() {
  const { data, error, loading, reload } = useTournamentDetail();
  const { refresh } = useTournaments();
  const [form, setForm] = useState(null);
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) {
      setForm({ name: data.name, payoff: data.payoff, description: data.description, season_label: data.season_label, start_date: data.start_date || "", end_date: data.end_date || "", primary: data.visual.primary, secondary: data.visual.secondary });
      setS(data.settings);
    }
  }, [data]);

  if (loading || !form) return <LoadingState label="Caricamento impostazioni…" />;
  if (error) return <ErrorState message={apiError(error)} onRetry={reload} />;

  const canWrite = ["super_admin", "director"].includes(data.my_role) && !data.read_only;
  const setF = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const upd = (k, v) => setS((x) => ({ ...x, [k]: v }));
  const list = (v) => v.split(",").map((x) => x.trim()).filter(Boolean);

  const save = async () => {
    setBusy(true);
    try {
      const { data: res } = await api.patch(`/tournaments/${data.id}`, {
        name: form.name,
        payoff: form.payoff,
        description: form.description,
        season_label: form.season_label,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        visual: { primary: form.primary, secondary: form.secondary },
        settings: {
          categories: s.categories,
          series: s.series,
          teams_per_series: Number(s.teams_per_series),
          fields_count: Number(s.fields_count),
          match_days: s.match_days,
          day_start: s.day_start,
          day_end: s.day_end,
          break_start: s.break_start || null,
          break_end: s.break_end || null,
          match_duration_min: Number(s.match_duration_min),
          buffer_min: Number(s.buffer_min),
          formula: s.formula,
          points: s.points,
          tiebreakers: s.tiebreakers,
          promoted_per_category: Number(s.promoted_per_category),
          relegated_per_category: Number(s.relegated_per_category),
          max_matches_per_team_per_weekend: Number(s.max_matches_per_team_per_weekend),
          skip_holidays: s.skip_holidays,
          fees: s.fees,
          required_documents: s.required_documents,
          notification_channels: s.notification_channels,
          sponsors: s.sponsors || [],
        },
      });
      toast.success("Impostazioni salvate");
      setS(res.settings);
      await Promise.all([reload(), refresh()]);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const summary = data.summary;

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Configurazione torneo"
        title="Impostazioni"
        subtitle="Ogni torneo ha configurazione indipendente: categorie, serie, squadre, campi, orari, formula, punteggi, quote e documenti."
        actions={
          canWrite && (
            <button className="btn-primary" onClick={save} disabled={busy} data-testid="settings-save-button">
              <Save className="h-4 w-4" aria-hidden="true" /> {busy ? "Salvataggio…" : "Salva impostazioni"}
            </button>
          )
        }
      />
      {!canWrite && <p className="text-sm text-fsl-warning" data-testid="settings-readonly-note">Sola lettura: il tuo ruolo non può modificare la configurazione o il torneo è archiviato.</p>}

      <fieldset disabled={!canWrite} className="space-y-8">
        <section className="fsl-card p-6">
          <SectionTitle>Identità</SectionTitle>
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Nome"><input className="fsl-input" value={form.name} onChange={setF("name")} data-testid="settings-name-input" /></Field>
            <Field label="Payoff"><input className="fsl-input" value={form.payoff} onChange={setF("payoff")} data-testid="settings-payoff-input" /></Field>
            <Field label="Etichetta stagione"><input className="fsl-input" value={form.season_label} onChange={setF("season_label")} data-testid="settings-season-input" /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Inizio"><input type="date" className="fsl-input" value={form.start_date} onChange={setF("start_date")} data-testid="settings-start-input" /></Field>
              <Field label="Fine"><input type="date" className="fsl-input" value={form.end_date} onChange={setF("end_date")} data-testid="settings-end-input" /></Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Colore primario"><input type="color" className="fsl-input p-1" value={form.primary} onChange={setF("primary")} data-testid="settings-primary-color" /></Field>
              <Field label="Colore secondario"><input type="color" className="fsl-input p-1" value={form.secondary} onChange={setF("secondary")} data-testid="settings-secondary-color" /></Field>
            </div>
            <Field label="Descrizione"><textarea className="fsl-input h-20 py-2" value={form.description} onChange={setF("description")} data-testid="settings-description-input" /></Field>
          </div>
        </section>

        <section className="fsl-card p-6">
          <SectionTitle>Struttura competizioni</SectionTitle>
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Categorie" hint="Anni di nascita separati da virgola"><input className="fsl-input" value={s.categories.join(", ")} onChange={(e) => upd("categories", list(e.target.value))} data-testid="settings-categories-input" /></Field>
            <Field label="Serie / gironi"><input className="fsl-input" value={s.series.join(", ")} onChange={(e) => upd("series", list(e.target.value))} data-testid="settings-series-input" /></Field>
            <Field label="Squadre per serie"><input type="number" min="2" className="fsl-input" value={s.teams_per_series} onChange={(e) => upd("teams_per_series", e.target.value)} data-testid="settings-teams-input" /></Field>
            <Field label="Formula">
              <select className="fsl-input" value={s.formula} onChange={(e) => upd("formula", e.target.value)} data-testid="settings-formula-select">
                {Object.entries(FORMULA).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Field>
            <Field label="Promosse per categoria"><input type="number" min="0" className="fsl-input" value={s.promoted_per_category} onChange={(e) => upd("promoted_per_category", e.target.value)} data-testid="settings-promoted-input" /></Field>
            <Field label="Retrocesse per categoria"><input type="number" min="0" className="fsl-input" value={s.relegated_per_category} onChange={(e) => upd("relegated_per_category", e.target.value)} data-testid="settings-relegated-input" /></Field>
          </div>
        </section>

        <section className="fsl-card p-6">
          <SectionTitle>Campi, giorni e slot</SectionTitle>
          <div className="mb-4 flex flex-wrap gap-2" data-testid="settings-time-presets">
            <span className="fsl-label self-center mr-1">Preset orari:</span>
            {[["Mattina", "08:30", "13:30", null, null], ["Pomeriggio", "14:30", "19:30", null, null], ["Giornata intera", "08:30", "19:30", "13:30", "14:30"], ["Fino a sera", "08:30", "21:30", "13:30", "14:30"]].map(([l, a, b, bs, be]) => (
              <button key={l} type="button" className="btn-ghost h-9 text-xs" onClick={() => setS((x) => ({ ...x, day_start: a, day_end: b, break_start: bs, break_end: be }))} data-testid={`settings-preset-${l.toLowerCase().replace(/ /g, "-")}`}>{l} {a}–{b}</button>
            ))}
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Numero campi" hint="Il generatore userà esattamente questo numero di campi"><input type="number" min="1" className="fsl-input" value={s.fields_count} onChange={(e) => upd("fields_count", e.target.value)} data-testid="settings-fields-input" /></Field>
            <div>
              <span className="fsl-label">Giorni di gara</span>
              <div className="mt-1 flex flex-wrap gap-2">
                {Object.entries(DAYS).map(([k, l]) => {
                  const on = s.match_days.includes(k);
                  return (
                    <button key={k} type="button" aria-pressed={on} onClick={() => upd("match_days", on ? s.match_days.filter((d) => d !== k) : [...s.match_days, k])} className={`h-11 px-4 rounded-md border text-sm font-semibold ${on ? "bg-fsl-blue border-fsl-blue-light" : "border-white/20 text-fsl-slate"}`} data-testid={`settings-day-${k}`}>{l}</button>
                  );
                })}
              </div>
            </div>
            <Field label="Inizio giornata"><input type="time" className="fsl-input" value={s.day_start} onChange={(e) => upd("day_start", e.target.value)} data-testid="settings-daystart-input" /></Field>
            <Field label="Fine giornata" hint="Fino a 23:00: gli slot si estendono automaticamente"><input type="time" min="06:00" max="23:00" className="fsl-input" value={s.day_end} onChange={(e) => upd("day_end", e.target.value)} data-testid="settings-dayend-input" /></Field>
            <Field label="Pausa dalle (opzionale)" hint="Es. pausa pranzo: nessuna gara nella finestra"><input type="time" className="fsl-input" value={s.break_start || ""} onChange={(e) => upd("break_start", e.target.value || null)} data-testid="settings-breakstart-input" /></Field>
            <Field label="Pausa fino alle"><input type="time" className="fsl-input" value={s.break_end || ""} onChange={(e) => upd("break_end", e.target.value || null)} data-testid="settings-breakend-input" /></Field>
            <Field label="Durata gara (min)"><input type="number" min="10" className="fsl-input" value={s.match_duration_min} onChange={(e) => upd("match_duration_min", e.target.value)} data-testid="settings-duration-input" /></Field>
            <Field label="Cambio campo (min)"><input type="number" min="0" className="fsl-input" value={s.buffer_min} onChange={(e) => upd("buffer_min", e.target.value)} data-testid="settings-buffer-input" /></Field>
            <Field label="Max gare per squadra a weekend"><input type="number" min="1" className="fsl-input" value={s.max_matches_per_team_per_weekend} onChange={(e) => upd("max_matches_per_team_per_weekend", e.target.value)} data-testid="settings-maxweekend-input" /></Field>
            <label className="flex items-center gap-2 text-sm mt-6"><input type="checkbox" checked={s.skip_holidays} onChange={(e) => upd("skip_holidays", e.target.checked)} data-testid="settings-skip-holidays" /> Salta automaticamente i festivi</label>
          </div>
          <div className="mt-4 rounded-md bg-ink-950/50 border border-white/10 p-4">
            <div className="fsl-label mb-2">Slot calcolati (salvati)</div>
            <div className="flex flex-wrap gap-2" data-testid="settings-slots">
              {s.slots.map((sl) => <span key={sl} className="num h-8 px-3 rounded-full border border-fsl-gold/40 text-sm inline-flex items-center">{sl}</span>)}
            </div>
            <p className="mt-2 text-xs text-fsl-slate num">
              {s.slots.length} slot × {s.fields_count} campi = {summary.matches_per_day} gare/giorno · {summary.matches_per_weekend} per weekend · {fmtNum(summary.matches_total)} gare totali in {summary.weekends_needed ?? "—"} weekend
            </p>
          </div>
        </section>

        <section className="fsl-card p-6">
          <SectionTitle>Punteggi e criteri di classifica</SectionTitle>
          <div className="grid md:grid-cols-3 gap-4">
            {["win", "draw", "loss"].map((k) => (
              <Field key={k} label={{ win: "Vittoria", draw: "Pareggio", loss: "Sconfitta" }[k]}>
                <input type="number" className="fsl-input" value={s.points[k]} onChange={(e) => upd("points", { ...s.points, [k]: Number(e.target.value) })} data-testid={`settings-points-${k}`} />
              </Field>
            ))}
          </div>
          <div className="mt-4">
            <span className="fsl-label">Ordine tie-break (memorizzato per competizione)</span>
            <ol className="mt-2 grid md:grid-cols-2 gap-2">
              {s.tiebreakers.map((tb, i) => (
                <li key={tb} className="h-11 px-3 rounded-md border border-white/15 flex items-center gap-3 text-sm">
                  <span className="num h-6 w-6 rounded-full bg-fsl-blue inline-flex items-center justify-center text-xs font-bold">{i + 1}</span>
                  <span className="flex-1">{TIEBREAK_LABELS[tb] || tb}</span>
                  <button type="button" className="text-xs text-fsl-slate hover:text-fsl-white disabled:opacity-30" disabled={i === 0} onClick={() => { const a = [...s.tiebreakers]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; upd("tiebreakers", a); }} aria-label={`Sposta su ${TIEBREAK_LABELS[tb]}`} data-testid={`settings-tiebreak-up-${tb}`}>▲</button>
                  <button type="button" className="text-xs text-fsl-slate hover:text-fsl-white disabled:opacity-30" disabled={i === s.tiebreakers.length - 1} onClick={() => { const a = [...s.tiebreakers]; [a[i + 1], a[i]] = [a[i], a[i + 1]]; upd("tiebreakers", a); }} aria-label={`Sposta giù ${TIEBREAK_LABELS[tb]}`} data-testid={`settings-tiebreak-down-${tb}`}>▼</button>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="fsl-card p-6">
          <SectionTitle>Quote, documenti e canali</SectionTitle>
          <div className="grid md:grid-cols-4 gap-4">
            <Field label="Quota iscrizione (€)"><input type="number" min="0" className="fsl-input" value={s.fees.registration} onChange={(e) => upd("fees", { ...s.fees, registration: Number(e.target.value) })} data-testid="settings-fee-input" /></Field>
            <Field label="Quota atleta (€)" hint="Per ogni atleta presente in gara: addebito e incasso dal tabellino"><input type="number" min="0" step="0.5" className="fsl-input" value={s.fees.callup_fee ?? 0} onChange={(e) => upd("fees", { ...s.fees, callup_fee: Number(e.target.value) })} data-testid="settings-callup-fee-input" /></Field>
            <Field label="Documenti richiesti" hint="Separati da virgola"><input className="fsl-input" value={s.required_documents.join(", ")} onChange={(e) => upd("required_documents", list(e.target.value))} data-testid="settings-documents-input" /></Field>
            <Field label="Canali notifica" hint="email, sms, whatsapp"><input className="fsl-input" value={s.notification_channels.join(", ")} onChange={(e) => upd("notification_channels", list(e.target.value))} data-testid="settings-channels-input" /></Field>
          </div>
          <div className="mt-5" data-testid="settings-card-prices">
            <div className="fsl-kicker mb-2">Card Player ID <span className="text-fsl-slate font-sans normal-case font-normal">· prezzi delle card digitali in stile FIFA acquistabili dalla scheda giocatore</span></div>
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Card Premium (€)" hint="Default 3,99 €"><input type="number" min="0" step="0.01" className="fsl-input" value={s.fees.card_price ?? 3.99} onChange={(e) => upd("fees", { ...s.fees, card_price: Number(e.target.value) })} data-testid="settings-card-price-input" /></Field>
              <Field label="Card Speciale Top 11 / MVP (€)" hint="Default 4,99 €"><input type="number" min="0" step="0.01" className="fsl-input" value={s.fees.card_special_price ?? 4.99} onChange={(e) => upd("fees", { ...s.fees, card_special_price: Number(e.target.value) })} data-testid="settings-card-special-price-input" /></Field>
              <Field label="Notifiche push genitori (€/stagione)" hint="Pass stagionale per ricevere sul telefono Top 11, risultati, foto e badge. Default 3,99 €"><input type="number" min="0" step="0.01" className="fsl-input" value={s.fees.push_price ?? 3.99} onChange={(e) => upd("fees", { ...s.fees, push_price: Number(e.target.value) })} data-testid="settings-push-price-input" /></Field>

            </div>
          </div>
          {s.categories.length > 0 && <div className="mt-5" data-testid="settings-fee-by-category">
            <div className="fsl-kicker mb-2">Quota atleta per categoria <span className="text-fsl-slate font-sans normal-case font-normal">· lascia vuoto per usare la quota generale ({Number(s.fees.callup_fee ?? 0).toFixed(2).replace(".", ",")} €)</span></div>
            <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3">
              {s.categories.map((cat) => { const v = s.fees.callup_fee_by_category?.[cat]; return (
                <label key={cat} className="flex items-center gap-2 h-11 px-3 rounded-md bg-navy-700/50 border border-white/10"><span className="text-sm font-semibold flex-1 truncate">{cat}</span>
                  <input type="number" min="0" step="0.5" placeholder={Number(s.fees.callup_fee ?? 0).toFixed(2)} className="fsl-input h-8 w-24 text-right num" value={v ?? ""} onChange={(e) => { const by = { ...(s.fees.callup_fee_by_category || {}) }; if (e.target.value === "") delete by[cat]; else by[cat] = Number(e.target.value); upd("fees", { ...s.fees, callup_fee_by_category: by }); }} data-testid={`settings-callup-fee-${cat}`} /><span className="text-xs text-fsl-slate">€</span></label>
              ); })}
            </div>
          </div>}
        </section>

        <section className="fsl-card p-6" data-testid="settings-sponsors">
          <SectionTitle right={<button type="button" className="btn-ghost h-9" onClick={() => upd("sponsors", [...(s.sponsors || []), { name: "", logo_url: "", payoff: "" }])} data-testid="settings-sponsor-add">+ Aggiungi sponsor</button>}>Sponsor e partner</SectionTitle>
          <p className="text-xs text-fsl-slate mb-3">Compaiono come «Presented by» nelle grafiche del Social Studio, nella Top 11 e nell'FSL Weekly. Logo: URL immagine (PNG/SVG su fondo trasparente).</p>
          {(s.sponsors || []).length === 0 && <p className="text-sm text-fsl-slate">Nessuno sponsor configurato.</p>}
          <div className="space-y-2">
            {(s.sponsors || []).map((sp, i) => (
              <div key={i} className="grid md:grid-cols-[1fr_1.4fr_1fr_auto] gap-2 items-center" data-testid={`settings-sponsor-${i}`}>
                <input className="fsl-input" placeholder="Nome sponsor" value={sp.name} onChange={(e) => upd("sponsors", s.sponsors.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} data-testid={`settings-sponsor-name-${i}`} />
                <input className="fsl-input" placeholder="URL logo (https://…)" value={sp.logo_url || ""} onChange={(e) => upd("sponsors", s.sponsors.map((x, j) => (j === i ? { ...x, logo_url: e.target.value } : x)))} data-testid={`settings-sponsor-logo-${i}`} />
                <input className="fsl-input" placeholder="Payoff (facoltativo)" value={sp.payoff || ""} onChange={(e) => upd("sponsors", s.sponsors.map((x, j) => (j === i ? { ...x, payoff: e.target.value } : x)))} />
                <button type="button" className="btn-ghost h-9 text-fsl-danger" onClick={() => upd("sponsors", s.sponsors.filter((_, j) => j !== i))} data-testid={`settings-sponsor-remove-${i}`}>Rimuovi</button>
              </div>
            ))}
          </div>
        </section>
      </fieldset>
    </div>
  );
}
