import { Archive, CheckCircle2, CircleDashed, PlayCircle } from "lucide-react";
import { STATUS } from "@/lib/format";

const ICONS = { draft: CircleDashed, active: PlayCircle, completed: CheckCircle2, archived: Archive };

export function StatusBadge({ status, className = "", testId }) {
  const s = STATUS[status] || STATUS.draft;
  const Icon = ICONS[status] || CircleDashed;
  return (
    <span
      data-testid={testId || `status-badge-${status}`}
      className={`inline-flex items-center gap-1.5 rounded-full border ${s.ring} bg-ink-950/60 px-2.5 h-7 text-[11px] font-semibold uppercase tracking-wider ${s.color} ${className}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {s.label}
    </span>
  );
}
