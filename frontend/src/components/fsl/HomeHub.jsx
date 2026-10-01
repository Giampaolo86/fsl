import { Link } from "react-router-dom";
import { ArrowRight, BarChart3, CalendarDays, Grid3X3, Heart, Play, PlayCircle, Settings, Flag, Shield, Shirt, Trophy, UserRound, Users } from "lucide-react";
import { fmtPeriod } from "@/lib/format";

const IMG = (n) => `/brand/home/${n}.jpg`;
const CAT_IMGS = ["cat-1", "cat-2", "cat-3", "cat-4"];
export const Kicker = ({ children, className = "" }) => <div className={`font-sans text-[11px] sm:text-xs font-semibold tracking-[0.28em] uppercase text-fsl-gold ${className}`}>{children}</div>;
export const seriesLabel = (series = []) => (series.every((x) => /^serie\s/i.test(x)) ? series.join(" e ") : series.every((x) => x.length <= 2) ? series.map((x) => `Serie ${x}`).join(" e ") : series.join(" · "));

export function HubHero({ main }) {
  return (
    <section className="relative overflow-hidden grain bg-ink-950" data-testid="hub-hero">
      <img src={IMG("hero")} alt="" className="absolute inset-y-0 right-0 lg:right-[14%] h-full w-full lg:w-[56%] object-cover object-[60%_center] opacity-60 lg:opacity-100" /><div className="hidden lg:block absolute inset-y-0 right-0 w-[26%] bg-gradient-to-r from-transparent via-ink-950/70 to-ink-950" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,#03131F_0%,#03131F_30%,rgba(3,19,31,0.75)_48%,rgba(3,19,31,0.1)_70%,rgba(3,19,31,0.35)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-navy-900 to-transparent" />
      <div className="relative mx-auto max-w-[1488px] px-6 pt-20 pb-24 lg:pt-28 lg:pb-32 grid lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] gap-10">
        <div className="animate-rise">
          <Kicker className="mb-6">Future Stars League</Kicker>
          <h1 className="text-5xl sm:text-6xl lg:text-[84px] font-extrabold leading-[0.9] tracking-tight"><span className="text-fsl-white">La casa del</span><br /><span className="text-fsl-gold">calcio giovanile</span></h1>
          <p className="mt-7 text-fsl-white/85 max-w-lg text-base sm:text-lg leading-relaxed">Tornei giovanili con risultati ufficiali, classifiche in tempo reale, visibilità per i talenti, contenuti multimediali e una vera community di club, ragazzi e famiglie.</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link to="/login?area=genitori" className="btn-gold h-12 px-7 uppercase tracking-wide font-display text-base shadow-[0_10px_30px_-10px_rgba(244,174,43,0.8)]" data-testid="hero-login"><UserRound className="h-4 w-4" /> Genitori e tifosi</Link>
            <a href="#missione" className="btn-ghost h-12 px-6 uppercase tracking-wide font-display text-base border-fsl-gold/50 hover:border-fsl-gold" data-testid="hero-discover">Scopri FSL <ArrowRight className="h-4 w-4" /></a>
            <Link to="/tornei" className="btn-ghost h-12 px-6 uppercase tracking-wide font-display text-base border-fsl-gold/50 hover:border-fsl-gold" data-testid="hero-tournaments"><Trophy className="h-4 w-4" /> Tornei attivi</Link>
          </div>
        </div>
        <div className="relative hidden lg:block min-h-[420px]">
          <div className="absolute right-0 top-[26%] -rotate-[10deg] text-right" style={{ fontFamily: "Caveat, cursive" }} data-testid="hero-claim">
            <div className="text-fsl-white text-[40px] leading-[0.95] font-bold drop-shadow-[0_2px_10px_rgba(0,0,0,0.7)]">Il futuro<br />scende<br />in campo</div>
            <svg viewBox="0 0 220 24" className="w-[220px] h-6 ml-auto mt-1" fill="none"><path d="M4 16 C60 4, 150 4, 216 12" stroke="#F4AE2B" strokeWidth="7" strokeLinecap="round" /></svg>
          </div>
        </div>
      </div>
      {main && <div className="relative mx-auto max-w-[1488px] px-6 -mt-16 pb-8 lg:hidden"><div className="-rotate-3 inline-block" style={{ fontFamily: "Caveat, cursive" }}><span className="text-fsl-white text-3xl font-bold">Il futuro scende in campo</span></div></div>}
    </section>
  );
}

const MISSION = [
  { img: "mission-trophy", icon: Trophy, title: "Tornei organizzati", text: "Competizioni strutturate con regolamenti ufficiali, campi di qualità e massima serietà organizzativa." },
  { img: "mission-pitch", icon: BarChart3, title: "Risultati e classifiche live", text: "Tutte le partite, i risultati, le classifiche e i calendari in tempo reale." },
  { img: "mission-media", icon: PlayCircle, title: "Visibilità social e media", text: "Foto, video, highlights e interviste per dare valore ai talenti e alle società." },
];

export function HubCodice() {
  const pills = ["Competere è importante", "I ragazzi prima del risultato", "Rispetto, sempre", "Gli adulti danno l'esempio", "Fair play reale", "Ogni ragazzo è parte del gioco"];
  return (
    <section id="codice" className="relative overflow-hidden scroll-mt-20" data-testid="hub-codice">
      <img src="/img/codice/hero.jpg" alt="" className="absolute inset-0 h-full w-full object-cover object-center" loading="lazy" />
      <div className="absolute inset-0" style={{ background: "linear-gradient(90deg,rgba(3,19,31,0.97) 0%,rgba(3,19,31,0.88) 50%,rgba(3,19,31,0.35) 100%)" }} />
      <div className="relative mx-auto max-w-[1488px] px-6 py-16 lg:py-24 grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] gap-10 items-center">
        <div>
          <Kicker className="mb-3">Il nostro modello etico e sportivo</Kicker>
          <h2 className="!text-5xl sm:!text-6xl lg:!text-7xl font-extrabold leading-[0.9]">Codice <span className="text-fsl-gold">FSL</span></h2>
          <p className="mt-3 font-display font-extrabold uppercase tracking-wide text-xl sm:text-2xl text-fsl-white/90">Competere. Crescere. Rispettare.</p>
          <p className="mt-5 max-w-2xl text-fsl-white/80 text-base sm:text-lg leading-relaxed">Il risultato conta, ma non vale più della crescita dei ragazzi. Sei principi, i principi di gioco e il Patto FSL valgono in ogni torneo: per giocatori, allenatori, dirigenti, famiglie e per noi che organizziamo.</p>
          <Link to="/codice-fsl" className="btn-gold h-12 px-6 mt-8" data-testid="hub-codice-cta">Leggi il Codice FSL <ArrowRight className="h-4 w-4" /></Link>
        </div>
        <ul className="grid sm:grid-cols-2 gap-3">
          {pills.map((t, i) => <li key={t} className="rounded-xl border border-white/15 bg-ink-950/60 backdrop-blur px-4 py-3 flex items-center gap-3 animate-rise" style={{ animationDelay: `${i * 70}ms` }}><span className="num font-display font-extrabold text-2xl text-fsl-gold w-9">0{i + 1}</span><span className="text-sm font-semibold">{t}</span></li>)}
        </ul>
      </div>
    </section>
  );
}

export function HubMission() {
  return (
    <section id="missione" className="mx-auto max-w-[1488px] px-6 py-16 lg:py-24 scroll-mt-20" data-testid="hub-mission">
      <div className="grid lg:grid-cols-2 gap-8 items-end">
        <div><Kicker className="mb-3">La nostra missione</Kicker><h2 className="!text-5xl sm:!text-6xl lg:!text-7xl font-extrabold leading-[0.9]">Cos'è FSL</h2></div>
        <p className="text-fsl-white/80 text-base sm:text-lg leading-relaxed lg:pb-2">FSL è una lega di tornei di calcio giovanile che unisce competizione, crescita e visibilità. Offriamo un'esperienza completa per società, atleti, famiglie e staff, con organizzazione professionale e una forte presenza mediatica.</p>
      </div>
      <div className="grid md:grid-cols-3 gap-5 mt-12">
        {MISSION.map((m, i) => (
          <article key={m.title} className="fsl-card overflow-hidden border-white/20 hover:border-fsl-gold/60 hover:-translate-y-1 transition-[transform,border-color] duration-300 animate-rise" style={{ animationDelay: `${i * 90}ms` }} data-testid={`mission-card-${i}`}>
            <div className="relative h-52"><img src={IMG(m.img)} alt="" className="absolute inset-0 h-full w-full object-cover" /><div className="absolute inset-0 bg-gradient-to-t from-navy-800 via-navy-800/40 to-transparent" /><div className="absolute left-5 bottom-4 h-14 w-14 rounded-xl border-2 border-fsl-gold/80 bg-ink-950/70 backdrop-blur flex items-center justify-center"><m.icon className="h-7 w-7 text-fsl-gold" /></div></div>
            <div className="p-6 pt-4"><h3 className="text-2xl font-extrabold leading-none">{m.title}</h3><p className="mt-3 text-sm text-fsl-white/75 leading-relaxed">{m.text}</p></div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function categoryCards(list) {
  const cards = [];
  list.forEach((t) => {
    const cats = t.categories?.length ? t.categories : [null];
    cats.forEach((cat) => cards.push({ t, cat, key: `${t.slug}-${cat || "all"}`, to: cat ? `/tornei/${t.slug}?category=${encodeURIComponent(cat)}` : `/tornei/${t.slug}`, teams: cat ? (t.teams_per_series || 0) * (t.series?.length || 1) : t.summary?.teams_capacity || 0 }));
  });
  return cards;
}

export function HubTournaments({ list }) {
  const cards = categoryCards(list.filter((t) => t.status === "active"));
  return (
    <section id="tornei" className="mx-auto max-w-[1488px] px-6 py-8 lg:py-12 scroll-mt-20" data-testid="hub-tournaments">
      <div className="flex items-end justify-between gap-4 flex-wrap"><div><Kicker className="mb-3">I nostri campionati</Kicker><h2 className="!text-5xl sm:!text-6xl lg:!text-7xl font-extrabold leading-[0.9]">Tornei attivi</h2></div><Link to="/tornei" className="font-display uppercase text-fsl-gold font-bold tracking-wide inline-flex items-center gap-2 border-b-2 border-fsl-gold pb-0.5 hover:text-fsl-white hover:border-fsl-white transition-colors" data-testid="hub-all-tournaments">Tutti i tornei <ArrowRight className="h-4 w-4" /></Link></div>
      {cards.length === 0 ? <p className="mt-8 text-fsl-slate" data-testid="hub-no-tournaments">Nessun torneo pubblicato al momento.</p> : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-5 mt-10" data-testid="public-tournament-list">
          {cards.map((c, i) => (
            <Link key={c.key} to={c.to} className="group fsl-card overflow-hidden border-white/20 hover:border-fsl-gold/70 hover:-translate-y-1 transition-[transform,border-color] duration-300 animate-rise" style={{ animationDelay: `${i * 80}ms` }} data-testid={`public-tournament-card-${c.t.slug}${c.cat ? `-${c.cat}` : ""}`}>
              <div className="relative h-[300px] overflow-hidden"><img src={IMG(CAT_IMGS[i % CAT_IMGS.length])} alt="" className="absolute inset-0 h-full w-full object-cover scale-[1.75] origin-[50%_42%] group-hover:scale-[1.82] transition-transform duration-700" style={{ objectPosition: "50% 42%" }} /><span className="absolute left-4 top-4 h-7 px-2.5 rounded-full bg-ink-950/70 backdrop-blur border border-white/20 text-[11px] font-semibold text-fsl-white/90 inline-flex items-center max-w-[85%] truncate">{c.t.name}</span><div className="absolute inset-0 bg-gradient-to-t from-navy-800 via-navy-800/55 to-transparent" />
                <div className="absolute left-5 right-5 bottom-4">{c.cat ? <><div className="font-display uppercase font-bold text-fsl-white text-sm tracking-wide">Categoria</div><div className="font-display font-extrabold text-6xl leading-none text-fsl-white num">{c.cat}</div></> : <div className="font-display font-extrabold text-4xl leading-none text-fsl-white">{c.t.name}</div>}
                  <div className="mt-2 font-display uppercase font-bold text-fsl-gold text-lg leading-none">{c.t.series?.length ? seriesLabel(c.t.series) : c.t.payoff || c.t.name}</div></div></div>
              <div className="p-5 pt-3 space-y-2 text-sm text-fsl-white/85">
                <div className="flex items-center gap-2.5"><Users className="h-4 w-4 text-fsl-gold shrink-0" /><span className="num">{c.teams} squadre</span></div>
                <div className="flex items-center gap-2.5"><Grid3X3 className="h-4 w-4 text-fsl-gold shrink-0" /><span className="num">{c.t.fields_count} campi</span></div>
                <div className="flex items-center gap-2.5"><CalendarDays className="h-4 w-4 text-fsl-gold shrink-0" /><span className="num uppercase">{fmtPeriod(c.t.start_date, c.t.end_date)}</span></div>
                <span className="mt-3 btn-ghost w-full h-11 uppercase font-display tracking-wide border-fsl-gold/50 text-fsl-gold group-hover:bg-fsl-gold group-hover:text-ink-950 group-hover:border-fsl-gold">Scopri torneo <ArrowRight className="h-4 w-4" /></span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

export function HubStats({ list, main }) {
  const teams = list.reduce((a, t) => a + (t.summary?.teams_capacity || 0), 0);
  const cats = new Set(list.flatMap((t) => t.categories || [])).size;
  const items = [[Users, teams, "Squadre"], [Shirt, cats, "Categorie"], [Shield, main?.series?.length ? seriesLabel(main.series) : "—", "Serie"], [CalendarDays, main ? fmtPeriod(main.start_date, main.end_date) : "—", "Stagione"]];
  return (
    <section className="relative overflow-hidden mt-10" data-testid="hub-stats">
      <img src={IMG("mission-pitch")} alt="" className="absolute inset-0 h-full w-full object-cover" /><div className="absolute inset-0 bg-navy-900/85" />
      <div className="relative mx-auto max-w-[1488px] px-6 py-10 grid grid-cols-2 lg:grid-cols-4 gap-6">
        {items.map(([Icon, value, label], i) => (
          <div key={label} className={`text-center ${i > 0 ? "lg:border-l lg:border-fsl-gold/40" : ""}`} data-testid={`hub-stat-${label.toLowerCase()}`}><Icon className="h-9 w-9 text-fsl-gold mx-auto" /><div className={`mt-2 font-display font-extrabold leading-none text-fsl-white num uppercase ${typeof value === "number" ? "text-4xl sm:text-5xl" : "text-2xl sm:text-3xl xl:text-4xl"}`}>{value}</div><div className="mt-1 font-display uppercase tracking-[0.2em] text-sm text-fsl-white/80">{label}</div></div>
        ))}
      </div>
    </section>
  );
}

export function HubMedia({ main }) {
  const news = main ? `/tornei/${main.slug}/news` : "/login";
  const Tile = ({ img, play = false, className = "", pos = "center" }) => (
    <Link to={news} className={`group relative overflow-hidden rounded-xl border border-white/15 block ${className}`}><img src={IMG(img)} alt="" className="absolute inset-0 h-full w-full object-cover group-hover:scale-[1.04] transition-transform duration-700" style={{ objectPosition: pos }} />{play && <span className="absolute inset-0 flex items-center justify-center"><span className="h-16 w-16 rounded-full bg-fsl-gold text-ink-950 flex items-center justify-center shadow-[0_0_0_8px_rgba(244,174,43,0.25)] group-hover:scale-110 transition-transform"><Play className="h-7 w-7 fill-current ml-1" /></span></span>}</Link>
  );
  return (
    <section id="media" className="mx-auto max-w-[1488px] px-6 py-16 lg:py-24 grid lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-10 items-center scroll-mt-20" data-testid="hub-media">
      <div><Kicker className="mb-3">Foto, video, highlights</Kicker><h2 className="!text-5xl sm:!text-6xl font-extrabold leading-[0.9]">I talenti<br />in primo piano</h2><p className="mt-6 text-fsl-white/80 leading-relaxed max-w-md">Raccontiamo il calcio giovanile attraverso foto, video, highlights, interviste e storie dalle nostre competizioni. Diamo visibilità ai ragazzi, alle società e ai loro percorsi di crescita.</p><Link to={news} className="mt-7 btn-ghost h-12 px-6 uppercase font-display tracking-wide border-fsl-gold/60 text-fsl-gold hover:bg-fsl-gold hover:text-ink-950" data-testid="hub-media-cta">Guarda i nostri contenuti <ArrowRight className="h-4 w-4" /></Link></div>
      <div className="grid grid-cols-4 grid-rows-2 gap-3 h-[360px] sm:h-[440px]"><Tile img="media-huddle" play className="col-span-2 row-span-2" /><Tile img="media-action" play /><Tile img="media-portrait" pos="center 25%" /><Tile img="mission-trophy" /><Tile img="media-stands" /></div>
    </section>
  );
}

export function HubAccess() {
  return (
    <section id="contatti" className="relative overflow-hidden scroll-mt-20" data-testid="hub-access">
      <img src={IMG("media-ball")} alt="" className="absolute inset-y-0 right-0 h-full w-full lg:w-[55%] object-cover object-right" /><div className="absolute inset-0 bg-[linear-gradient(90deg,#041E32_0%,#041E32_45%,rgba(4,30,50,0.75)_62%,rgba(4,30,50,0.25)_100%)]" />
      <div className="relative mx-auto max-w-[1488px] px-6 py-20 lg:py-28"><Kicker className="mb-3">Entra nella community FSL</Kicker><h2 className="!text-5xl sm:!text-6xl font-extrabold leading-[0.9]">Accedi alla tua area</h2>
        <div className="mt-8 rounded-2xl border border-fsl-gold/60 bg-fsl-gold/10 p-5 max-w-xl" data-testid="access-parents">
          <div className="fsl-kicker flex items-center gap-2 !text-fsl-gold"><Heart className="h-4 w-4" /> Genitori e tifosi</div>
          <h3 className="mt-1 font-display font-extrabold uppercase text-2xl leading-none">Segui tuo figlio o la tua squadra, gratis</h3>
          <p className="mt-2 text-sm text-fsl-white/80">Risultati in tempo reale, Top 11, foto e video, Card Player ID e avvisi delle convocazioni. Ti basta un'email: nessun account Google richiesto.</p>
          <div className="mt-4 flex flex-wrap gap-2"><Link to="/registrati" className="btn-gold h-11 px-5 uppercase font-display tracking-wide" data-testid="access-fan-register">Registrati gratis</Link><Link to="/login?area=genitori" className="btn-ghost h-11 px-5 uppercase font-display tracking-wide border-fsl-gold/60" data-testid="access-fan-login">Ho già un account</Link></div>
        </div>
        <p className="mt-8 text-fsl-white/80 max-w-lg leading-relaxed">Sei una società, un arbitro o uno staff? Accedi alla tua area riservata per gestire rose, calendari, risultati e molto altro.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link to="/login?area=societa" className="btn-gold h-12 px-6 uppercase font-display tracking-wide shadow-[0_10px_30px_-10px_rgba(244,174,43,0.8)]" data-testid="access-club"><Users className="h-4 w-4" /> Login società</Link>
          <Link to="/login?area=arbitri" className="btn-ghost h-12 px-6 uppercase font-display tracking-wide border-white/40 hover:border-fsl-gold" data-testid="access-referee"><Flag className="h-4 w-4" /> Login arbitri</Link>
          <Link to="/login?area=staff" className="btn-ghost h-12 px-6 uppercase font-display tracking-wide border-white/40 hover:border-fsl-gold" data-testid="access-staff"><Settings className="h-4 w-4" /> Login staff</Link>
        </div>
      </div>
    </section>
  );
}
