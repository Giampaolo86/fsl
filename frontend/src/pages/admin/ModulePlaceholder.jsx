import { Construction } from "lucide-react";
import { PageHeader } from "@/components/fsl/Primitives";
import { EmptyState } from "@/components/fsl/States";

const MODULES = {
  calendario: { title: "Calendario", phase: "Fase 3", desc: "Disponibilità campi, blackout, generatore bozza con conflitti e punteggio di qualità, drag-and-drop, versioni e pubblicazione. Usa il numero di campi e gli slot configurati nel torneo." },
  partite: { title: "Partite", phase: "Fase 4", desc: "Elenco gare, stati (draft → official/rectified), assegnazioni arbitri e recuperi." },
  referti: { title: "Referti e risultati", phase: "Fase 4", desc: "Referti arbitrali, ufficializzazione e rettifica (solo Direttore), disciplina e storico prima/dopo." },
  classifiche: { title: "Classifiche e statistiche", phase: "Fase 4", desc: "Ricalcolo idempotente da soli risultati ufficiali, snapshot versionati, zone playoff/playout/promozione/retrocessione." },
  pagamenti: { title: "Pagamenti e ricevute", phase: "Fase 5", desc: "Quote, scadenze, bonifici, riconciliazione e ricevute con allegati protetti." },
  comunicazioni: { title: "Contatti e comunicazioni", phase: "Fase 5", desc: "Rubrica organizzazione, template, invii e solleciti con stato e tentativi." },
  ticket: { title: "Ticket e segnalazioni", phase: "Fase 5", desc: "Segnalazioni collegate a gara, pagamento, giocatore o documento con stati In revisione / Rettificato / Respinto." },
  media: { title: "Media, news e sponsor", phase: "Fase 6", desc: "News, gallerie, sponsor e approvazione dei materiali visivi caricati dalle società." },
};

export default function ModulePlaceholder({ module }) {
  const m = MODULES[module];
  return (
    <div>
      <PageHeader kicker={m.phase} title={m.title} />
      <EmptyState icon={Construction} title={`Modulo previsto in ${m.phase}`} description={m.desc} testId={`module-placeholder-${module}`} />
    </div>
  );
}
