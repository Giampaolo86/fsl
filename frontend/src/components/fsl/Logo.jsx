import { Link } from "react-router-dom";

export function Logo({ to = "/", compact = false, className = "" }) {
  return (
    <Link to={to} className={`flex items-center gap-3 group ${className}`} data-testid="fsl-logo" aria-label="Future Stars League">
      <img src="/brand/logo.png" alt="" className={`${compact ? "h-11 w-11" : "h-12 w-12"} shrink-0 object-contain drop-shadow transition-transform duration-200 group-hover:scale-105`} />
      {!compact && (
        <div className="leading-none hidden sm:block">
          <div className="font-display font-extrabold uppercase text-[19px] tracking-tight text-fsl-white">Future Stars League</div>
          <div className="text-[11px] font-medium text-fsl-gold tracking-[0.08em] uppercase mt-1">La Serie A del futuro</div>
        </div>
      )}
    </Link>
  );
}
