import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Trophy } from "lucide-react";
import { Kicker } from "@/components/fsl/HomeHub";
import { EmptyState, LoadingState } from "@/components/fsl/States";
import { Top11Board } from "@/components/fsl/Top11Board";
import { api } from "@/lib/api";

export default function Top11Public() {
  const { slug } = useParams();
  const [items, setItems] = useState(null);
  const [comp, setComp] = useState("");
  useEffect(() => { api.get(`/public/tournaments/${slug}/top11`).then((r) => setItems(r.data)).catch(() => setItems([])); }, [slug]);
  if (!items) return <LoadingState full />;
  const comps = Array.from(new Map(items.filter((i) => i.competition).map((i) => [i.competition.id, i.competition])).values());
  const shown = items.filter((i) => !comp || i.competition?.id === comp);
  return (
    <section className="mx-auto max-w-[1488px] px-6 py-12" data-testid="public-top11">
      <Kicker className="mb-3">FSL Weekly · Il meglio della giornata</Kicker>
      <div className="flex flex-wrap items-end justify-between gap-4"><h1 className="text-5xl sm:text-6xl font-extrabold leading-[0.9]">Top 11</h1>{comps.length > 1 && <select className="fsl-input h-11 w-64" value={comp} onChange={(e) => setComp(e.target.value)} data-testid="public-top11-filter"><option value="">Tutti i campionati</option>{comps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}</div>
      <p className="mt-3 text-fsl-slate max-w-xl">La formazione ideale di ogni giornata, calcolata solo dai tabellini ufficiali con il fantavoto FSL. I nomi dei bambini compaiono per intero solo con il consenso delle famiglie.</p>
      {shown.length === 0 ? <div className="mt-10"><EmptyState icon={Trophy} title="Nessuna Top 11 pubblicata" description="Le formazioni compaiono dopo l'approvazione del Direttore al termine di ogni giornata." /></div> : (
        <div className="grid lg:grid-cols-2 gap-6 mt-10">{shown.map((d) => <div key={d.id} className="animate-rise" data-testid={`public-top11-${d.competition?.id}-${d.match_day}`}><Top11Board doc={d} competition={d.competition} /></div>)}</div>
      )}
    </section>
  );
}
