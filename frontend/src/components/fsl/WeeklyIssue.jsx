import { Link } from "react-router-dom";
import { Camera, CalendarDays, Crown, Newspaper, Target, Trophy } from "lucide-react";
import { Kicker } from "@/components/fsl/HomeHub";
import { FifaCard, fmt1 } from "@/components/fsl/FifaCard";
import { Top11Board } from "@/components/fsl/Top11Board";
import { fmtDate } from "@/lib/format";
import { mediaUrl } from "@/lib/upload";

const Crest = ({ side, size = "h-8 w-8" }) => (side.crest_url ? <img src={mediaUrl(side.crest_url)} alt="" className={`${size} object-contain`} /> : <span className={`${size} rounded-full inline-flex items-center justify-center font-display font-extrabold text-xs`} style={{ background: side.colors?.primary || "#0B57D9" }}>{(side.short_name || side.name || "?").slice(0, 3).toUpperCase()}</span>);
const when = (iso) => { try { const d = new Date(iso); return `${d.toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "2-digit" })} · ${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`; } catch { return iso; } };

export function SectionHead({ icon: Icon, children, right }) {
  return <div className="flex items-end justify-between gap-3 mb-4"><h2 className="font-display font-extrabold uppercase text-2xl sm:text-3xl leading-none flex items-center gap-2"><Icon className="h-6 w-6 text-fsl-gold" /> {children}</h2>{right}</div>;
}

export function WeeklyIssue({ issue, slug, matchTo }) {
  const c = issue.content || {}, ed = issue.editorial || {};
  const linkMatch = (mid) => (matchTo ? matchTo(mid) : slug ? `/tornei/${slug}/partite/${mid}` : "#");
  return (
    <article className="space-y-12" data-testid="weekly-issue">
      <header className="relative overflow-hidden rounded-3xl border border-white/10 bg-navy-800 p-6 sm:p-10">
        <div className="absolute inset-0 grain opacity-40 pointer-events-none" />
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-fsl-gold/15 blur-3xl" />
        <div className="relative grid lg:grid-cols-[1fr_auto] gap-6 items-end">
          <div>
            <Kicker>FSL Weekly · {issue.competition?.name} · Giornata {issue.match_day}</Kicker>
            <h1 className="mt-3 text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[0.9] uppercase" data-testid="weekly-title">{ed.title}</h1>
            <p className="mt-4 text-base md:text-lg text-fsl-white/85 max-w-3xl" data-testid="weekly-intro">{ed.intro}</p>
            {issue.published_at && <div className="mt-3 text-xs text-fsl-slate num">Pubblicato il {fmtDate(issue.published_at)}{ed.sponsor ? <span className="text-fsl-gold font-bold ml-3">Presented by {ed.sponsor}</span> : null}</div>}
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            {[["Gare", c.results?.length || 0], ["Gol", c.goals || 0], ["Squadre", c.standings?.length || 0]].map(([l, v]) => <div key={l} className="rounded-2xl bg-ink-950/60 border border-white/10 px-4 py-3"><div className="font-display font-extrabold text-3xl num text-fsl-gold leading-none">{v}</div><div className="text-[10px] uppercase tracking-wider text-fsl-slate mt-1">{l}</div></div>)}
          </div>
        </div>
      </header>

      {c.mvp && (
        <section className="grid md:grid-cols-[auto_1fr] gap-6 items-center rounded-3xl border border-fsl-gold/30 bg-gradient-to-br from-navy-800 to-ink-950 p-6 sm:p-8" data-testid="weekly-mvp">
          <FifaCard player={{ ...c.mvp, mvp: true }} variant="special" size="lg" />
          <div><Kicker>MVP della giornata</Kicker><h2 className="mt-2 text-3xl sm:text-5xl font-extrabold uppercase leading-[0.9]">{c.mvp.name}</h2><p className="mt-2 text-fsl-slate">{c.mvp.team} · {c.mvp.role}</p><div className="mt-4 flex flex-wrap gap-2 text-sm">{[["Fantavoto", fmt1(c.mvp.fanta)], ["Voto", fmt1(c.mvp.vote)], ["Gol", c.mvp.goals], ["Assist", c.mvp.assists]].map(([l, v]) => <span key={l} className="h-9 px-3 rounded-full bg-white/5 border border-white/10 inline-flex items-center gap-2"><span className="text-fsl-slate text-xs uppercase">{l}</span><b className="num text-fsl-gold">{v}</b></span>)}</div></div>
        </section>
      )}

      <section data-testid="weekly-results">
        <SectionHead icon={Trophy}>Risultati</SectionHead>
        <div className="grid md:grid-cols-2 gap-3">
          {(c.results || []).map((r) => (
            <Link key={r.match_id} to={linkMatch(r.match_id)} className="fsl-card p-4 flex items-center gap-3 hover:border-fsl-gold/50 transition-colors" data-testid={`weekly-result-${r.match_id}`}>
              <div className="flex-1 min-w-0 flex items-center gap-2"><Crest side={r.home} /><span className="font-display font-bold uppercase truncate">{r.home.name}</span></div>
              <div className="font-display font-extrabold text-2xl num px-3 rounded-lg bg-ink-950 border border-white/10">{r.score?.home}–{r.score?.away}</div>
              <div className="flex-1 min-w-0 flex items-center gap-2 justify-end text-right"><span className="font-display font-bold uppercase truncate">{r.away.name}</span><Crest side={r.away} /></div>
              {r.mvp && <span className="hidden sm:inline-flex h-6 px-2 rounded-full bg-fsl-gold text-ink-950 text-[10px] font-bold items-center whitespace-nowrap" title="MVP">MVP {r.mvp.name.split(" ")[0]}</span>}
            </Link>
          ))}
        </div>
      </section>

      {c.top11 && <section data-testid="weekly-top11"><SectionHead icon={Crown}>Top 11 della giornata</SectionHead><Top11Board doc={c.top11} competition={issue.competition} compact /></section>}

      <section className="grid lg:grid-cols-[1.3fr_1fr] gap-8">
        <div data-testid="weekly-standings">
          <SectionHead icon={Target}>Classifica</SectionHead>
          <div className="fsl-card overflow-hidden"><table className="w-full table-dark"><thead><tr><th className="w-8">#</th><th>Squadra</th><th className="text-right">PG</th><th className="text-right hidden sm:table-cell">V</th><th className="text-right hidden sm:table-cell">N</th><th className="text-right hidden sm:table-cell">P</th><th className="text-right">DR</th><th className="text-right">PT</th></tr></thead><tbody>{(c.standings || []).map((r) => <tr key={r.team_id} className={r.pos <= 3 ? "bg-fsl-gold/[0.04]" : ""}><td className="num text-fsl-slate">{r.pos}</td><td className="font-semibold">{r.name}</td><td className="num text-right">{r.PG}</td><td className="num text-right hidden sm:table-cell">{r.V}</td><td className="num text-right hidden sm:table-cell">{r.N}</td><td className="num text-right hidden sm:table-cell">{r.P}</td><td className="num text-right">{r.DR > 0 ? `+${r.DR}` : r.DR}</td><td className="num text-right font-extrabold text-fsl-gold">{r.PT}</td></tr>)}</tbody></table></div>
        </div>
        <div className="space-y-8">
          <div data-testid="weekly-scorers">
            <SectionHead icon={Target}>Marcatori della giornata</SectionHead>
            <div className="fsl-card divide-y divide-white/[0.06]">{(c.scorers || []).length === 0 ? <p className="p-4 text-sm text-fsl-slate">Nessun gol registrato.</p> : c.scorers.map((s, i) => <div key={i} className="h-12 px-4 flex items-center gap-3 text-sm"><span className="num text-fsl-slate w-5">{i + 1}</span><span className="flex-1 truncate font-semibold">{s.name} <span className="text-fsl-slate font-normal">· {s.team}</span></span><span className="num font-display font-extrabold text-xl text-fsl-gold">{s.goals}</span></div>)}</div>
          </div>
          {ed.note && <div className="rounded-2xl bg-ink-950 border border-white/10 border-l-4 border-l-fsl-gold p-5" data-testid="weekly-note"><Kicker className="mb-2">Nota del Direttore</Kicker><p className="text-sm whitespace-pre-line">{ed.note}</p></div>}
        </div>
      </section>

      {(c.next_round || []).length > 0 && (
        <section data-testid="weekly-next">
          <SectionHead icon={CalendarDays}>Anteprima · Giornata {issue.match_day + 1}</SectionHead>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{c.next_round.map((m) => <Link key={m.match_id} to={linkMatch(m.match_id)} className="fsl-card p-4 hover:border-fsl-gold/50 transition-colors"><div className="text-[10px] uppercase tracking-wider text-fsl-slate num">{when(m.kickoff_at)}{m.field_name ? ` · ${m.field_name}` : ""}</div><div className="mt-2 flex items-center gap-2 font-display font-bold uppercase"><Crest side={m.home} size="h-6 w-6" /><span className="truncate flex-1">{m.home.name}</span><span className="text-fsl-slate text-xs">vs</span><span className="truncate flex-1 text-right">{m.away.name}</span><Crest side={m.away} size="h-6 w-6" /></div></Link>)}</div>
        </section>
      )}

      {(c.shop || []).length > 0 && slug && (
        <section data-testid="weekly-shop">
          <SectionHead icon={Camera}>Foto e video della giornata</SectionHead>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{c.shop.map((it) => <Link key={it.id} to={`/tornei/${slug}/partite/${it.match_id}`} className="group relative overflow-hidden rounded-xl border border-white/10 aspect-[4/5] bg-navy-800">{it.preview_url ? <img src={mediaUrl(it.preview_url)} alt="" className="absolute inset-0 h-full w-full object-cover blur-[2px] group-hover:blur-0 transition-[filter]" /> : <Camera className="absolute inset-0 m-auto h-8 w-8 text-fsl-slate" />}<div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-ink-950 to-transparent"><div className="text-xs font-semibold truncate">{it.title}</div><div className="text-[10px] text-fsl-gold num">{Number(it.price).toFixed(2).replace(".", ",")} €</div></div></Link>)}</div>
        </section>
      )}
      <footer className="flex items-center gap-2 text-xs text-fsl-slate"><Newspaper className="h-4 w-4 text-fsl-gold" /> FSL Weekly è generato automaticamente dai tabellini ufficiali e approvato dal Direttore. I nomi dei bambini compaiono per intero solo con il consenso delle famiglie.</footer>
    </article>
  );
}
