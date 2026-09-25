import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Newspaper } from "lucide-react";
import { Article, KIND_LABEL, PostCard } from "@/components/fsl/Article";
import { PageHeader, SectionTitle } from "@/components/fsl/Primitives";
import { EmptyState, ErrorState, LoadingState } from "@/components/fsl/States";
import { usePublicTournament } from "@/hooks/usePublicTournament";
import { api, apiError } from "@/lib/api";

const Wrap = ({ children }) => <div className="mx-auto max-w-[1488px] px-6 py-10">{children}</div>;
const KINDS = [["", "Tutto"], ["news", "Notizie"], ["interview", "Interviste"], ["gallery", "Gallery"], ["video", "Video"], ["match_story", "Match story"], ["weekly", "FSL Weekly"], ["badge", "Badge"]];

export function PublicNews() {
  const { slug } = useParams();
  const { data: home } = usePublicTournament();
  const [params, setParams] = useSearchParams();
  const kind = params.get("tipo") || "";
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => api.get(`/public/tournaments/${slug}/posts`, { params: kind ? { kind } : {} }).then((r) => setList(r.data)).catch(setError), [slug, kind]);
  useEffect(() => { setList(null); load(); }, [load]);
  if (error) return <Wrap><ErrorState message={apiError(error)} /></Wrap>;
  if (!list || !home) return <LoadingState full />;
  return (
    <Wrap>
      <PageHeader kicker={home.tournament.name} title="News" subtitle="Notizie, interviste, gallery, video e Match story ufficiali del torneo." />
      <div className="flex flex-wrap gap-1 mb-6" role="tablist">{KINDS.map(([k, l]) => <button key={k} role="tab" aria-selected={kind === k} onClick={() => setParams(k ? { tipo: k } : {})} className={`h-9 px-3 rounded-full text-xs font-semibold uppercase ${kind === k ? "bg-fsl-blue" : "border border-white/15 text-fsl-slate hover:text-fsl-white"}`} data-testid={`news-filter-${k || "all"}`}>{l}</button>)}</div>
      {list.length === 0 ? <EmptyState icon={Newspaper} title="Nessun contenuto pubblicato" description="Le notizie compariranno qui appena pubblicate dalla redazione o dalle società." /> : <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4" data-testid="public-news-grid">{list.map((p) => <PostCard key={p.id} p={p} to={`/tornei/${slug}/news/${p.slug}`} />)}</div>}
    </Wrap>
  );
}

export function PublicPost() {
  const { slug, postSlug } = useParams();
  const [p, setP] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { setP(null); api.get(`/public/tournaments/${slug}/posts/${postSlug}`).then((r) => setP(r.data)).catch(setError); }, [slug, postSlug]);
  if (error) return <Wrap><ErrorState message={apiError(error)} /></Wrap>;
  if (!p) return <LoadingState full />;
  return (
    <Wrap>
      <Link to={`/tornei/${slug}/news`} className="text-xs text-fsl-gold hover:underline" data-testid="post-back">← Tutte le news</Link>
      <div className="mt-4 grid lg:grid-cols-[minmax(0,1fr)_320px] gap-10">
        <Article p={p} />
        <aside className="space-y-4">
          {p.match_id && <Link to={`/tornei/${slug}/partite/${p.match_id}`} className="fsl-card-gold p-4 block hover:border-fsl-gold transition-colors" data-testid="post-match-link"><div className="fsl-kicker mb-1">{KIND_LABEL[p.kind]}</div><div className="font-display font-bold uppercase">Apri il Match Center →</div></Link>}
          {p.clubs?.map((c) => <Link key={c.id} to={`/tornei/${slug}/squadre/${c.slug}`} className="fsl-card p-4 block hover:border-fsl-gold/50 transition-colors"><div className="fsl-kicker mb-1">Società</div><div className="font-semibold">{c.name}</div></Link>)}
          {p.related?.length > 0 && <div><SectionTitle>Altre news</SectionTitle><div className="space-y-3">{p.related.map((r) => <PostCard key={r.id} p={r} to={`/tornei/${slug}/news/${r.slug}`} />)}</div></div>}
        </aside>
      </div>
    </Wrap>
  );
}
