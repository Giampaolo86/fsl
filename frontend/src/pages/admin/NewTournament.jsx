import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Copy, FileText, PencilLine } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/fsl/Primitives";
import { useTournaments } from "@/context/TournamentContext";
import { api, apiError } from "@/lib/api";
import { DAYS, FORMULA } from "@/lib/format";

const MODES = [
  { key: "scratch", title: "Parti da zero", desc: "Configura manualmente tutti i parametri", Icon: PencilLine },
  { key: "template", title: "Usa un modello", desc: "Parti da un modello predefinito", Icon: FileText },
  { key: "duplicate", title: "Duplica esistente", desc: "Crea un nuovo torneo da uno esistente", Icon: Copy },
];

const DEFAULT_SETTINGS = {
  categories: ["2015"],
  series: ["Girone unico"],
  teams_per_series: 10,
  fields_count: 2,
  match_days: ["sat", "sun"],
  day_start: "08:30",
  day_end: "13:30",
  match_duration_min: 30,
  buffer_min: 10,
  formula: "single_round_robin",
  points: { win: 3, draw: 1, loss: 0 },
};

function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="fsl-label">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="text-xs text-fsl-slate/80">{hint}</span>}
    </label>
  );
}

function ListInput({ value, onChange, placeholder, testId }) {
  return (
    <input
      className="fsl-input"
      value={value.join(", ")}
      onChange={(e) => onChange(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
      placeholder={placeholder}
      data-testid={testId}
    />
  );
}

export default function NewTournament() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { tournaments, refresh, setCurrentId } = useTournaments();
  const [mode, setMode] = useState(params.get("mode") || null);
  const [step, setStep] = useState(0);
  const [templates, setTemplates] = useState([]);
  const [templateKey, setTemplateKey] = useState("");
  const [sourceId, setSourceId] = useState(params.get("source") || "");
  const [copyClubs, setCopyClubs] = useState(true);
  const [form, setForm] = useState({ name: "", payoff: "", description: "", season_label: "", start_date: "", end_date: "" });
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/tournaments/templates").then(({ data }) => setTemplates(data));
  }, []);

  useEffect(() => {
    if (mode === "template" && templateKey) {
      const t = templates.find((x) => x.key === templateKey);
      if (t) setSettings({ ...DEFAULT_SETTINGS, ...t.settings });
    }
    if (mode === "duplicate" && sourceId) {
      const src = tournaments.find((x) => x.id === sourceId);
      if (src) {
        api.get(`/tournaments/${src.id}`).then(({ data }) => {
          const s = data.settings;
          setSettings({ ...DEFAULT_SETTINGS, ...s });
          setForm((f) => ({ ...f, name: f.name || `${src.name} (copia)`, payoff: src.payoff, description: src.description }));
        });
      }
    }
  }, [mode, templateKey, sourceId, templates, tournaments]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setS = (k, v) => setSettings((s) => ({ ...s, [k]: v }));

  const summary = useMemo(() => {
    const n = Number(settings.teams_per_series) || 0;
    const comps = (settings.categories?.length || 0) * (settings.series?.length || 0);
    const mpc = settings.formula === "double_round_robin" ? n * (n - 1) : n > 1 ? (n * (n - 1)) / 2 : 0;
    return { comps, teams: comps * n, matches: comps * mpc, rounds: n % 2 === 0 ? n - 1 : n };
  }, [settings]);

  const canNext = step === 0 ? !!mode && (mode !== "template" || templateKey) && (mode !== "duplicate" || sourceId) : step === 1 ? form.name.trim().length > 1 : true;

  const submit = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/tournaments", {
        mode,
        ...form,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        template_key: mode === "template" ? templateKey : null,
        source_id: mode === "duplicate" ? sourceId : null,
        copy_clubs: copyClubs,
        settings: { ...settings, teams_per_series: Number(settings.teams_per_series), fields_count: Number(settings.fields_count), match_duration_min: Number(settings.match_duration_min), buffer_min: Number(settings.buffer_min) },
      });
      await refresh();
      setCurrentId(data.id);
      toast.success(`Torneo "${data.name}" creato in bozza`);
      navigate(`/admin/t/${data.id}`);
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const STEPS = ["Modalità", "Identità", "Struttura", "Calendario e formula", "Riepilogo"];

  return (
    <div className="max-w-4xl">
      <PageHeader kicker="Hub tornei" title="Nuovo torneo" subtitle="Scegli come iniziare a creare il tuo nuovo torneo. Il torneo nasce in stato Bozza e può essere attivato in seguito." />
      <ol className="flex flex-wrap gap-2 mb-6" aria-label="Passi">
        {STEPS.map((s, i) => (
          <li key={s} className={`h-9 px-3 rounded-full text-xs font-semibold inline-flex items-center gap-2 border ${i === step ? "bg-fsl-blue border-fsl-blue-light" : i < step ? "border-fsl-success/50 text-fsl-success" : "border-white/15 text-fsl-slate"}`} aria-current={i === step ? "step" : undefined}>
            {i < step ? <Check className="h-3.5 w-3.5" /> : <span className="num">{i + 1}</span>} {s}
          </li>
        ))}
      </ol>

      <div className="fsl-card p-6 animate-rise" key={step}>
        {step === 0 && (
          <div className="space-y-6">
            <div className="grid md:grid-cols-3 gap-3">
              {MODES.map(({ key, title, desc, Icon }) => (
                <button
                  key={key}
                  onClick={() => setMode(key)}
                  data-testid={`new-tournament-mode-${key}`}
                  className={`text-left rounded-lg border p-4 transition-colors ${mode === key ? "border-fsl-gold bg-fsl-gold/10" : "border-white/15 hover:border-white/40"}`}
                  aria-pressed={mode === key}
                >
                  <div className="h-11 w-11 rounded-full border border-fsl-gold/40 bg-ink-950/60 inline-flex items-center justify-center mb-3">
                    <Icon className="h-5 w-5 text-fsl-gold" aria-hidden="true" />
                  </div>
                  <div className="font-semibold">{title}</div>
                  <div className="text-xs text-fsl-slate mt-1">{desc}</div>
                </button>
              ))}
            </div>
            {mode === "template" && (
              <div className="space-y-2" data-testid="new-tournament-template-list">
                <span className="fsl-label">Modello</span>
                {templates.map((t) => (
                  <label key={t.key} className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer ${templateKey === t.key ? "border-fsl-blue-light bg-fsl-blue/10" : "border-white/15"}`}>
                    <input type="radio" name="template" className="mt-1" checked={templateKey === t.key} onChange={() => setTemplateKey(t.key)} data-testid={`new-tournament-template-${t.key}`} />
                    <span>
                      <span className="font-semibold text-sm">{t.label}</span>
                      <span className="block text-xs text-fsl-slate">{t.description}</span>
                      <span className="block text-xs text-fsl-slate num mt-1">
                        {t.settings.categories.length} categorie · {t.settings.series.length} serie · {t.settings.teams_per_series} squadre/serie · {t.settings.fields_count} campi
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}
            {mode === "duplicate" && (
              <div className="space-y-3">
                <Field label="Torneo di origine">
                  <select className="fsl-input" value={sourceId} onChange={(e) => setSourceId(e.target.value)} data-testid="new-tournament-source-select">
                    <option value="">Seleziona…</option>
                    {tournaments.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} · {t.status}
                      </option>
                    ))}
                  </select>
                </Field>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={copyClubs} onChange={(e) => setCopyClubs(e.target.checked)} data-testid="new-tournament-copy-clubs" /> Copia anche le società (senza squadre, rose e risultati)
                </label>
              </div>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="grid md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Field label="Nome torneo *">
                <input className="fsl-input" value={form.name} onChange={set("name")} placeholder="Es. La Serie A dei Bambini" data-testid="new-tournament-name-input" />
              </Field>
            </div>
            <Field label="Payoff">
              <input className="fsl-input" value={form.payoff} onChange={set("payoff")} placeholder="Il grande calcio per i piccoli campioni" data-testid="new-tournament-payoff-input" />
            </Field>
            <Field label="Etichetta stagione">
              <input className="fsl-input" value={form.season_label} onChange={set("season_label")} placeholder="Stagione 2026/27" data-testid="new-tournament-season-input" />
            </Field>
            <Field label="Data inizio">
              <input type="date" className="fsl-input" value={form.start_date} onChange={set("start_date")} data-testid="new-tournament-start-input" />
            </Field>
            <Field label="Data fine">
              <input type="date" className="fsl-input" value={form.end_date} onChange={set("end_date")} data-testid="new-tournament-end-input" />
            </Field>
            <div className="md:col-span-2">
              <Field label="Descrizione">
                <textarea className="fsl-input h-24 py-2" value={form.description} onChange={set("description")} data-testid="new-tournament-description-input" />
              </Field>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Categorie (anni di nascita)" hint="Separa con virgola. Es. 2014, 2015, 2016, 2017">
              <ListInput value={settings.categories} onChange={(v) => setS("categories", v)} placeholder="2014, 2015" testId="new-tournament-categories-input" />
            </Field>
            <Field label="Serie / gironi per categoria" hint="Es. Serie A, Serie B oppure Girone unico">
              <ListInput value={settings.series} onChange={(v) => setS("series", v)} placeholder="Serie A, Serie B" testId="new-tournament-series-input" />
            </Field>
            <Field label="Squadre per serie">
              <input type="number" min="2" className="fsl-input" value={settings.teams_per_series} onChange={(e) => setS("teams_per_series", e.target.value)} data-testid="new-tournament-teams-input" />
            </Field>
            <Field label="Numero campi">
              <input type="number" min="1" className="fsl-input" value={settings.fields_count} onChange={(e) => setS("fields_count", e.target.value)} data-testid="new-tournament-fields-input" />
            </Field>
          </div>
        )}

        {step === 3 && (
          <div className="grid md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <span className="fsl-label">Giorni di gara</span>
              <div className="mt-1 flex flex-wrap gap-2">
                {Object.entries(DAYS).map(([k, l]) => {
                  const on = settings.match_days.includes(k);
                  return (
                    <button key={k} type="button" aria-pressed={on} onClick={() => setS("match_days", on ? settings.match_days.filter((d) => d !== k) : [...settings.match_days, k])} className={`h-11 px-4 rounded-md border text-sm font-semibold ${on ? "bg-fsl-blue border-fsl-blue-light" : "border-white/20 text-fsl-slate"}`} data-testid={`new-tournament-day-${k}`}>
                      {l}
                    </button>
                  );
                })}
              </div>
            </div>
            <Field label="Inizio giornata">
              <input type="time" className="fsl-input" value={settings.day_start} onChange={(e) => setS("day_start", e.target.value)} data-testid="new-tournament-daystart-input" />
            </Field>
            <Field label="Fine giornata">
              <input type="time" className="fsl-input" value={settings.day_end} onChange={(e) => setS("day_end", e.target.value)} data-testid="new-tournament-dayend-input" />
            </Field>
            <Field label="Durata gara (min)">
              <input type="number" min="10" className="fsl-input" value={settings.match_duration_min} onChange={(e) => setS("match_duration_min", e.target.value)} data-testid="new-tournament-duration-input" />
            </Field>
            <Field label="Cambio campo / prepartita (min)">
              <input type="number" min="0" className="fsl-input" value={settings.buffer_min} onChange={(e) => setS("buffer_min", e.target.value)} data-testid="new-tournament-buffer-input" />
            </Field>
            <Field label="Formula">
              <select className="fsl-input" value={settings.formula} onChange={(e) => setS("formula", e.target.value)} data-testid="new-tournament-formula-select">
                {Object.entries(FORMULA).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Punteggi (V / N / P)">
              <div className="grid grid-cols-3 gap-2">
                {["win", "draw", "loss"].map((k) => (
                  <input key={k} type="number" className="fsl-input" value={settings.points[k]} onChange={(e) => setS("points", { ...settings.points, [k]: Number(e.target.value) })} aria-label={k} data-testid={`new-tournament-points-${k}`} />
                ))}
              </div>
            </Field>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4" data-testid="new-tournament-summary">
            <div>
              <div className="fsl-kicker">Riepilogo</div>
              <h3 className="text-3xl font-extrabold">{form.name}</h3>
              <p className="text-sm text-fsl-slate">{form.payoff}</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                [summary.comps, "Campionati"],
                [summary.teams, "Squadre previste"],
                [summary.matches, "Gare regular season"],
                [summary.rounds, "Giornate"],
              ].map(([v, l]) => (
                <div key={l} className="rounded-md bg-ink-950/50 border border-white/10 p-3">
                  <div className="font-display font-extrabold text-3xl num">{v}</div>
                  <div className="text-[11px] uppercase tracking-wider text-fsl-slate">{l}</div>
                </div>
              ))}
            </div>
            <ul className="text-sm text-fsl-slate space-y-1">
              <li>Modalità: <span className="text-fsl-white">{MODES.find((m) => m.key === mode)?.title}</span></li>
              <li>Categorie: <span className="text-fsl-white">{settings.categories.join(", ")}</span> · Serie: <span className="text-fsl-white">{settings.series.join(", ")}</span></li>
              <li>Campi: <span className="text-fsl-white num">{settings.fields_count}</span> · Giorni: <span className="text-fsl-white">{settings.match_days.map((d) => DAYS[d]).join(", ")}</span> {settings.day_start}–{settings.day_end}</li>
              <li>Gara {settings.match_duration_min}' + {settings.buffer_min}' cambio campo · {FORMULA[settings.formula]}</li>
            </ul>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button className="btn-ghost" onClick={() => (step === 0 ? navigate("/admin") : setStep((s) => s - 1))} data-testid="new-tournament-back-button">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {step === 0 ? "Annulla" : "Indietro"}
        </button>
        {step < 4 ? (
          <button className="btn-primary" disabled={!canNext} onClick={() => setStep((s) => s + 1)} data-testid="new-tournament-next-button">
            Avanti <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : (
          <button className="btn-gold" disabled={busy} onClick={submit} data-testid="new-tournament-submit-button">
            <Check className="h-4 w-4" aria-hidden="true" /> {busy ? "Creazione…" : "Crea torneo in bozza"}
          </button>
        )}
      </div>
      <p className="mt-3 text-xs text-fsl-slate">
        Hai già un torneo? <Link to="/admin" className="text-fsl-gold hover:underline">Torna all'hub</Link>
      </p>
    </div>
  );
}
