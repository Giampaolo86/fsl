import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { BarChart3, CalendarDays, Construction, MapPin, Shield, Users } from "lucide-react";
import { ClubCrest } from "@/components/fsl/ClubCrest";
import { PageHeader, SectionTitle } from "@/components/fsl/Primitives";
import { EmptyState, ErrorState, LoadingState } from "@/components/fsl/States";
import { usePublicTournament } from "@/hooks/usePublicTournament";
import { api, apiError } from "@/lib/api";
import { FORMULA, DAYS, TIEBREAK_LABELS } from "@/lib/format";

function Wrap({ children }) {
  return <div className="mx-auto max-w-[1488px] px-6 py-10 gold-skin">{children}</div>;
}

export function PublicClubs() {
  const { slug, data, error, reload } = usePublicTournament();
  if (error) return <Wrap><ErrorState message={apiError(error)} onRetry={reload} /></Wrap>;
  if (!data) return <LoadingState full />;
  return (
    <Wrap>
      <PageHeader kicker={data.tournament.name} title="Squadre" subtitle={`${data.clubs.length} società partecipanti. Gli stemmi segnaposto saranno sostituiti dai materiali ufficiali caricati dalle società.`} />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3" data-testid="public-clubs-grid">
        {data.clubs.map((c) => (
          <Link key={c.id} to={`/tornei/${slug}/squadre/${c.slug}`} className="fsl-card p-4 flex flex-col items-center text-center gap-2 hover:border-fsl-gold/50 transition-colors" data-testid={`public-club-card-${c.slug}`}>
            <ClubCrest club={c} size={64} />
            <span className="font-semibold text-sm leading-tight">{c.name}</span>
            <span className="text-xs text-fsl-slate">{c.city}</span>
          </Link>
        ))}
      </div>
    </Wrap>
  );
}

export function PublicClubPage() {
  const { slug, clubSlug } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    api.get(`/public/tournaments/${slug}/clubs/${clubSlug}`).then((r) => setData(r.data)).catch(setError);
  }, [slug, clubSlug]);
  if (error) return <Wrap><ErrorState message={apiError(error)} /></Wrap>;
  if (!data) return <LoadingState full />;
  const { club, teams, venue } = data;
  return (
    <div>
      <section className="relative overflow-hidden grain min-h-[380px] flex items-end" style={{ background: `linear-gradient(110deg, ${club.colors.primary} 0%, #041E32 65%)` }}>
        {club.cover_url && <img src={club.cover_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-50" />}
        <div className="absolute inset-0 bg-gradient-to-t from-navy-900 via-navy-900/40 to-transparent" />
        <div className="relative mx-auto max-w-[1488px] w-full px-6 pb-10 pt-24 flex flex-col md:flex-row md:items-end gap-6">
          <ClubCrest club={club} size={120} />
          <div>
            <h1 className="text-5xl sm:text-6xl font-extrabold leading-[0.9]" data-testid="public-club-name">{club.name}</h1>
            <p className="text-fsl-gold font-display uppercase tracking-wide mt-1">{club.motto}</p>
            <div className="mt-4 flex flex-wrap gap-6 text-sm">
              {club.founded_year && <span><span className="font-display font-extrabold text-2xl num">{club.founded_year}</span> <span className="text-xs uppercase text-fsl-slate ml-1">Anno di fondazione</span></span>}
              <span><span className="font-display font-extrabold text-2xl num">{teams.length}</span> <span className="text-xs uppercase text-fsl-slate ml-1">Squadre</span></span>
              {club.city && <span className="inline-flex items-center gap-1 text-fsl-slate"><MapPin className="h-4 w-4 text-fsl-gold" /> {club.city}</span>}
            </div>
          </div>
        </div>
      </section>
      <Wrap>
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="fsl-card p-5">
            <SectionTitle>Sede della società</SectionTitle>
            {venue ? <p className="text-sm">{venue.name}<br /><span className="text-fsl-slate">{venue.address}, {venue.city}</span>{venue.maps_url && <><br /><a href={venue.maps_url} target="_blank" rel="noreferrer" className="text-fsl-gold hover:underline text-xs" data-testid="public-venue-maps">Apri in Google Maps ↗</a></>}</p> : <p className="text-sm text-fsl-slate">Sede non ancora pubblicata dalla società.</p>}
          </div>
          <div className="fsl-card p-5">
            <SectionTitle>Contatti</SectionTitle>
            {club.contacts.length === 0 ? <p className="text-sm text-fsl-slate">Nessun contatto pubblico.</p> : club.contacts.map((c, i) => <p key={i} className="text-sm">{c.name} <span className="text-fsl-slate">· {c.role}</span><br /><span className="text-fsl-slate">{c.email}</span></p>)}
          </div>
          <div className="fsl-card p-5">
            <SectionTitle>Le nostre squadre</SectionTitle>
            {teams.length === 0 ? <p className="text-sm text-fsl-slate">Nessuna squadra iscritta.</p> : (
              <div className="flex flex-wrap gap-2">{teams.map((t) => <span key={t.id} className="h-9 px-3 rounded-md border border-white/15 inline-flex items-center gap-2 text-sm"><span className="num font-display font-bold">{t.category}</span> <span className="text-fsl-slate text-xs">{t.series}</span></span>)}</div>
            )}
          </div>
        </div>
        <div className="mt-4"><EmptyState icon={CalendarDays} title="Prossime partite interne" description="Compariranno dopo la pubblicazione del calendario." /></div>
      </Wrap>
    </div>
  );
}

export function PublicStandings() {
  const { data, error, reload } = usePublicTournament();
  const [cat, setCat] = useState("");
  if (error) return <Wrap><ErrorState message={apiError(error)} onRetry={reload} /></Wrap>;
  if (!data) return <LoadingState full />;
  const category = cat || data.settings.categories[0];
  const comps = data.competitions.filter((c) => c.category === category);
  return (
    <Wrap>
      <PageHeader kicker={data.tournament.name} title="Classifiche" subtitle="Solo risultati ufficiali o rettificati alimentano la classifica pubblica." actions={<select className="fsl-input w-40" value={category} onChange={(e) => setCat(e.target.value)} aria-label="Categoria" data-testid="standings-category-select">{data.settings.categories.map((c) => <option key={c}>{c}</option>)}</select>} />
      <div className="grid lg:grid-cols-2 gap-4">
        {comps.map((c) => (
          <div key={c.id} className="fsl-card overflow-hidden" data-testid={`standings-table-${c.code}`}>
            <div className="h-12 px-4 flex items-center justify-between border-b border-white/10 bg-ink-950/40"><span className="font-display font-bold uppercase">{c.name}</span><span className="text-xs text-fsl-slate num">{c.teams_registered}/{c.teams_count} squadre</span></div>
            <table className="w-full table-dark">
              <thead><tr><th>Pos</th><th>Squadra</th><th className="text-right">PG</th><th className="text-right">V</th><th className="text-right">N</th><th className="text-right">P</th><th className="text-right">GF</th><th className="text-right">GS</th><th className="text-right">DR</th><th className="text-right">PT</th></tr></thead>
              <tbody><tr><td colSpan={10} className="text-center text-sm text-fsl-slate py-8"><BarChart3 className="mx-auto h-6 w-6 text-fsl-gold mb-2" /> Nessun risultato ufficiale: la classifica verrà calcolata alla prima ufficializzazione.</td></tr></tbody>
            </table>
            {Object.keys(c.zones || {}).length > 0 && (
              <div className="px-4 py-3 flex flex-wrap gap-3 text-xs text-fsl-slate border-t border-white/10">
                {Object.entries(c.zones).map(([k, v]) => <span key={k}><span className={`inline-block h-2 w-2 rounded-full mr-1 ${k.includes("playoff") || k.includes("promotion") ? "bg-fsl-success" : k === "playout" ? "bg-fsl-warning" : "bg-fsl-slate"}`} /> {k.replace(/_/g, " ")} <span className="num text-fsl-white">{Array.isArray(v) ? v.join("–") : v}</span></span>)}
              </div>
            )}
          </div>
        ))}
      </div>
    </Wrap>
  );
}

export function PublicRules() {
  const { data, error, reload } = usePublicTournament();
  if (error) return <Wrap><ErrorState message={apiError(error)} onRetry={reload} /></Wrap>;
  if (!data) return <LoadingState full />;
  const s = data.settings;
  return (
    <Wrap>
      <PageHeader kicker={data.tournament.name} title="Regolamento" subtitle={data.tournament.description} />
      <Link to="/codice-fsl" className="group relative block rounded-2xl overflow-hidden border border-fsl-gold/40 mb-6 min-h-[160px]" data-testid="rules-codice-banner">
        <img src="/img/codice/hero.jpg" alt="" className="absolute inset-0 h-full w-full object-cover group-hover:scale-[1.02] transition-transform duration-500" loading="lazy" />
        <div className="absolute inset-0" style={{ background: "linear-gradient(90deg,rgba(3,19,31,0.96) 0%,rgba(3,19,31,0.75) 60%,rgba(3,19,31,0.3) 100%)" }} />
        <div className="relative p-6 sm:p-8 flex flex-wrap items-end justify-between gap-4">
          <div><div className="text-[11px] font-semibold tracking-[0.28em] uppercase text-fsl-gold">Vale per ogni torneo FSL</div><div className="font-display font-extrabold uppercase text-3xl sm:text-4xl leading-none mt-2">Codice <span className="text-fsl-gold">FSL</span></div><div className="mt-2 text-sm sm:text-base text-fsl-white/85">Competere. Crescere. Rispettare. — i sei principi, i principi di gioco e il Patto FSL.</div></div>
          <span className="btn-gold h-11 px-5">Leggi il Codice</span>
        </div>
      </Link>
      {s.rules_text?.trim() && (
        <div className="fsl-card p-5 mb-4 text-sm" data-testid="rules-special">
          <SectionTitle>Regole speciali di questo torneo</SectionTitle>
          <div className="space-y-3 text-fsl-white/85 leading-relaxed">
            {s.rules_text.trim().split(/\n\s*\n/).map((block, i) => {
              const lines = block.split("\n").filter(Boolean);
              const title = lines[0]?.trim().endsWith(":") ? lines.shift().replace(/:$/, "") : null;
              return <div key={i}>{title && <h4 className="font-display font-extrabold uppercase text-lg text-fsl-gold leading-none mb-1">{title}</h4>}{lines.map((l, k) => <p key={k}>{l}</p>)}</div>;
            })}
          </div>
        </div>
      )}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="fsl-card p-5 space-y-2 text-sm" data-testid="rules-formula">
          <SectionTitle>Formula</SectionTitle>
          <p>{FORMULA[s.formula]} · <span className="num">{s.teams_per_series}</span> squadre per serie · <span className="num">{data.summary.rounds}</span> giornate.</p>
          <p>Categorie: <span className="text-fsl-white">{s.categories.join(", ")}</span>. Serie: <span className="text-fsl-white">{s.series.join(", ")}</span>.</p>
          <p className="num">Gare di {s.match_duration_min} minuti, cambio campo {s.buffer_min} minuti, {s.fields_count} campi, {s.match_days.map((d) => DAYS[d]).join("/")} — slot {s.slots.join(", ")}.</p>
          {s.promoted_per_category > 0 && <p className="num">Ogni stagione {s.promoted_per_category} promosse e {s.relegated_per_category} retrocesse per categoria.</p>}
        </div>
        <div className="fsl-card p-5 space-y-2 text-sm" data-testid="rules-points">
          <SectionTitle>Punteggi e classifica</SectionTitle>
          <p className="num">Vittoria {s.points.win} · Pareggio {s.points.draw} · Sconfitta {s.points.loss}</p>
          <ol className="list-decimal pl-5 text-fsl-slate">{s.tiebreakers.map((t) => <li key={t}>{TIEBREAK_LABELS[t] || t}</li>)}</ol>
          {Object.entries(s.playoff_rules || {}).map(([serie, z]) => (
            <p key={serie}><span className="font-semibold">{serie}:</span> {Object.entries(z).map(([k, v]) => `${k.replace(/_/g, " ")} ${Array.isArray(v) ? v.join("–") : v}`).join(" · ")}</p>
          ))}
        </div>
      </div>
    </Wrap>
  );
}

export function PublicModule({ title, phase }) {
  return <Wrap><PageHeader kicker={phase} title={title} /><EmptyState icon={Construction} title={`Sezione disponibile in ${phase}`} description="I dati saranno pubblicati automaticamente dal motore del torneo." testId={`public-module-${title.toLowerCase()}`} /></Wrap>;
}

export { Users, Shield };
