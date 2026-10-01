import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowRight, Flag, Goal, Handshake, Heart, Megaphone, Quote, Scale, Shield, ShieldCheck, Sparkles, Target, Trophy, Users, Volleyball } from "lucide-react";

const IMG = (n) => `/img/codice/${n}.jpg`;

export const CODICE = {
  intro: [
    "Future Stars League nasce per creare un ambiente nel quale il risultato conta, ma non vale più della crescita dei ragazzi.",
    "Vogliamo competizioni vere, organizzate e coinvolgenti, nelle quali società, allenatori, famiglie e giovani calciatori condividano gli stessi principi.",
    "Il Codice FSL rappresenta il modello sportivo ed etico comune a tutte le competizioni organizzate o gestite attraverso Future Stars League, indipendentemente dalla categoria, dalla formula e dalla durata del torneo.",
  ],
  principles: [
    { n: "01", title: "Competere è importante", claim: "Si gioca per vincere. Si impara anche a perdere.", icon: Trophy, img: "hero", text: ["FSL valorizza l'ambizione, l'impegno e la sana competizione.", "Il risultato, la classifica e i premi fanno parte dello sport e contribuiscono a renderlo emozionante. Vincere deve però essere la conseguenza del gioco, dell'impegno e del lavoro della squadra, mai la giustificazione per comportamenti scorretti o antisportivi.", "Saper vincere e saper perdere fanno parte dello stesso percorso di crescita."] },
    { n: "02", title: "I ragazzi prima del risultato", claim: "Il protagonista è chi scende in campo.", icon: Heart, img: "coach", text: ["Ogni scelta sportiva e organizzativa deve mettere al centro i giovani calciatori.", "Divertimento, crescita, sicurezza, rispetto e possibilità di esprimersi vengono prima dell'esasperazione del risultato.", "Nessuna partita, classifica o trofeo giustifica l'umiliazione di un ragazzo, pressioni sproporzionate o comportamenti che trasformino il calcio giovanile in qualcosa che non dovrebbe essere."] },
    { n: "03", title: "Rispetto, sempre", claim: "Avversari oggi. Compagni di sport sempre.", icon: Handshake, img: null, list: ["compagni", "avversari", "arbitri", "allenatori", "dirigenti", "organizzatori", "famiglie", "pubblico"], text: ["Ogni partecipante è tenuto a rispettare:", "Insulti, minacce, discriminazioni, provocazioni, aggressioni e comportamenti violenti sono incompatibili con il modello FSL.", "Il confronto sportivo termina con il fischio finale. Il rispetto continua anche dopo."] },
    { n: "04", title: "Gli adulti danno l'esempio", claim: "I ragazzi giocano. Gli adulti hanno una responsabilità in più.", icon: Megaphone, img: "families", text: ["Allenatori, dirigenti e famiglie sono parte fondamentale dell'esperienza sportiva. Il loro comportamento contribuisce direttamente al clima nel quale i ragazzi vivono la partita.", "Il tifo, l'entusiasmo e la partecipazione sono incoraggiati.", "Non appartengono invece al modello FSL contestazioni esasperate, insulti, pressioni sui ragazzi, aggressività verso arbitri e avversari o continue indicazioni provenienti dagli spalti.", "Gli adulti devono essere il primo esempio di comportamento sportivo."] },
    { n: "05", title: "Fair play reale", claim: "Vincere bene vale più che vincere a ogni costo.", icon: Sparkles, img: null, text: ["FSL valorizza i gesti di correttezza e rispetto che avvengono durante e dopo la partita.", "Il comportamento dei giocatori, delle panchine e delle società rappresenta parte integrante della competizione.", "Gesti particolarmente significativi di fair play possono essere valorizzati e riconosciuti dalla manifestazione."] },
    { n: "06", title: "Ogni ragazzo deve sentirsi parte del gioco", claim: "Il talento distingue. Il rispetto deve essere uguale per tutti.", icon: Users, img: "team", text: ["Differenze tecniche, fisiche e caratteriali fanno naturalmente parte dello sport.", "FSL promuove un ambiente inclusivo nel quale ogni giovane atleta venga trattato con dignità e possa vivere la competizione senza discriminazioni, derisioni o umiliazioni.", "Competizione e inclusione non sono opposti: si può competere seriamente rispettando ogni ragazzo."] },
  ],
  game: [
    { title: "Calcio d'inizio", icon: Flag, text: ["Non è consentita la realizzazione diretta di una rete dal calcio d'inizio, sia all'inizio della partita sia dopo la segnatura di un gol.", "Il calcio d'inizio deve quindi essere utilizzato per riprendere il gioco attraverso un'azione della squadra."] },
    { title: "Calci di punizione", icon: Target, text: ["Tutti i calci di punizione sono considerati diretti.", "È quindi possibile calciare direttamente verso la porta avversaria."] },
    { title: "Calcio di rigore", icon: Scale, text: ["È previsto il calcio di rigore in presenza di infrazioni evidenti commesse nell'area di rigore. In particolare, può essere assegnato per:"], list: ["fallo di mano evidente", "intervento falloso evidente", "comportamento che impedisca irregolarmente una chiara azione di gioco all'interno dell'area"], after: "La valutazione dell'episodio spetta all'arbitro." },
    { title: "Rinvio del portiere", icon: Goal, text: ["FSL incoraggia la costruzione del gioco e lo sviluppo tecnico dei giovani calciatori.", "Il rinvio del portiere direttamente oltre la metà campo è tollerato occasionalmente, ma non deve diventare una modalità di gioco sistematica e continuativa.", "L'obiettivo è favorire la partecipazione dei giocatori alla costruzione dell'azione ed evitare l'utilizzo costante del lancio lungo come unica soluzione di ripresa del gioco."] },
  ],
  pact: [
    { who: "Giocatori", icon: Volleyball, lines: ["Gioco con impegno.", "Rispetto compagni, avversari e arbitro.", "Provo a vincere senza dimenticare le regole e i valori dello sport.", "Accetto il risultato e stringo la mano al mio avversario."] },
    { who: "Allenatori", icon: Megaphone, lines: ["Insegno a competere senza dimenticare che sto formando ragazzi.", "Trasmetto passione, disciplina, coraggio e rispetto.", "Proteggo i miei giocatori senza alimentare conflitti.", "Il mio comportamento deve essere un esempio per la squadra."] },
    { who: "Dirigenti", icon: Shield, lines: ["Proteggo il valore educativo e sportivo della competizione.", "Collaboro con organizzazione, arbitri e altre società affinché ogni partita possa svolgersi nel clima corretto.", "Gli interessi della singola squadra non devono compromettere il rispetto della competizione."] },
    { who: "Famiglie", icon: Heart, lines: ["Tifo. Sostengo. Incoraggio.", "Lascio giocare i ragazzi.", "Non sostituisco l'allenatore dalla tribuna.", "Non sostituisco l'arbitro dagli spalti.", "Non trasformo una partita di calcio giovanile in qualcosa che non è.", "Alla fine della gara, il primo messaggio deve essere rivolto al ragazzo, non al risultato."] },
    { who: "FSL", icon: ShieldCheck, claim: "Organizza, ascolta e tutela.", lines: ["Future Stars League si impegna a garantire competizioni organizzate, imparziali e riconoscibili.", "Tutela il rispetto delle regole, delle società e dei ragazzi.", "Ascolta le segnalazioni e interviene quando comportamenti incompatibili con il Codice FSL rischiano di compromettere il valore della manifestazione."] },
  ],
  idea: ["Vogliamo ragazzi ambiziosi.", "Vogliamo che entrino in campo per provare a vincere.", "Vogliamo che festeggino una vittoria e imparino ad accettare una sconfitta.", "Vogliamo allenatori capaci di insegnare calcio e valori.", "Vogliamo società competitive e corrette.", "Vogliamo famiglie presenti e appassionate.", "Vogliamo ragazzi che desiderino vincere."],
  ideaClose: "Ma vogliamo soprattutto insegnare loro come si vince, come si perde e come ci si comporta in entrambi i casi.",
};

const Kicker = ({ children, className = "" }) => <div className={`text-[11px] sm:text-xs font-semibold tracking-[0.28em] uppercase text-fsl-gold ${className}`}>{children}</div>;
const H2 = ({ children, className = "" }) => <h2 className={`font-display font-extrabold uppercase leading-[0.9] text-4xl sm:text-5xl lg:text-6xl ${className}`}>{children}</h2>;

function Principle({ p, i }) {
  const Icon = p.icon;
  const flip = i % 2 === 1;
  return (
    <article id={`principio-${p.n}`} className="relative grid lg:grid-cols-12 gap-6 lg:gap-10 items-stretch scroll-mt-24" data-testid={`codice-principle-${p.n}`}>
      <div className={`lg:col-span-5 ${flip ? "lg:order-2" : ""}`}>
        {p.img ? (
          <div className="relative h-64 sm:h-80 lg:h-full min-h-[280px] rounded-2xl overflow-hidden border border-white/10">
            <img src={IMG(p.img)} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
            <div className="absolute inset-0 bg-gradient-to-t from-ink-950/90 via-ink-950/20 to-transparent" />
            <div className="absolute left-5 bottom-4 font-display font-extrabold text-7xl leading-none text-fsl-gold/90 num">{p.n}</div>
          </div>
        ) : (
          <div className="relative h-64 lg:h-full min-h-[280px] rounded-2xl overflow-hidden border border-fsl-gold/30 bg-navy-800 grain flex items-center justify-center">
            <span className="absolute font-display font-extrabold text-[220px] leading-none text-white/[0.05] num select-none">{p.n}</span>
            <Icon className="relative h-24 w-24 text-fsl-gold" strokeWidth={1.25} />
            <div className="absolute left-5 bottom-4 font-display font-extrabold text-7xl leading-none text-fsl-gold/90 num">{p.n}</div>
          </div>
        )}
      </div>
      <div className={`lg:col-span-7 flex flex-col justify-center ${flip ? "lg:order-1" : ""}`}>
        <div className="inline-flex items-center gap-3 mb-3"><span className="h-10 w-10 rounded-full border border-fsl-gold/50 bg-ink-950/60 inline-flex items-center justify-center"><Icon className="h-5 w-5 text-fsl-gold" /></span><Kicker>Principio {p.n}</Kicker></div>
        <h3 className="font-display font-extrabold uppercase leading-[0.92] text-3xl sm:text-4xl lg:text-5xl">{p.title}</h3>
        <p className="mt-3 text-lg sm:text-xl font-semibold text-fsl-gold italic">{p.claim}</p>
        <div className="mt-5 space-y-3 text-base text-fsl-white/85 leading-relaxed">
          <p>{p.text[0]}</p>
          {p.list && <ul className="flex flex-wrap gap-2 py-1">{p.list.map((x) => <li key={x} className="h-8 px-3 rounded-full border border-white/15 bg-white/5 text-sm inline-flex items-center capitalize">{x}</li>)}</ul>}
          {p.text.slice(1).map((t, k) => <p key={k}>{t}</p>)}
        </div>
      </div>
    </article>
  );
}

export default function CodiceFSL() {
  const [active, setActive] = useState("codice");
  useEffect(() => {
    const ids = ["codice", "gioco", "patto", "idea"];
    const obs = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && setActive(e.target.id)), { rootMargin: "-40% 0px -55% 0px" });
    ids.forEach((id) => { const el = document.getElementById(id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, []);
  const nav = [["codice", "I sei principi"], ["gioco", "Principi di gioco"], ["patto", "Il Patto FSL"], ["idea", "La nostra idea di sport"]];
  return (
    <div className="bg-ink-950 text-fsl-white" data-testid="codice-fsl-page">
      <section className="relative min-h-[82vh] flex items-end overflow-hidden" data-testid="codice-hero">
        <img src={IMG("hero")} alt="Giovani calciatori si stringono la mano a fine gara" className="absolute inset-0 h-full w-full object-cover object-center" fetchpriority="high" />
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg,rgba(3,19,31,0.35) 0%,rgba(3,19,31,0.55) 45%,rgba(3,19,31,0.97) 100%)" }} />
        <div className="relative mx-auto max-w-[1488px] w-full px-6 pb-16 pt-40">
          <Kicker className="mb-4 animate-rise">Il modello etico e sportivo di Future Stars League</Kicker>
          <h1 className="font-display font-extrabold uppercase leading-[0.85] text-6xl sm:text-7xl lg:text-[8.5rem] animate-rise" style={{ animationDelay: "80ms", textShadow: "0 12px 40px rgba(0,0,0,0.6)" }}>Codice <span style={{ background: "linear-gradient(180deg,#FFF0B8 0%,#F4AE2B 55%,#C8811A 100%)", WebkitBackgroundClip: "text", color: "transparent" }}>FSL</span></h1>
          <p className="mt-5 font-display font-extrabold uppercase tracking-wide text-2xl sm:text-3xl lg:text-4xl text-fsl-white/95 animate-rise" style={{ animationDelay: "160ms" }} data-testid="codice-payoff">Competere. <span className="text-fsl-gold">Crescere.</span> Rispettare.</p>
          <div className="mt-8 grid lg:grid-cols-[1fr_auto] gap-8 items-end animate-rise" style={{ animationDelay: "240ms" }}>
            <div className="max-w-3xl space-y-3 text-base sm:text-lg text-fsl-white/85 leading-relaxed">{CODICE.intro.map((t, i) => <p key={i} className={i === 2 ? "text-fsl-white/70 text-sm sm:text-base" : ""}>{t}</p>)}</div>
            <a href="#codice" className="btn-gold h-12 px-6 whitespace-nowrap" data-testid="codice-scroll-cta">Leggi il Codice <ArrowDown className="h-4 w-4" /></a>
          </div>
        </div>
      </section>

      <nav className="sticky top-16 z-30 border-y border-white/10 bg-ink-950/85 backdrop-blur-xl" data-testid="codice-subnav">
        <div className="mx-auto max-w-[1488px] px-6 flex gap-1 overflow-x-auto no-scrollbar">
          {nav.map(([id, l]) => <a key={id} href={`#${id}`} className={`h-12 px-4 inline-flex items-center whitespace-nowrap text-sm font-semibold border-b-2 transition-colors ${active === id ? "border-fsl-gold text-fsl-gold" : "border-transparent text-fsl-white/70 hover:text-fsl-white"}`} data-testid={`codice-nav-${id}`}>{l}</a>)}
        </div>
      </nav>

      <section id="codice" className="mx-auto max-w-[1488px] px-6 py-16 lg:py-24 scroll-mt-28 gold-skin" data-testid="codice-principles">
        <div className="grid lg:grid-cols-2 gap-8 items-end mb-14">
          <div><Kicker className="mb-3">Il Codice</Kicker><H2>Sei principi, <span className="text-fsl-gold">un solo modello</span></H2></div>
          <p className="text-fsl-white/75 text-base sm:text-lg leading-relaxed lg:pb-2">Valgono per ogni torneo FSL, dal campionato di otto mesi all'evento di un weekend: per i ragazzi, per chi li allena, per chi li accompagna e per chi organizza.</p>
        </div>
        <div className="space-y-16 lg:space-y-24">{CODICE.principles.map((p, i) => <Principle key={p.n} p={p} i={i} />)}</div>
      </section>

      <section id="gioco" className="relative overflow-hidden scroll-mt-28 gold-skin" data-testid="codice-game">
        <img src={IMG("keeper")} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
        <div className="absolute inset-0 bg-ink-950/88" />
        <div className="relative mx-auto max-w-[1488px] px-6 py-16 lg:py-24">
          <Kicker className="mb-3">In campo</Kicker>
          <H2>Principi di gioco <span className="text-fsl-gold">FSL</span></H2>
          <p className="mt-4 max-w-3xl text-fsl-white/80 text-base sm:text-lg leading-relaxed">Per favorire un calcio giovanile dinamico, tecnico e coerente con il percorso di crescita dei ragazzi, le competizioni FSL adottano alcuni principi comuni di gioco.</p>
          <div className="mt-10 grid md:grid-cols-2 gap-4">
            {CODICE.game.map((g) => (
              <article key={g.title} className="rounded-2xl border border-white/15 bg-navy-800/80 backdrop-blur p-6 hover:border-fsl-gold/60 transition-colors" data-testid={`codice-game-${g.title.toLowerCase().replace(/[^a-z]+/g, "-")}`}>
                <div className="flex items-center gap-3"><span className="h-11 w-11 rounded-xl border border-fsl-gold/50 bg-ink-950/70 inline-flex items-center justify-center"><g.icon className="h-5 w-5 text-fsl-gold" /></span><h3 className="font-display font-extrabold uppercase text-2xl leading-none">{g.title}</h3></div>
                <div className="mt-4 space-y-2 text-sm sm:text-base text-fsl-white/85 leading-relaxed">
                  {g.text.map((t, k) => <p key={k}>{t}</p>)}
                  {g.list && <ul className="list-disc pl-5 space-y-1 text-fsl-white/80">{g.list.map((x) => <li key={x}>{x}</li>)}</ul>}
                  {g.after && <p className="text-fsl-gold font-semibold">{g.after}</p>}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="patto" className="mx-auto max-w-[1488px] px-6 py-16 lg:py-24 scroll-mt-28 gold-skin" data-testid="codice-pact">
        <div className="grid lg:grid-cols-2 gap-8 items-end mb-12">
          <div><Kicker className="mb-3">Un impegno condiviso</Kicker><H2>Il Patto <span className="text-fsl-gold">FSL</span></H2></div>
          <p className="text-fsl-white/75 text-base sm:text-lg leading-relaxed lg:pb-2">Cinque voci, una promessa reciproca: ognuno, con il proprio ruolo, protegge il valore della partita.</p>
        </div>
        <div className="grid md:grid-cols-2 xl:grid-cols-5 gap-4">
          {CODICE.pact.map((p, i) => (
            <article key={p.who} className={`relative rounded-2xl border p-6 flex flex-col animate-rise ${p.who === "FSL" ? "border-fsl-gold/60 bg-gradient-to-b from-fsl-gold/15 to-navy-800 md:col-span-2 xl:col-span-1" : "border-white/15 bg-navy-800/80"}`} style={{ animationDelay: `${i * 80}ms` }} data-testid={`codice-pact-${p.who.toLowerCase()}`}>
              <span className="h-11 w-11 rounded-xl border border-fsl-gold/50 bg-ink-950/70 inline-flex items-center justify-center"><p.icon className="h-5 w-5 text-fsl-gold" /></span>
              <h3 className="mt-4 font-display font-extrabold uppercase text-3xl leading-none">{p.who}</h3>
              {p.claim && <p className="mt-1 text-fsl-gold font-semibold italic">{p.claim}</p>}
              <ul className="mt-4 space-y-2 text-sm text-fsl-white/85 leading-relaxed">{p.lines.map((l) => <li key={l} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 rounded-full bg-fsl-gold shrink-0" />{l}</li>)}</ul>
            </article>
          ))}
        </div>
      </section>

      <section id="idea" className="relative overflow-hidden scroll-mt-28" data-testid="codice-idea">
        <img src={IMG("team")} alt="" className="absolute inset-0 h-full w-full object-cover object-center" loading="lazy" />
        <div className="absolute inset-0" style={{ background: "linear-gradient(90deg,rgba(3,19,31,0.96) 0%,rgba(3,19,31,0.85) 55%,rgba(3,19,31,0.45) 100%)" }} />
        <div className="relative mx-auto max-w-[1488px] px-6 py-20 lg:py-28">
          <Quote className="h-10 w-10 text-fsl-gold mb-4" />
          <Kicker className="mb-3">Manifesto</Kicker>
          <H2>La nostra idea <span className="text-fsl-gold">di sport</span></H2>
          <ul className="mt-8 max-w-3xl space-y-2">{CODICE.idea.map((l, i) => <li key={l} className="font-display font-extrabold uppercase text-xl sm:text-2xl lg:text-3xl leading-tight text-fsl-white/90 animate-rise" style={{ animationDelay: `${i * 70}ms` }}>{l}</li>)}</ul>
          <p className="mt-8 max-w-3xl font-display font-extrabold uppercase text-2xl sm:text-3xl lg:text-4xl leading-tight" style={{ background: "linear-gradient(180deg,#FFF0B8 0%,#F4AE2B 55%,#C8811A 100%)", WebkitBackgroundClip: "text", color: "transparent" }} data-testid="codice-idea-close">{CODICE.ideaClose}</p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link to="/tornei" className="btn-gold h-12 px-6">Scopri i tornei <ArrowRight className="h-4 w-4" /></Link>
            <Link to="/" className="btn-ghost h-12 px-6">Torna alla home</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
