import { Construction } from "lucide-react";
import { PageHeader } from "@/components/fsl/Primitives";
import { EmptyState } from "@/components/fsl/States";

const MODULES = {
  comunicazioni: { title: "Contatti e comunicazioni", kicker: "In arrivo", desc: "Invio di email e messaggi a società, arbitri e genitori (inviti, credenziali, ricevute, promemoria). Il provider email non è ancora configurato: oggi le comunicazioni avvengono con le notifiche in-app." },
};

export default function ModulePlaceholder({ module }) {
  const m = MODULES[module];
  return (
    <div>
      <PageHeader kicker={m.kicker} title={m.title} />
      <EmptyState icon={Construction} title="Modulo non ancora attivo" description={m.desc} testId={`module-placeholder-${module}`} />
    </div>
  );
}
