import { useState } from "react";
import { Grid3X3, MapPin, Plus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionTitle } from "@/components/fsl/Primitives";
import { ErrorState, LoadingState } from "@/components/fsl/States";
import { useScoped, useTournamentDetail } from "@/hooks/useTournamentData";
import { api, apiError } from "@/lib/api";

export default function Venues() {
  const { data: t } = useTournamentDetail();
  const { data, error, loading, reload } = useScoped("venues");
  const [name, setName] = useState("");
  if (loading || !t) return <LoadingState />;
  if (error) return <ErrorState message={apiError(error)} onRetry={reload} />;
  const canWrite = ["super_admin", "director"].includes(t.my_role) && !t.read_only;

  const addField = async () => {
    try {
      await api.post(`/tournaments/${t.id}/fields`, { name: name || `Campo ${data.fields.length + 1}`, venue_id: data.venues[0]?.id });
      toast.success("Campo aggiunto");
      setName("");
      reload();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader kicker="Campi, sedi e disponibilità" title="Campi" subtitle={`${data.fields.length} campi configurati in ${data.venues.length} sedi.`} />
      <section>
        <SectionTitle>Sedi</SectionTitle>
        <div className="grid md:grid-cols-2 gap-4">
          {data.venues.map((v) => (
            <div key={v.id} className="fsl-card p-5" data-testid={`venue-card-${v.id}`}>
              <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-fsl-gold" aria-hidden="true" /><span className="font-semibold">{v.name}</span></div>
              <p className="text-sm text-fsl-slate mt-1">{[v.address, v.city].filter(Boolean).join(", ") || "Indirizzo da completare"}</p>
              {v.services?.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{v.services.map((s) => <span key={s} className="text-[11px] px-2 h-6 inline-flex items-center rounded-full border border-white/15 text-fsl-slate">{s}</span>)}</div>}
            </div>
          ))}
        </div>
      </section>
      <section>
        <SectionTitle right={canWrite && (
          <div className="flex gap-2">
            <input className="fsl-input h-9 w-40" placeholder="Nome campo" value={name} onChange={(e) => setName(e.target.value)} data-testid="field-name-input" />
            <button className="btn-primary h-9" onClick={addField} data-testid="field-add-button"><Plus className="h-4 w-4" /> Aggiungi</button>
          </div>
        )}>Campi</SectionTitle>
        <div className="fsl-card overflow-x-auto">
          <table className="w-full table-dark" data-testid="fields-table">
            <thead><tr><th>Codice</th><th>Nome</th><th>Sede</th><th>Formato</th><th>Superficie</th><th>Stato</th></tr></thead>
            <tbody>
              {data.fields.map((f) => (
                <tr key={f.id} data-testid={`field-row-${f.code}`}>
                  <td className="num font-semibold">{f.code}</td>
                  <td>{f.name}</td>
                  <td className="text-fsl-slate">{data.venues.find((v) => v.id === f.venue_id)?.name || "—"}</td>
                  <td className="num">Calcio a {f.size}</td>
                  <td className="text-fsl-slate">{f.surface}</td>
                  <td><span className="inline-flex items-center gap-1.5 text-xs text-fsl-success"><Grid3X3 className="h-3.5 w-3.5" /> Attivo</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
