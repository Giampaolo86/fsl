import { Baby, Bell, Heart, ShieldCheck, ShoppingBag, Smartphone, UserPlus } from "lucide-react";
import { GuidePage } from "@/components/fsl/GuideKit";
import { ParentTutorial } from "@/components/fsl/ParentTutorial";

const STEPS = [
  { n: 1, icon: UserPlus, title: "Registrati e accedi", text: "Crea il tuo account gratuito con nome, email e password dall'area «Genitori e tifosi» (nessun account Google necessario). Accetti l'informativa privacy: i dati dei bambini sono visibili solo con il consenso della società e della famiglia.", to: "/registrati", toLabel: "Registrati ora" },
  { n: 2, icon: Baby, title: "Codice figlio e scheda del bambino", text: "La società ti consegna il «Codice figlio»: inseriscilo in «Collega mio figlio» e vedrai la sua scheda con gare, statistiche e badge. Puoi compilare il profilo «Mi presento» e proporre una foto, che la società approva prima della pubblicazione.", to: "/account", toLabel: "Vai all'Area Genitori" },
  { n: 3, icon: Heart, title: "Preferiti, feed e notifiche", text: "Tocca il cuore su tornei, società e giocatori per seguirli: nell'Area Genitori trovi il feed con prossime gare, risultati e Top 11. La campanella raccoglie convocazioni, risultati e badge; attiva le notifiche push per riceverle anche a telefono chiuso.", to: "/account", toLabel: "I miei preferiti" },
  { n: 4, icon: ShoppingBag, title: "Foto, video e Card Player ID", text: "Nel Match Center di ogni gara trovi foto e video ufficiali e la Card Player ID di tuo figlio (figurina digitale). Aggiungi al carrello, paga in sicurezza con carta e ritrova tutto in «I miei acquisti», scaricabile quando vuoi.", to: "/account", toLabel: "I miei acquisti" },
];
const TIPS = [
  [ShieldCheck, "Privacy prima di tutto: nome completo e foto di un bambino compaiono solo se la società ha registrato il consenso della famiglia. Senza consenso vedrai solo iniziali e numero."],
  [Smartphone, "Aggiungi FSL alla schermata Home del telefono (Condividi → Aggiungi a Home): risultati, convocazioni e foto sempre a portata di mano."],
  [Bell, "Hai trovato un errore in un tabellino? Dal Match Center puoi inviare una segnalazione: la Segreteria la verifica e ti risponde nell'Area Genitori."],
];

export default function ParentGuide({ embedded = false }) {
  return <GuidePage kind="parent" kicker="Genitori e tifosi · Guida" title="Guida Genitori" intro="Codice figlio, preferiti, notifiche e acquisti: come seguire il tuo campione in quattro passaggi, con demo animate." steps={STEPS} Tutorial={ParentTutorial} shareTitle="Guida Genitori FSL" sharePath="/guida-genitori" loginTo="/registrati" loginLabel="Registrati gratis" tips={TIPS} embedded={embedded} testId="parent-guide" />;
}
