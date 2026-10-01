import { useState } from "react";

export function ClubCrest({ club, size = 48, className = "" }) {
  const [broken, setBroken] = useState(false);
  const primary = club?.colors?.primary || "#0B57D9";
  const secondary = club?.colors?.secondary || "#F4AE2B";
  const initials = (club?.short_name || club?.name || "?").slice(0, 3).toUpperCase();
  if (club?.crest_url && !club?.crest_is_placeholder && !broken) {
    return <img src={club.crest_url} alt={`Stemma ${club.name}`} width={size} height={size} onError={() => setBroken(true)} className={`object-contain ${className}`} />;
  }
  return (
    <svg
      viewBox="0 0 64 72"
      width={size}
      height={(size * 72) / 64}
      className={className}
      role="img"
      aria-label={`Stemma segnaposto ${club?.name || ""}`}
      data-testid="club-crest-placeholder"
    >
      <path d="M32 3 L58 12 V36 C58 51 46 63 32 69 C18 63 6 51 6 36 V12 Z" fill={primary} stroke={secondary} strokeWidth="3" />
      <path d="M32 3 L58 12 V36 C58 51 46 63 32 69 Z" fill="rgba(0,0,0,0.18)" />
      <text x="32" y="43" fontFamily="Barlow Condensed, Arial Narrow, sans-serif" fontWeight="800" fontSize="20" fill={secondary} textAnchor="middle" letterSpacing="0.5">
        {initials}
      </text>
    </svg>
  );
}
