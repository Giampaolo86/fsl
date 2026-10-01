import { useMemo, useState } from "react";
import { AlertTriangle, Sparkles } from "lucide-react";

export const suggestGroups = (total) => Math.max(1, Math.round((Number(total) || 0) / 4));

export function planGroups(s) {
  const total = Number(s.teams_total) || 0;
  const groups = Math.max(1, Number(s.groups_count) || 1);
  const perGroup = Number(s.qualifiers_per_group) || 0;
  const double = false;
  const base = Math.floor(total / groups), extra = total % groups;
  const sizes = Array.from({ length: groups }, (_, i) => base + (i < extra ? 1 : 0));
  const groupMatches = sizes.reduce((a, n) => a + (n > 1 ? (n * (n - 1)) / (double ? 1 : 2) : 0), 0);
  const rounds = Math.max(...sizes.map((n) => (n > 1 ? (n % 2 === 0 ? n - 1 : n) : 0)), 0);
  const qualifiers = perGroup * groups;
  const finalsMatches = qualifiers >= 2 ? qualifiers - 1 + (s.third_place ? 1 : 0) : 0;
  const pow2 = qualifiers >= 2 && (qualifiers & (qualifiers - 1)) === 0;
  let error = null;
  if (total < 3) error = "Servono almeno 3 squadre";
  else if (Math.min(...sizes) < 2) error = "Troppi gironi per queste squadre: ogni girone deve avere almeno 2 squadre";
  else if (!pow2) error = `Fase finale a ${qualifiers} squadre non supportata: le qualificate totali devono essere 2, 4, 8 o 16`;
  else if (perGroup > Math.min(...sizes)) error = "Qualificate per girone superiori alle squadre del girone più piccolo";
  const stage = { 2: "finale", 4: "semifinali + finale", 8: "quarti + semifinali + finale", 16: "ottavi + quarti + semifinali + finale" }[qualifiers] || "fase finale";
  const sizesTxt = extra ? sizes.map((n) => n).join("+") : `${groups} giron${groups === 1 ? "e" : "i"} da ${base}`;
  const text = `${total} squadre · ${sizesTxt} · ${rounds} gare a squadra nei gironi · ${perGroup} qualificat${perGroup === 1 ? "a" : "e"} per girone → ${stage}${s.third_place ? " + finale 3°/4° posto" : ""}`;
  return { total, groups, sizes, groupMatches, rounds, qualifiers, finalsMatches, error, text, stage };
}

export function GroupsPlanner({ settings, setS, testPrefix = "groups" }) {
  const [touched, setTouched] = useState(false);
  const plan = useMemo(() => planGroups(settings), [settings]);
  const onTotal = (v) => {
    setS("teams_total", v);
    if (!touched) setS("groups_count", suggestGroups(v));
  };
  const suggested = suggestGroups(settings.teams_total);
  return (
    <div className="rounded-xl border border-fsl-gold/30 bg-ink-950/40 p-4 space-y-4" data-testid={`${testPrefix}-groups-planner`}>
      <div className="grid sm:grid-cols-3 gap-4">
        <label className="block"><span className="fsl-label">Squadre totali per categoria</span><input type="number" min="3" className="fsl-input mt-1" value={settings.teams_total} onChange={(e) => onTotal(e.target.value)} data-testid={`${testPrefix}-teams-total-input`} /></label>
        <label className="block">
          <span className="fsl-label">Gironi</span>
          <input type="number" min="1" className="fsl-input mt-1" value={settings.groups_count} onChange={(e) => { setTouched(true); setS("groups_count", e.target.value); }} data-testid={`${testPrefix}-groups-input`} />
          {Number(settings.groups_count) !== suggested && <button type="button" className="mt-1 text-xs text-fsl-gold hover:underline inline-flex items-center gap-1" onClick={() => { setTouched(false); setS("groups_count", suggested); }} data-testid={`${testPrefix}-groups-suggest`}><Sparkles className="h-3 w-3" /> Consiglio FSL: {suggested}</button>}
        </label>
        <label className="block">
          <span className="fsl-label">Qualificate per girone</span>
          <select className="fsl-input mt-1" value={settings.qualifiers_per_group} onChange={(e) => setS("qualifiers_per_group", Number(e.target.value))} data-testid={`${testPrefix}-qualifiers-select`}>
            {[1, 2, 4].map((n) => <option key={n} value={n}>{n === 1 ? "Solo la prima" : `Prime ${n}`}</option>)}
          </select>
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!settings.third_place} onChange={(e) => setS("third_place", e.target.checked)} data-testid={`${testPrefix}-third-place`} /> Finale 3°/4° posto</label>
      <div className={`rounded-lg px-3 py-2 text-sm ${plan.error ? "bg-fsl-danger/10 border border-fsl-danger/40 text-fsl-danger" : "bg-fsl-success/10 border border-fsl-success/30 text-fsl-white"}`} data-testid={`${testPrefix}-groups-plan`}>
        {plan.error ? <span className="inline-flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> {plan.error}</span> : <>
          <div className="font-semibold">{plan.text}</div>
          <div className="text-xs text-fsl-slate mt-1 num">{plan.groupMatches} gare nei gironi + {plan.finalsMatches} di fase finale = {plan.groupMatches + plan.finalsMatches} gare per categoria · gironi {plan.sizes.map((n, i) => `${String.fromCharCode(65 + i)}: ${n}`).join(" · ")}</div>
        </>}
      </div>
    </div>
  );
}
