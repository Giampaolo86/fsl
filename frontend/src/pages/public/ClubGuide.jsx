import { Bell, CalendarClock, FileSpreadsheet, Smartphone, UserPlus, Globe } from "lucide-react";
import { GuidePage } from "@/components/fsl/GuideKit";
import { ClubTutorial } from "@/components/fsl/ClubTutorial";

const STEPS = [
  { n: 1, icon: UserPlus, title: "La rosa", text: "Da Rose aggiungi i giocatori uno a uno: anagrafica, ruolo, maglia, consenso immagine (solo con il consenso nome e foto sono pubblici) e foto con scontorno automatico. Ogni bambino ha un «Codice figlio» da consegnare ai genitori per seguirlo dall'Area Genitori.", to: "/societa/rose", toLabel: "Vai alle Rose" },
  { n: 2, icon: FileSpreadsheet, title: "Il modulo Excel", text: "Per caricare tutta la squadra in una volta: scarica il modulo FSL precompilato, compila una riga per giocatore e caricalo. Le righe con errori (maglia doppia, data mancante) si colorano di rosso; quando è tutto corretto la Segreteria conferma e la rosa viene caricata.", to: "/societa/rose", toLabel: "Scarica il modulo" },
  { n: 3, icon: CalendarClock, title: "Le convocazioni", text: "Dal Calendario apri la gara e tocca i numeri dei convocati; al salvataggio i genitori ricevono la notifica con orario e campo. Le convocazioni si chiudono alle 20:00 del giorno prima della gara: dopo, solo l'arbitro può completare la distinta in campo.", to: "/societa/calendario", toLabel: "Vai al Calendario" },
  { n: 4, icon: Globe, title: "Homepage e documenti", text: "Racconta la società in «La mia homepage» (stemma, colori, motto, descrizione, contatti, sede): le modifiche vengono approvate dall'organizzazione. In Documenti carica certificati medici e consensi con la scadenza: ti avvisiamo 30, 15 e 7 giorni prima. Le notifiche arrivano nella campanella.", to: "/societa/profilo", toLabel: "Apri la mia homepage" },
];
const TIPS = [
  [Bell, "Le notifiche (approvazioni, scadenze, badge dei tuoi giocatori) sono nella campanella in alto; attiva le notifiche push dal tuo profilo per riceverle anche a telefono chiuso."],
  [Smartphone, "Aggiungi l'app alla schermata Home di iPhone o Android (Condividi → Aggiungi a Home): convocazioni e rose sempre a portata di mano."],
];

export default function ClubGuide({ embedded = false }) {
  return <GuidePage kind="club" kicker="Area Società · Guida" title="Guida Società" intro="Rose, modulo Excel, convocazioni, homepage e documenti: tutto quello che serve al Responsabile Società, in quattro passaggi con demo animate." steps={STEPS} Tutorial={ClubTutorial} shareTitle="Guida Società FSL" sharePath="/guida-societa" loginTo="/login?area=societa" loginLabel="Accedi all'Area Società" tips={TIPS} embedded={embedded} testId="club-guide" />;
}
