import { Link } from "react-router-dom";

export function Logo({ to = "/", compact = false, className = "" }) {
  return (
    <Link to={to} className={`flex items-center gap-3 group ${className}`} data-testid="fsl-logo" aria-label="Future Stars League">
      <svg viewBox="0 0 96 96" className="h-11 w-11 shrink-0 transition-transform duration-200 group-hover:scale-105" aria-hidden="true">
        <path d="M48 6 L82 19 V50 C82 69 66 84 48 91 C30 84 14 69 14 50 V19 Z" fill="#072B47" stroke="#F4AE2B" strokeWidth="4" />
        <path d="M48 22 L53 34 L66 35 L56 44 L59 57 L48 50.5 L37 57 L40 44 L30 35 L43 34 Z" fill="#F4AE2B" />
        <text x="48" y="76" fontFamily="Barlow Condensed, Arial Narrow, sans-serif" fontWeight="800" fontSize="17" fill="#F5F7FA" textAnchor="middle" letterSpacing="1">FSL</text>
      </svg>
      {!compact && (
        <div className="leading-none">
          <div className="font-display font-extrabold uppercase text-[19px] tracking-tight text-fsl-white">Future Stars League</div>
          <div className="text-[11px] font-medium text-fsl-gold tracking-[0.08em] uppercase mt-1">La Serie A del futuro</div>
        </div>
      )}
    </Link>
  );
}
