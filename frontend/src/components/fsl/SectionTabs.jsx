import { NavLink } from "react-router-dom";

export function SectionTabs({ tabs, testId = "section-tabs", className = "" }) {
  return (
    <div role="tablist" className={`mb-6 inline-flex gap-1 rounded-xl border border-white/10 bg-ink-950/60 p-1 ${className}`} data-testid={testId}>
      {tabs.map(({ to, label, end = true }) => <NavLink key={to} to={to} end={end} role="tab" className={({ isActive }) => `h-10 px-4 rounded-lg inline-flex items-center font-display font-bold uppercase text-sm tracking-wide transition-colors ${isActive ? "bg-fsl-gold text-ink-950" : "text-fsl-white/75 hover:text-fsl-white hover:bg-white/5"}`} data-testid={`${testId}-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>{label}</NavLink>)}
    </div>
  );
}

export function TabbedSection({ tabs, testId, children }) {
  return <div><SectionTabs tabs={tabs} testId={testId} />{children}</div>;
}
