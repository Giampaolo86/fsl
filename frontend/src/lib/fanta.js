export const BONUS = { goal: 3, assist: 1, penalty_saved: 3, mvp: 1, yellow_card: -0.5, red_card: -1, own_goal: -2 };
export const STAT_KEYS = ["goal", "assist", "penalty_saved", "mvp", "yellow_card", "red_card", "own_goal"];
export const STAT_META = {
  goal: { short: "G", label: "Gol", tone: "bg-fsl-success text-ink-950" },
  assist: { short: "A", label: "Assist", tone: "bg-fsl-blue-light text-ink-950" },
  penalty_saved: { short: "RP", label: "Rigore parato", tone: "bg-[#5b4bd6] text-fsl-white" },
  mvp: { short: "★", label: "MVP", tone: "bg-fsl-gold text-ink-950", toggle: true },
  yellow_card: { short: "AM", label: "Ammonizione", tone: "bg-fsl-warning text-ink-950" },
  red_card: { short: "ES", label: "Espulsione", tone: "bg-fsl-danger text-fsl-white" },
  own_goal: { short: "AG", label: "Autogol", tone: "bg-navy-700 text-fsl-white" },
};
export const BADGE = { mvp: ["MVP", "bg-fsl-gold text-ink-950"], doppietta: ["Doppietta", "bg-fsl-success text-ink-950"], tripletta: ["Tripletta", "bg-fsl-success text-ink-950"], bomber: ["Bomber", "bg-fsl-success text-ink-950"], assistman: ["Assist", "bg-fsl-blue-light text-ink-950"], muro: ["Muro", "bg-[#5b4bd6]"] };
export const ROLE_TONE = { Por: "bg-fsl-gold text-ink-950", Dif: "bg-fsl-success text-ink-950", Cen: "bg-fsl-blue", Est: "bg-fsl-blue-light text-ink-950", Att: "bg-fsl-danger" };
export const ROLE_CODE = { Portiere: "Por", Difensore: "Dif", Centrocampista: "Cen", Esterno: "Est", Attaccante: "Att" };

export const fmtVote = (v) => (v == null ? "–" : Number(v).toFixed(1).replace(/\.0$/, ""));

export function scoreFromStats(stats, callups) {
  const s = { home: 0, away: 0 };
  ["home", "away"].forEach((side) => {
    const other = side === "home" ? "away" : "home";
    (callups[side] || []).forEach((pid) => {
      const st = stats[pid] || {};
      s[side] += st.goal || 0;
      s[other] += st.own_goal || 0;
    });
  });
  return s;
}

export function bonusFor(st, role, conceded, hasScore) {
  let b = STAT_KEYS.reduce((acc, k) => acc + BONUS[k] * (st[k] || 0), 0);
  if (role === "Portiere" && hasScore) b += conceded === 0 ? 1 : -conceded;
  return Math.round(b * 10) / 10;
}
