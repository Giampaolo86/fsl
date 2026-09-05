const MONTHS = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

export function fmtDate(iso, opts = {}) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const day = String(d.getDate()).padStart(2, "0");
  const base = `${day} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  if (opts.time) return `${base} · ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return base;
}

export function fmtPeriod(start, end) {
  if (!start && !end) return "Date da definire";
  const s = start ? new Date(start) : null;
  const e = end ? new Date(end) : null;
  const m = (d) => MONTHS[d.getMonth()].toUpperCase();
  if (s && e) return `${m(s)} ${s.getFullYear()} – ${m(e)} ${e.getFullYear()}`;
  return s ? `${m(s)} ${s.getFullYear()}` : `${m(e)} ${e.getFullYear()}`;
}

export function fmtNum(n) {
  return new Intl.NumberFormat("it-IT").format(n ?? 0);
}

export const STATUS = {
  draft: { label: "Bozza", color: "text-fsl-slate", dot: "bg-fsl-slate", ring: "border-white/20" },
  active: { label: "Attivo", color: "text-fsl-success", dot: "bg-fsl-success", ring: "border-fsl-success/40" },
  completed: { label: "Terminato", color: "text-fsl-blue-light", dot: "bg-fsl-blue-light", ring: "border-fsl-blue-light/40" },
  archived: { label: "Archiviato", color: "text-fsl-slate", dot: "bg-fsl-slate", ring: "border-white/20" },
};

export const FORMULA = {
  single_round_robin: "Girone unico · sola andata",
  double_round_robin: "Girone · andata e ritorno",
  groups_knockout: "Gironi + fase finale",
  weekend_event: "Evento weekend",
};

export const DAYS = { mon: "Lun", tue: "Mar", wed: "Mer", thu: "Gio", fri: "Ven", sat: "Sab", sun: "Dom" };

export const ROLE_LABELS = {
  super_admin: "Super Admin",
  director: "Direttore Torneo",
  secretary: "Segreteria",
  referee: "Arbitro",
  club_manager: "Responsabile Società",
};

export const TIEBREAK_LABELS = {
  points: "Punti",
  head_to_head: "Scontro diretto",
  goal_difference: "Differenza reti",
  goals_for: "Gol fatti",
  fair_play: "Fair play",
  draw_lot: "Sorteggio amministrativo",
};
