import { Bell, Check, Download, Heart, Image as ImageIcon, LogIn, ShoppingCart, Star, Video } from "lucide-react";
import { Btn, Tap, Title, TutorialPlayer } from "@/components/fsl/TutorialKit";

const Field = ({ label, value, tap }) => <div className="flex items-center justify-between h-9 px-2 rounded-lg bg-white/[0.04] border border-white/10 text-xs"><span className="text-fsl-slate">{label}</span><Tap on={tap}><span className={`font-semibold ${value ? "text-white" : "text-white/30"}`}>{value || "…"}</span></Tap></div>;
const Card = ({ title, sub, fav, tap, icon: Icon = Heart }) => <div className="flex items-center gap-2 h-11 px-2 rounded-lg bg-white/[0.04] border border-white/10"><span className="h-7 w-7 rounded-full bg-emerald-700 inline-flex items-center justify-center text-[8px] font-black">SPO</span><div className="min-w-0 flex-1"><div className="text-xs font-semibold truncate">{title}</div><div className="text-[10px] text-fsl-slate truncate">{sub}</div></div><Tap on={tap}><Icon className={`h-4 w-4 ${fav ? "fill-fsl-gold text-fsl-gold" : "text-white/40"}`} /></Tap></div>;
const Child = ({ photo }) => <div className="flex items-center gap-3 rounded-xl border border-fsl-gold/50 bg-fsl-gold/10 p-2"><span className={`h-12 w-10 rounded-lg inline-flex items-center justify-center text-[10px] font-black ${photo ? "bg-gradient-to-b from-emerald-500/40 to-emerald-900/40" : "bg-navy-700"}`}>{photo ? "" : "L"}</span><div><div className="text-xs font-bold"><span className="num text-fsl-gold mr-1">1</span>Luca B.</div><div className="text-[10px] text-fsl-slate">Sporting Eur · Under 10</div></div></div>;

const SCENES = {
  1: {
    frames: [
      { caption: "Apri futurestarsleague.com → «Genitori e tifosi» → Registrati.", stage: 0 },
      { caption: "Nome, email e password: niente account Google necessario.", stage: 1 },
      { caption: "Leggi l'informativa privacy: i dati dei bambini sono pubblici solo con il consenso della società e della famiglia.", stage: 2, tap: "privacy" },
      { caption: "Tocca «Registrati».", stage: 3, tap: "submit" },
      { caption: "Fatto: entri nella tua Area Genitori.", stage: 4 },
    ],
    render: (f) => (
      <>
        <Title>Genitori e tifosi · Registrati</Title>
        <Field label="Nome e cognome" value={f.stage >= 1 ? "Anna Bianchi" : ""} />
        <Field label="Email" value={f.stage >= 1 ? "anna@…" : ""} />
        <Field label="Password" value={f.stage >= 1 ? "••••••••" : ""} />
        <div className="flex items-center gap-2 text-[10px] text-fsl-slate"><Tap on={f.tap === "privacy"}><span className={`h-5 w-5 rounded border inline-flex items-center justify-center ${f.stage >= 2 ? "bg-fsl-success border-fsl-success text-ink-950" : "border-white/30"}`}>{f.stage >= 2 && <Check className="h-3.5 w-3.5" />}</span></Tap><span>Ho letto l'informativa privacy</span></div>
        <Btn on={f.tap === "submit"} label={f.stage >= 4 ? <><Check className="h-4 w-4" /> Benvenuta, Anna</> : <><LogIn className="h-4 w-4" /> Registrati</>} tone={f.stage >= 4 ? "success" : f.stage >= 2 ? "gold" : "ghost"} />
      </>
    ),
  },
  2: {
    frames: [
      { caption: "La società ti consegna il «Codice figlio» (9 caratteri). Nell'Area Genitori tocca «Collega mio figlio».", stage: 0, tap: "link" },
      { caption: "Inserisci il codice…", stage: 1 },
      { caption: "Ecco la scheda di tuo figlio: squadra, gare, statistiche e badge.", stage: 2 },
      { caption: "Compila il profilo «Mi presento»: ruolo preferito, idolo, piede. Lo vedranno solo con il consenso immagine.", stage: 3, tap: "intro" },
      { caption: "Puoi proporre una foto: la società la approva prima della pubblicazione.", stage: 4, tap: "photo" },
    ],
    render: (f) => (
      <>
        <Title>Area Genitori · I miei bambini</Title>
        {f.stage === 0 && <Btn on label="Collega mio figlio" />}
        {f.stage === 1 && <div className="rounded-lg border border-fsl-gold/60 px-2 py-2 text-center"><div className="text-[9px] uppercase text-fsl-gold">Codice figlio</div><div className="num font-black tracking-[0.3em]">K7M-3PX-9<span className="animate-pulse">|</span></div></div>}
        {f.stage >= 2 && <Child photo={f.stage >= 4} />}
        {f.stage >= 2 && <div className="grid grid-cols-3 gap-1.5 text-center">{[["Gare", 4], ["Gol", 3], ["Badge", 2]].map(([l, v]) => <div key={l} className="rounded-lg bg-white/[0.04] border border-white/10 py-1.5"><div className="num font-black">{v}</div><div className="text-[9px] uppercase text-fsl-slate">{l}</div></div>)}</div>}
        {f.stage >= 3 && <Tap on={f.tap === "intro"} className="w-full" ring="rounded-xl"><div className="w-full rounded-lg border border-white/10 px-2 py-1.5 text-[10px]"><span className="text-fsl-gold font-bold">Mi presento</span> · Attaccante · Idolo: Totti · Destro</div></Tap>}
        {f.stage >= 4 && <Btn on={f.tap === "photo"} label={<><ImageIcon className="h-4 w-4" /> Proponi una foto</>} tone="ghost" />}
      </>
    ),
  },
  3: {
    frames: [
      { caption: "Su ogni torneo, società o giocatore tocca il cuore per seguirlo.", favs: 1, tap: 0 },
      { caption: "Segui anche la squadra del cuore…", favs: 2, tap: 1 },
      { caption: "Nell'Area Genitori trovi il feed: prossime gare, risultati, Top 11 e novità dei tuoi preferiti.", favs: 2, feed: true },
      { caption: "La campanella raccoglie convocazioni, risultati e badge di tuo figlio.", favs: 2, feed: true, bell: true },
      { caption: "Attiva le notifiche push dal profilo: ti avvisiamo anche a telefono chiuso.", favs: 2, feed: true, bell: true, push: true },
    ],
    render: (f) => (
      <>
        <div className="flex items-center justify-between"><Title>Preferiti e notifiche</Title><Tap on={!!f.bell && !f.push}><span className="relative"><Bell className="h-4 w-4 text-fsl-gold" />{f.bell && <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-fsl-danger text-[8px] font-bold inline-flex items-center justify-center">3</span>}</span></Tap></div>
        <Card title="Sporting Eur · Under 10" sub="La Serie A dei Bambini" fav={f.favs >= 1} tap={f.tap === 0} />
        <Card title="Luca B. · n. 1" sub="Portiere" fav={f.favs >= 2} tap={f.tap === 1} />
        {f.feed && <div className="space-y-1"><div className="text-[9px] uppercase text-fsl-slate">Prossime partite</div><div className="rounded-lg bg-white/[0.04] border border-white/10 px-2 py-1.5 text-[10px]"><span className="text-fsl-gold">Sab 10:30</span> · Sporting Eur – Appio Latino · Campo 1</div></div>}
        {f.bell && <div className="rounded-lg bg-white/[0.04] border border-white/10 px-2 py-1.5 text-[10px] flex gap-2"><Star className="h-3.5 w-3.5 text-fsl-gold shrink-0" /><span>Luca è convocato per sabato · Badge «Prima parata»</span></div>}
        {f.push && <Btn on label={<><Bell className="h-4 w-4" /> Notifiche push attive</>} tone="success" />}
      </>
    ),
  },
  4: {
    frames: [
      { caption: "Nel Match Center di ogni gara trovi foto e video ufficiali.", stage: 0 },
      { caption: "Scegli una foto o il video della gara e aggiungilo al carrello.", stage: 1, tap: "add" },
      { caption: "La Card Player ID di tuo figlio: una figurina digitale da collezione.", stage: 2, tap: "card" },
      { caption: "Paga in sicurezza con carta (Stripe): ricevi la ricevuta via email.", stage: 3, tap: "pay" },
      { caption: "Tutto in «I miei acquisti»: scarica foto e video quando vuoi.", stage: 4 },
    ],
    render: (f) => (
      <>
        <div className="flex items-center justify-between"><Title>{f.stage >= 4 ? "I miei acquisti" : "Match Center · Foto e video"}</Title><span className="relative"><ShoppingCart className="h-4 w-4 text-fsl-gold" />{f.stage >= 1 && f.stage < 4 && <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-fsl-gold text-ink-950 text-[8px] font-bold inline-flex items-center justify-center">{f.stage >= 2 ? 2 : 1}</span>}</span></div>
        {f.stage < 4 && <div className="grid grid-cols-3 gap-1.5">{[ImageIcon, Video, ImageIcon].map((I, i) => <Tap key={i} on={f.tap === "add" && i === 0} ring="rounded-xl"><span className={`aspect-square w-full rounded-lg inline-flex items-center justify-center border ${f.stage >= 1 && i === 0 ? "border-fsl-gold bg-fsl-gold/15" : "border-white/10 bg-white/[0.04]"}`}><I className="h-5 w-5 text-white/60" /></span></Tap>)}</div>}
        {f.stage >= 2 && f.stage < 4 && <Tap on={f.tap === "card"} className="w-full" ring="rounded-xl"><div className={`w-full rounded-lg border px-2 py-1.5 text-[10px] flex items-center gap-2 ${f.stage >= 2 ? "border-fsl-gold bg-fsl-gold/15" : "border-white/10"}`}><Star className="h-4 w-4 text-fsl-gold" /><span><b>Card Player ID</b> · Luca B. · 4,90 €</span></div></Tap>}
        {f.stage === 3 && <Btn on label="Paga 9,80 € con carta" />}
        {f.stage >= 4 && <div className="space-y-1.5">{[["FOTO", "Parata al 12' · Sporting–Appio"], ["CARD", "Player ID · Luca B."]].map(([k, t]) => <div key={t} className="flex items-center gap-2 h-9 px-2 rounded-lg bg-white/[0.04] border border-white/10 text-[10px]"><span className="text-fsl-gold font-bold w-8">{k}</span><span className="flex-1 truncate">{t}</span><Download className="h-3.5 w-3.5 text-fsl-gold" /></div>)}</div>}
      </>
    ),
  },
};

export const ParentTutorial = ({ step }) => <TutorialPlayer scene={SCENES[step]} step={step} prefix="parent" />;
