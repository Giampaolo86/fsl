import { Link } from "react-router-dom";
export function KpiTile({ icon: Icon, value, label, hint, gold = false, testId, to }) {
  const Tag = to ? Link : "div";
  return (
    <Tag to={to} className={`${gold ? "fsl-card-gold" : "fsl-card"} flex items-center gap-4 px-5 py-4 animate-rise ${to ? "hover:border-fsl-gold/60 hover:-translate-y-0.5 transition-[transform,border-color] cursor-pointer" : ""}`} aria-label={to ? `${label}: apri la sezione` : undefined} data-testid={testId}>
      {Icon && (
        <div className="h-12 w-12 shrink-0 rounded-full border border-fsl-gold/40 bg-ink-950/60 flex items-center justify-center">
          <Icon className="h-5 w-5 text-fsl-gold" aria-hidden="true" />
        </div>
      )}
      <div className="min-w-0">
        <div className="font-display font-extrabold text-3xl leading-none num text-fsl-white">{value}</div>
        <div className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-fsl-slate">{label}</div>
        {hint && <div className="mt-0.5 text-xs text-fsl-slate/80 truncate">{hint}</div>}
      </div>
    </Tag>
  );
}

export function PageHeader({ kicker, title, subtitle, actions, children }) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-6">
      <div>
        {kicker && <div className="fsl-kicker mb-1">{kicker}</div>}
        <h1 className="text-4xl sm:text-5xl font-extrabold leading-[0.95]">{title}</h1>
        {subtitle && <p className="mt-2 text-sm md:text-base text-fsl-slate max-w-2xl">{subtitle}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionTitle({ children, right }) {
  return (
    <div className="flex items-center justify-between gap-4 mb-3">
      <h2 className="fsl-section-title">{children}</h2>
      {right}
    </div>
  );
}

export function ProgressBar({ value, label }) {
  return (
    <div>
      {label && (
        <div className="flex justify-between text-xs text-fsl-slate mb-1">
          <span>{label}</span>
          <span className="num text-fsl-white font-semibold">{value}%</span>
        </div>
      )}
      <div className="h-2 rounded-full bg-ink-950/70 overflow-hidden" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full rounded-full transition-[width] duration-500 ${value >= 100 ? "bg-fsl-success" : "bg-fsl-blue-light"}`} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
    </div>
  );
}
