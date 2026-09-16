import { Award, Medal, Star } from "lucide-react";

const SCOPE = { match: ["Gara", "border-fsl-blue-light/50 text-fsl-blue-light", Star], season: ["Stagione", "border-fsl-gold/60 text-fsl-gold", Award], career: ["Carriera", "border-fsl-success/60 text-fsl-success", Medal] };

export function BadgeChip({ b, small = false }) {
  const [scope, tone, Icon] = SCOPE[b.scope] || SCOPE.season;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border ${tone} ${small ? "h-5 px-1.5 text-[9px]" : "h-7 px-2.5 text-[11px]"} font-semibold uppercase tracking-wide whitespace-nowrap ${b.manual ? "bg-fsl-gold/10" : "bg-ink-950/40"}`} title={`${b.label} · ${scope}${b.note ? ` · ${b.note}` : ""}`} data-testid={`badge-${b.code}`}>
      <Icon className={small ? "h-2.5 w-2.5" : "h-3 w-3"} />{b.label}
    </span>
  );
}

export function BadgeChips({ list = [], max = 6, small = true }) {
  if (!list.length) return <span className="text-[10px] text-fsl-slate">—</span>;
  const uniq = Object.values(list.reduce((acc, b) => { const k = b.code === "speciale" ? b.label : b.code; acc[k] = acc[k] ? { ...acc[k], n: acc[k].n + 1 } : { ...b, n: 1 }; return acc; }, {}));
  const shown = uniq.slice(0, max);
  return (
    <span className="inline-flex flex-wrap gap-1 items-center">
      {shown.map((b) => <span key={b.code + b.label} className="inline-flex items-center gap-0.5"><BadgeChip b={b} small={small} />{b.n > 1 && <span className="num text-[9px] text-fsl-gold">×{b.n}</span>}</span>)}
      {uniq.length > max && <span className="text-[10px] text-fsl-slate">+{uniq.length - max}</span>}
    </span>
  );
}
