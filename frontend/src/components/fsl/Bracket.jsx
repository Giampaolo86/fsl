import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Crown, Trophy } from "lucide-react";
import { ClubCrest } from "@/components/fsl/ClubCrest";
import { kickoffLabel } from "@/components/fsl/MatchCard";
import { api } from "@/lib/api";

function Side({ side, m, slug, winner }) {
  const played = m.score?.home !== null && m.score?.home !== undefined;
  const g = m.score?.[side], pen = m.score?.[`${side}_pen`];
  const t = m[side];
  const isW = winner && t?.id === winner;
  const lost = played && winner && !isW;
  return (
    <div className={`flex items-center gap-2 h-11 px-3 ${isW ? "bg-fsl-gold/15" : ""} ${lost ? "opacity-55" : ""}`} data-testid={`bracket-side-${m.id}-${side}`}>
      <ClubCrest club={t?.club} size={24} />
      <span className={`flex-1 min-w-0 truncate text-sm ${isW ? "font-extrabold text-fsl-gold" : "font-semibold"}`}>{t?.club?.name || t?.name || "Da definire"}</span>
      {isW && <Crown className="h-3.5 w-3.5 text-fsl-gold shrink-0" />}
      <span className={`num w-7 text-right font-display font-extrabold text-lg ${isW ? "text-fsl-gold" : ""}`}>{played ? g : "–"}{played && pen != null ? <span className="text-[10px] text-fsl-slate align-top"> ({pen})</span> : null}</span>
    </div>
  );
}

function Tie({ m, slug, label }) {
  const w = m.winner_team_id;
  return (
    <Link to={`/tornei/${slug}/partite/${m.id}`} className="block rounded-xl border border-white/10 bg-navy-800/90 overflow-hidden hover:border-fsl-gold/60 transition-colors shadow-[0_8px_24px_rgba(0,0,0,0.35)]" data-testid={`bracket-match-${m.id}`}>
      <div className="flex items-center justify-between px-3 h-7 text-[10px] uppercase tracking-wider text-fsl-slate bg-ink-950/50"><span className="truncate">{label || m.round_name}</span><span className="num shrink-0">{m.status === "in_progress" ? <span className="text-fsl-danger font-bold">LIVE</span> : kickoffLabel(m.kickoff_at)}</span></div>
      <Side side="home" m={m} slug={slug} winner={w} />
      <div className="h-px bg-white/[0.06] mx-3" />
      <Side side="away" m={m} slug={slug} winner={w} />
    </Link>
  );
}

function Placeholder({ label }) {
  return <div className="rounded-xl border border-dashed border-white/15 h-[118px] flex items-center justify-center text-xs text-fsl-slate" data-testid="bracket-placeholder">{label}</div>;
}

const NAMES = { 1: "Finale", 2: "Semifinali", 4: "Quarti di finale", 8: "Ottavi di finale" };

export function Bracket({ data: b, slug }) {
  const total = b.total_rounds;
  const cols = Array.from({ length: total }, (_, i) => 2 ** (total - 1 - i));
  const byRound = Object.fromEntries(b.rounds.map((r) => [r.bracket_round, r.matches]));
  const champ = b.champion;
  return (
    <section className="relative rounded-2xl border border-fsl-gold/25 bg-ink-950/60 p-4 sm:p-6 overflow-hidden" data-testid={`bracket-${b.competition.code}`}>
      <div className="absolute -top-12 -right-12 h-48 w-48 rounded-full bg-fsl-gold/10 blur-3xl pointer-events-none" aria-hidden />
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <div className="fsl-kicker">Tabellone</div>
          <h3 className="font-display font-extrabold uppercase text-2xl sm:text-3xl leading-none">{b.competition.name}</h3>
          {b.sources?.length > 0 && <p className="text-xs text-fsl-slate mt-1">Incroci tra {b.sources.map((s) => s.series).join(" e ")}: 1ª contro 2ª dell'altro girone</p>}
        </div>
        {champ ? (
          <div className="flex items-center gap-3 rounded-xl px-4 py-2" style={{ background: "linear-gradient(160deg,#FFE9A8 0%,#F4AE2B 45%,#B8741A 75%,#FFD97A 100%)", boxShadow: "0 10px 30px rgba(244,174,43,0.35)" }} data-testid="bracket-champion">
            <Trophy className="h-6 w-6 text-ink-950" />
            <div className="text-ink-950 leading-tight"><div className="text-[10px] uppercase tracking-[0.2em] font-bold">Vincitrice</div><div className="font-display font-extrabold uppercase text-lg">{champ.club?.name || champ.name}</div></div>
            <ClubCrest club={champ.club} size={40} />
          </div>
        ) : <span className="h-9 px-3 rounded-full border border-fsl-gold/40 text-fsl-gold text-xs inline-flex items-center gap-2"><Trophy className="h-4 w-4" /> Vincitrice da decidere</span>}
      </div>
      <div className="overflow-x-auto -mx-2 px-2 pb-2">
        <div className="grid gap-4 min-w-[640px]" style={{ gridTemplateColumns: `repeat(${total}, minmax(220px, 1fr))` }}>
          {cols.map((r) => {
            const ms = byRound[r] || [];
            const slots = Array.from({ length: r }, (_, i) => ms.find((m) => (m.bracket_slot ?? i) === i) || ms[i] || null);
            return (
              <div key={r} className="flex flex-col" data-testid={`bracket-round-${r}`}>
                <div className="text-[11px] uppercase tracking-[0.2em] text-fsl-gold font-bold mb-3 text-center">{NAMES[r] || `Turno ${r}`}</div>
                <div className="flex-1 flex flex-col justify-around gap-4">
                  {slots.map((m, i) => (m ? <Tie key={m.id} m={m} slug={slug} label={r === 1 ? "Finale" : `${NAMES[r] || "Turno"} ${r > 1 ? i + 1 : ""}`} /> : <Placeholder key={i} label={r === 1 ? "Finale da programmare" : "Da definire"} />))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {b.third_place && <div className="mt-4 max-w-sm" data-testid="bracket-third-place"><Tie m={b.third_place} slug={slug} label="Finale 3°/4° posto" /></div>}
    </section>
  );
}

export function BracketList({ data, slug, testId = "public-brackets" }) {
  if (!data || data.length === 0) return null;
  return <div className="space-y-6" data-testid={testId}>{data.map((b) => <Bracket key={b.competition.id} data={b} slug={slug} />)}</div>;
}

export function BracketSection({ slug, category, title = "Fase finale", className = "" }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let on = true;
    const load = () => api.get(`/public/tournaments/${slug}/bracket`, { params: category ? { category } : {} }).then((r) => on && setData(r.data)).catch(() => on && setData((d) => d || []));
    load();
    const id = setInterval(() => document.visibilityState === "visible" && load(), 60000);
    return () => { on = false; clearInterval(id); };
  }, [slug, category]);
  if (!data || data.length === 0) return null;
  return (
    <section className={className} data-testid="bracket-section">
      <div className="flex items-end justify-between gap-3 mb-4"><h2 className="font-display font-extrabold uppercase text-2xl sm:text-3xl leading-none inline-flex items-center gap-2"><Trophy className="h-6 w-6 text-fsl-gold" /> {title}</h2><span className="text-xs text-fsl-slate">Clicca una gara per il Match Center</span></div>
      <BracketList data={data} slug={slug} />
    </section>
  );
}
