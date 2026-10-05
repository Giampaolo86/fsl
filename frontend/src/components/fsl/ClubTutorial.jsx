import { Bell, Camera, Check, Download, FileSpreadsheet, Lock, Upload, UserPlus } from "lucide-react";
import { Btn, Row, Tap, Title, TutorialPlayer } from "@/components/fsl/TutorialKit";

const PLAYERS = [[1, "Bianchi"], [4, "Conti"], [7, "Esposito"], [9, "Ferri"], [10, "Greco"], [11, "Marino"], [14, "Russo"]];
const XLS_ROWS = [["Bianchi Luca", "POR", 1, "ok"], ["Conti Marco", "DIF", 4, "ok"], ["Esposito Andrea", "CEN", 7, "ok"], ["Ferri Paolo", "ATT", 7, "err"], ["Greco Davide", "ATT", 10, "ok"]];

const Line = ({ label, value, tap }) => <div className="flex items-center justify-between h-9 px-2 rounded-lg bg-white/[0.04] border border-white/10 text-xs"><span className="text-fsl-slate">{label}</span><Tap on={tap}><span className={`font-semibold ${value ? "text-white" : "text-white/30"}`}>{value || "…"}</span></Tap></div>;
const Doc = ({ label, state }) => <div className="flex items-center justify-between h-9 px-2 rounded-lg bg-white/[0.04] border border-white/10 text-xs"><span className="font-semibold">{label}</span><span className={`h-5 px-1.5 rounded text-[9px] font-bold uppercase inline-flex items-center ${state === "ok" ? "bg-fsl-success/15 text-fsl-success" : state === "warn" ? "bg-fsl-warning/15 text-fsl-warning" : "bg-white/10 text-fsl-slate"}`}>{state === "ok" ? "Valido" : state === "warn" ? "In scadenza" : "Mancante"}</span></div>;

const SCENES = {
  1: {
    frames: [
      { caption: "Area Società → Rose → «Aggiungi giocatore».", tap: "add" },
      { caption: "Inserisci nome, cognome, data di nascita, ruolo e numero di maglia.", form: 2 },
      { caption: "Spunta il consenso immagine se i genitori lo hanno firmato: solo così nome e foto saranno pubblici.", form: 4, consent: true, tap: "consent" },
      { caption: "Carica la foto: lo sfondo viene scontornato automaticamente.", form: 4, consent: true, photo: true, tap: "photo" },
      { caption: "Il «Codice figlio» (9 caratteri) va consegnato ai genitori: con quello seguono il bambino dall'Area Genitori.", form: 4, consent: true, photo: true, code: true },
    ],
    render: (f) => (
      <>
        <Title>Rose · Nuovo giocatore</Title>
        <Btn on={f.tap === "add"} label={<><UserPlus className="h-4 w-4" /> Aggiungi giocatore</>} tone={f.form ? "ghost" : "gold"} />
        {f.form >= 1 && <Line label="Nome e cognome" value="Luca Bianchi" />}
        {f.form >= 2 && <Line label="Nato il · Ruolo · N." value="12/03/2014 · POR · 1" />}
        {f.form >= 3 && <div className="flex items-center gap-2 h-9 px-2 rounded-lg bg-white/[0.04] border border-white/10 text-xs"><Tap on={f.tap === "consent"}><span className={`h-5 w-5 rounded border inline-flex items-center justify-center ${f.consent ? "bg-fsl-success border-fsl-success text-ink-950" : "border-white/30"}`}>{f.consent && <Check className="h-3.5 w-3.5" />}</span></Tap><span>Consenso immagine firmato</span></div>}
        {f.form >= 3 && <div className="flex items-center gap-3"><Tap on={f.tap === "photo"}><span className={`h-14 w-11 rounded-lg border inline-flex items-center justify-center ${f.photo ? "bg-gradient-to-b from-emerald-500/40 to-emerald-900/40 border-fsl-gold" : "border-dashed border-white/30"}`}><Camera className="h-4 w-4 text-white/70" /></span></Tap><span className="text-[10px] text-fsl-slate">{f.photo ? "Foto scontornata ✓" : "Carica foto"}</span></div>}
        {f.code && <div className="rounded-lg border border-fsl-gold/60 bg-fsl-gold/10 px-2 py-2 text-center"><div className="text-[9px] uppercase text-fsl-gold">Codice figlio</div><div className="num font-black tracking-[0.3em]">K7M-3PX-9QA</div></div>}
      </>
    ),
  },
  2: {
    frames: [
      { caption: "Rose → «Modulo Excel»: scarica il modulo già precompilato con torneo, società e squadra.", stage: 0 },
      { caption: "Compila una riga per giocatore: nome, ruolo, maglia, data di nascita.", stage: 1 },
      { caption: "Carica il file: ogni riga viene controllata subito.", stage: 2 },
      { caption: "Riga rossa = errore (qui maglia 7 doppia): correggi e ricarica.", stage: 3 },
      { caption: "Tutto verde → la Segreteria conferma e la rosa è caricata. Ricevi una notifica.", stage: 4 },
    ],
    render: (f) => (
      <>
        <Title>Rose · Modulo Excel FSL</Title>
        <div className="grid grid-cols-2 gap-1.5">
          <Btn on={f.stage === 0} label={<><Download className="h-4 w-4" /> Scarica</>} tone={f.stage === 0 ? "gold" : "ghost"} />
          <Btn on={f.stage === 2} label={<><Upload className="h-4 w-4" /> Carica</>} tone={f.stage === 2 ? "gold" : "ghost"} />
        </div>
        <div className="rounded-lg border border-white/10 overflow-hidden text-[10px]">
          <div className="grid grid-cols-[1fr_32px_24px] bg-emerald-800/60 px-2 py-1 font-bold"><span className="inline-flex items-center gap-1"><FileSpreadsheet className="h-3 w-3" /> Giocatore</span><span>Ruolo</span><span>N.</span></div>
          {XLS_ROWS.map((r, i) => {
            const visible = f.stage >= 1;
            const checked = f.stage >= 3;
            const fixed = f.stage >= 4;
            const bad = checked && !fixed && r[3] === "err";
            return <div key={r[0]} className={`grid grid-cols-[1fr_32px_24px] px-2 py-1 border-t border-white/5 ${bad ? "bg-fsl-danger/25 text-white" : checked ? "bg-fsl-success/10" : ""}`}><span className="truncate">{visible ? r[0] : <span className="text-white/20">—</span>}</span><span>{visible ? r[1] : ""}</span><span className="num">{visible ? (fixed && r[3] === "err" ? 9 : r[2]) : ""}</span></div>;
          })}
        </div>
        {f.stage === 3 && <div className="text-[10px] text-fsl-danger">Riga 4: numero di maglia 7 già usato</div>}
        {f.stage === 4 && <div className="rounded-lg border border-fsl-success/40 bg-fsl-success/10 px-2 py-2 text-[11px] text-fsl-success inline-flex items-center gap-2"><Check className="h-4 w-4" /> Rosa caricata · 5 giocatori</div>}
      </>
    ),
  },
  3: {
    frames: [
      { caption: "Calendario → apri la prossima gara → «Convocazioni».", upto: 0, deadline: "Chiude domani alle 20:00" },
      { caption: "Tocca il numero di maglia dei convocati (verde).", upto: 2, deadline: "Chiude domani alle 20:00" },
      { caption: "Continua con tutti i convocati…", upto: 5, deadline: "Chiude domani alle 20:00" },
      { caption: "Salva: i genitori ricevono la notifica «è convocato» con orario e campo.", upto: 7, save: true, deadline: "Chiude domani alle 20:00" },
      { caption: "Alle 20:00 del giorno prima le convocazioni si bloccano: l'arbitro completa la distinta in campo.", upto: 7, locked: true, deadline: "Chiusa alle 20:00" },
    ],
    render: (f) => (
      <>
        <Title>Sporting Eur – Appio Latino · Sab 10:30 · Campo 1</Title>
        <div className={`flex items-center justify-between h-8 px-2 rounded-lg text-[10px] font-bold ${f.locked ? "bg-fsl-danger/20 text-fsl-danger" : "bg-fsl-warning/15 text-fsl-warning"}`}><span>{f.locked ? <Lock className="h-3 w-3 inline" /> : "⏱"} Convocazioni</span><span>{f.deadline}</span></div>
        <div className="space-y-1.5">{PLAYERS.map((p, i) => <Row key={p[0]} p={p} pres={{ state: i < f.upto ? "present" : null, tap: !f.locked && i === f.upto }} />)}</div>
        <Btn on={!!f.save} label={f.locked ? <><Lock className="h-4 w-4" /> Bloccate</> : "Salva convocazioni"} tone={f.locked ? "ghost" : f.save ? "gold" : "ghost"} />
        {f.save && !f.locked && <div className="rounded-lg border border-fsl-gold/40 bg-fsl-gold/10 px-2 py-1.5 text-[10px] text-fsl-gold inline-flex items-center gap-2"><Bell className="h-3.5 w-3.5" /> 7 genitori avvisati</div>}
      </>
    ),
  },
  4: {
    frames: [
      { caption: "Profilo → «La mia homepage»: stemma, colori, motto, descrizione, contatti, sede.", stage: 0 },
      { caption: "Salva e invia: le modifiche vanno in approvazione all'organizzazione.", stage: 1 },
      { caption: "Documenti: carica certificati medici e consensi con la data di scadenza.", stage: 2 },
      { caption: "Il sistema ti avvisa 30, 15 e 7 giorni prima della scadenza.", stage: 3 },
      { caption: "Controlla la campanella: approvazioni, scadenze e badge dei tuoi giocatori.", stage: 4 },
    ],
    render: (f) => (
      <>
        <Title>{f.stage < 2 ? "La mia homepage" : f.stage < 4 ? "Documenti società" : "Notifiche"}</Title>
        {f.stage < 2 && <>
          <div className="flex items-center gap-3"><span className="h-12 w-12 rounded-full bg-emerald-700 border-2 border-fsl-gold inline-flex items-center justify-center text-[10px] font-black">SPO</span><div><div className="text-xs font-bold">Sporting Eur</div><div className="text-[10px] text-fsl-slate italic">«Il futuro scende in campo»</div></div></div>
          <Line label="Descrizione" value="Scuola calcio dal 1998…" />
          <Line label="Contatti" value="333 1234567 · info@…" />
          <Line label="Sede" value="Via dello Sport 1, Roma" />
          <Btn on={f.stage === 1} label={f.stage === 1 ? "In approvazione…" : "Salva e invia"} tone={f.stage === 1 ? "ghost" : "gold"} />
        </>}
        {(f.stage === 2 || f.stage === 3) && <>
          <Doc label="Certificato medico · Bianchi" state="ok" />
          <Doc label="Certificato medico · Conti" state={f.stage === 3 ? "warn" : "ok"} />
          <Doc label="Consenso privacy · Ferri" state="none" />
          <Btn on={f.stage === 2} label={<><Upload className="h-4 w-4" /> Carica documento</>} />
          {f.stage === 3 && <div className="text-[10px] text-fsl-warning">Conti: certificato in scadenza tra 15 giorni</div>}
        </>}
        {f.stage === 4 && <div className="space-y-1.5">{[["Homepage approvata", "Le modifiche sono pubbliche"], ["Documento in scadenza", "Certificato Conti · 15 giorni"], ["Badge sbloccato", "Esposito · Prima doppietta"]].map(([t, d]) => <div key={t} className="flex gap-2 px-2 py-1.5 rounded-lg bg-white/[0.04] border border-white/10"><Bell className="h-4 w-4 text-fsl-gold shrink-0" /><div><div className="text-xs font-semibold">{t}</div><div className="text-[10px] text-fsl-slate">{d}</div></div></div>)}</div>}
      </>
    ),
  },
};

export const ClubTutorial = ({ step }) => <TutorialPlayer scene={SCENES[step]} step={step} prefix="club" />;
