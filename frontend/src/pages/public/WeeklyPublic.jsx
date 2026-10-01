import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Newspaper } from "lucide-react";
import { Kicker } from "@/components/fsl/HomeHub";
import { EmptyState, ErrorState, LoadingState } from "@/components/fsl/States";
import { WeeklyIssue } from "@/components/fsl/WeeklyIssue";
import { api, apiError } from "@/lib/api";
import { fmtDate } from "@/lib/format";

export function WeeklyList() {
  const { slug } = useParams();
  const [items, setItems] = useState(null);
  const [comp, setComp] = useState("");
  useEffect(() => { api.get(`/public/tournaments/${slug}/weekly`).then((r) => setItems(r.data)).catch(() => setItems([])); }, [slug]);
  if (!items) return <LoadingState full />;
  const comps = Array.from(new Map(items.filter((i) => i.competition).map((i) => [i.competition.id, i.competition])).values());
  const shown = items.filter((i) => !comp || i.competition?.id === comp);
  const [first, ...rest] = shown;
  return (
    <section className="mx-auto max-w-[1488px] px-6 py-12 gold-skin" data-testid="public-weekly">
      <Kicker className="mb-3">Il giornale della giornata</Kicker>
      <div className="flex flex-wrap items-end justify-between gap-4"><h1 className="text-5xl sm:text-6xl font-extrabold leading-[0.9] uppercase">FSL <span className="text-fsl-gold">Weekly</span></h1>{comps.length > 1 && <select className="fsl-input h-11 w-64" value={comp} onChange={(e) => setComp(e.target.value)} data-testid="public-weekly-filter"><option value="">Tutti i campionati</option>{comps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}</div>
      <p className="mt-3 text-fsl-slate max-w-xl">Risultati, classifica, MVP, Top 11 e anteprima del turno: ogni giornata raccontata dai dati ufficiali e approvata dal Direttore.</p>
      {shown.length === 0 ? <div className="mt-10"><EmptyState icon={Newspaper} title="Nessun numero pubblicato" description="Il primo FSL Weekly arriva dopo la prima giornata ufficiale." /></div> : (
        <div className="mt-10 grid lg:grid-cols-[1.4fr_1fr] gap-6">
          <Link to={`/tornei/${slug}/weekly/${first.id}`} className="group relative overflow-hidden rounded-3xl border border-fsl-gold/30 bg-navy-800 p-8 min-h-[320px] flex flex-col justify-end animate-rise" data-testid={`public-weekly-${first.id}`}>
            <div className="absolute inset-0 grain opacity-40" /><div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-fsl-gold/20 blur-3xl group-hover:scale-125 transition-transform duration-700" />
            <div className="relative"><Kicker>Ultimo numero · {first.competition?.name} · Giornata {first.match_day}</Kicker><h2 className="mt-2 text-3xl sm:text-5xl font-extrabold uppercase leading-[0.9]">{first.editorial?.title}</h2><p className="mt-3 text-sm sm:text-base text-fsl-white/85 line-clamp-3">{first.editorial?.intro}</p><div className="mt-4 text-xs text-fsl-slate num">{fmtDate(first.published_at)} · {first.content?.goals ?? 0} gol{first.content?.mvp ? ` · MVP ${first.content.mvp.name}` : ""}</div></div>
          </Link>
          <div className="space-y-3">{rest.map((it, i) => <Link key={it.id} to={`/tornei/${slug}/weekly/${it.id}`} className="fsl-card p-5 block hover:border-fsl-gold/50 transition-colors animate-rise" style={{ animationDelay: `${i * 60}ms` }} data-testid={`public-weekly-${it.id}`}><div className="text-[10px] uppercase tracking-wider text-fsl-gold">{it.competition?.name} · Giornata {it.match_day}</div><div className="mt-1 font-display font-extrabold uppercase text-xl leading-tight">{it.editorial?.title}</div><p className="mt-1 text-xs text-fsl-slate line-clamp-2">{it.editorial?.intro}</p></Link>)}{rest.length === 0 && <p className="text-sm text-fsl-slate p-4">Gli altri numeri compariranno qui.</p>}</div>
        </div>
      )}
    </section>
  );
}

export function WeeklyDetail() {
  const { slug, issueId } = useParams();
  const [issue, setIssue] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { api.get(`/public/tournaments/${slug}/weekly/${issueId}`).then((r) => setIssue(r.data)).catch(setErr); }, [slug, issueId]);
  if (err) return <div className="p-10"><ErrorState message={apiError(err)} /></div>;
  if (!issue) return <LoadingState full />;
  return (
    <section className="mx-auto max-w-[1200px] px-6 py-10" data-testid="public-weekly-detail">
      <Link to={`/tornei/${slug}/weekly`} className="inline-flex items-center gap-1 text-xs text-fsl-slate hover:text-fsl-white mb-6" data-testid="weekly-back"><ArrowLeft className="h-3.5 w-3.5" /> Tutti i numeri</Link>
      <WeeklyIssue issue={issue} slug={slug} />
    </section>
  );
}
