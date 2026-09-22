import { BarChart3 } from "lucide-react";
import { ClubCrest } from "./ClubCrest";
import { Link } from "react-router-dom";

const ZONE = {
  playoff: ["Playoff", "bg-fsl-success"],
  direct_promotion: ["Promozione diretta", "bg-fsl-success"],
  promotion_playoff: ["Playoff promozione", "bg-fsl-blue-light"],
  safe: ["Salve", "bg-fsl-slate"],
  playout: ["Playout", "bg-fsl-warning"],
  relegation: ["Retrocessione", "bg-fsl-danger"],
};

export function StandingsTable({ competition, rows, clubBase, testId }) {
  return (
    <div className="fsl-card overflow-hidden" data-testid={testId || `standings-table-${competition.code}`}>
      <div className="h-12 px-4 flex items-center justify-between border-b border-white/10 bg-ink-950/40">
        <span className="font-display font-bold uppercase">{competition.name}</span>
        <span className="text-[10px] uppercase tracking-wider text-fsl-success inline-flex items-center gap-1"><BarChart3 className="h-3 w-3" /> Solo risultati ufficiali</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full table-dark">
          <thead><tr><th className="w-10">Pos</th><th>Squadra</th><th className="text-right">PG</th><th className="text-right hidden md:table-cell">V</th><th className="text-right hidden md:table-cell">N</th><th className="text-right hidden md:table-cell">P</th><th className="text-right hidden lg:table-cell">GF</th><th className="text-right hidden lg:table-cell">GS</th><th className="text-right hidden sm:table-cell">DR</th><th className="text-right">PT</th><th className="hidden sm:table-cell">Forma</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={11} className="text-center text-sm text-fsl-slate py-8">Nessuna squadra iscritta.</td></tr>}
            {rows.map((r) => (
              <tr key={r.team_id} className="h-12" data-testid={`standings-row-${r.pos}`}>
                <td className="num font-display font-bold text-lg relative">
                  {r.zone && <span className={`absolute left-0 top-2 bottom-2 w-1 rounded-r ${ZONE[r.zone]?.[1] || "bg-fsl-slate"}`} aria-hidden="true" />}
                  {r.pos}
                </td>
                <td>
                  <span className="flex items-center gap-2 font-semibold">
                    <ClubCrest club={r.club} size={24} />
                    {clubBase && r.club?.slug ? <Link to={`${clubBase}/${r.club.slug}`} className="hover:text-fsl-gold truncate max-w-[140px] sm:max-w-none inline-block align-middle">{r.club?.name || r.name}</Link> : r.club?.name || r.name}
                  </span>
                </td>
                <td className="num text-right">{r.PG}</td><td className="num text-right hidden md:table-cell">{r.V}</td><td className="num text-right hidden md:table-cell">{r.N}</td><td className="num text-right hidden md:table-cell">{r.P}</td>
                <td className="num text-right hidden lg:table-cell">{r.GF}</td><td className="num text-right hidden lg:table-cell">{r.GS}</td><td className="num text-right hidden sm:table-cell">{r.DR > 0 ? `+${r.DR}` : r.DR}</td>
                <td className="num text-right font-display font-extrabold text-xl text-fsl-gold">{r.PT}</td>
                <td className="hidden sm:table-cell"><span className="flex gap-0.5">{r.form.map((f, i) => <span key={i} className={`h-5 w-5 rounded text-[10px] font-bold inline-flex items-center justify-center ${f === "V" ? "bg-fsl-success text-ink-950" : f === "N" ? "bg-fsl-slate text-ink-950" : "bg-fsl-danger"}`}>{f}</span>)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {Object.keys(competition.zones || {}).length > 0 && (
        <div className="px-4 py-2 flex flex-wrap gap-3 text-[11px] text-fsl-slate border-t border-white/10">
          {Object.entries(competition.zones).map(([k, v]) => <span key={k} className="inline-flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${ZONE[k]?.[1] || "bg-fsl-slate"}`} /> {ZONE[k]?.[0] || k} <span className="num text-fsl-white">{Array.isArray(v) ? v.join("–") : v}</span></span>)}
        </div>
      )}
    </div>
  );
}
