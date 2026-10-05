import { CheckCircle2, ClipboardList, ListChecks, ShieldAlert, Smartphone, WifiOff } from "lucide-react";
import { GuidePage } from "@/components/fsl/GuideKit";
import { RefereeTutorial } from "@/components/fsl/RefereeTutorial";

const STEPS = [
  { n: 1, icon: ListChecks, title: "Prepara la distinta", text: "Prima del fischio d'inizio tocca il numero dei giocatori presenti per ciascuna squadra e salva le distinte. Le società possono averle già preparate: verifica e correggi. Le convocazioni delle società si chiudono alle 20:00 del giorno prima." },
  { n: 2, icon: ClipboardList, title: "Compila la gara", text: "Durante o dopo la gara passa a «Compila gara»: tocca il logo per «tutti presenti», il numero per presente/assente/da confermare; usa + e − per gol, assist, ammonizioni, espulsioni e voto. Il punteggio si calcola dal tabellino. L'MVP è obbligatorio." },
  { n: 3, icon: ShieldAlert, title: "Checklist e note", text: "Spunta squadre presenti, distinte verificate e firme acquisite. Scrivi eventuali note (infortuni, comportamento, ritardi). Nelle finali con parità inserisci i rigori." },
  { n: 4, icon: CheckCircle2, title: "Invia il referto", text: "«Chiudi gara e invia» rende il referto definitivo: classifiche, marcatori e badge si aggiornano solo con i risultati ufficiali. Per correzioni successive contatta il Direttore (rettifica)." },
];
const TIPS = [
  [WifiOff, "Se manca la connessione compare un avviso: salva di nuovo appena torna la rete. Nulla va perso finché non chiudi la pagina."],
  [Smartphone, "Aggiungi l'app alla schermata Home di iPhone o Android (Condividi → Aggiungi a Home) per un accesso rapido a bordo campo."],
];

export default function RefereeGuide({ embedded = false }) {
  return <GuidePage kind="referee" kicker="Area Arbitro · Guida" title="Guida Arbitri" intro="Come compilare il tabellino FSL dal telefono, in quattro passaggi. Ogni passo ha una demo animata: guardala, poi fallo sul campo." steps={STEPS} Tutorial={RefereeTutorial} shareTitle="Guida Arbitri FSL" sharePath="/guida-arbitri" loginTo="/login?area=arbitri" loginLabel="Accedi all'Area Arbitro" tips={TIPS} embedded={embedded} testId="referee-guide" />;
}
