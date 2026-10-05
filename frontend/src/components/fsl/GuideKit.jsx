import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Film, Share2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { GoldPill } from "@/components/fsl/ProfileKit";
import { useAuth } from "@/context/AuthContext";
import { api, apiError } from "@/lib/api";

export function VideoSlot({ kind, step, video, canEdit, onChange }) {
  const [url, setUrl] = useState(video?.url || "");
  const [title, setTitle] = useState(video?.title || "");
  useEffect(() => { setUrl(video?.url || ""); setTitle(video?.title || ""); }, [video]);
  const save = (clear = false) => api.put(`/guides/${kind}/video`, { step: String(step), url: clear ? null : url.trim() || null, title }).then(({ data }) => { onChange(data.videos); toast.success(clear ? "Video rimosso" : "Video salvato"); }).catch((e) => toast.error(apiError(e)));
  const isFile = video && /\.(mp4|webm|mov)(\?|$)/i.test(video.embed_url || video.url);
  const tid = (s) => `${kind}-video-${s}-${step}`;
  return (
    <div className="space-y-2" data-testid={tid("slot")}>
      {video ? (
        <div className="rounded-xl overflow-hidden border border-white/10 bg-black aspect-video">
          {isFile ? <video src={video.embed_url || video.url} controls playsInline className="w-full h-full" data-testid={tid("player")} /> : <iframe src={video.embed_url} title={video.title || `Video passo ${step}`} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen data-testid={tid("player")} />}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-white/20 aspect-video flex flex-col items-center justify-center gap-2 text-fsl-slate text-xs" data-testid={tid("placeholder")}><Film className="h-6 w-6 text-fsl-gold/70" /> Video in arrivo · intanto guarda la demo animata</div>
      )}
      {video?.title && <div className="text-xs text-fsl-slate">{video.title}</div>}
      {canEdit && (
        <div className="flex flex-wrap gap-2 items-center rounded-lg bg-navy-700/40 border border-white/10 p-2">
          <input className="fsl-input h-9 flex-1 min-w-[180px] text-xs" placeholder="Link YouTube, Vimeo o MP4" value={url} onChange={(e) => setUrl(e.target.value)} data-testid={tid("url")} />
          <input className="fsl-input h-9 w-40 text-xs" placeholder="Titolo (opz.)" value={title} onChange={(e) => setTitle(e.target.value)} data-testid={tid("title")} />
          <button type="button" className="btn-gold h-9 px-3 text-xs" onClick={() => save(false)} disabled={!url.trim()} data-testid={tid("save")}>Salva video</button>
          {video && <button type="button" className="btn-ghost h-9 px-2 text-xs text-fsl-danger" onClick={() => save(true)} aria-label="Rimuovi video" data-testid={tid("remove")}><Trash2 className="h-3.5 w-3.5" /></button>}
        </div>
      )}
    </div>
  );
}

export function GuidePage({ kind, kicker, title, intro, steps, Tutorial, shareTitle, sharePath, loginTo, loginLabel, tips, embedded = false, testId }) {
  const { user } = useAuth();
  const [videos, setVideos] = useState({});
  useEffect(() => { api.get(`/public/guides/${kind}`).then(({ data }) => setVideos(data.videos || {})).catch(() => {}); }, [kind]);
  const canEdit = !!user?.is_super_admin && !user?.impersonation;
  const share = async () => {
    const url = `${window.location.origin}${sharePath}`;
    try { if (navigator.share) await navigator.share({ title: shareTitle, text: intro, url }); else { await navigator.clipboard.writeText(url); toast.success("Link copiato"); } } catch { /* annullato */ }
  };
  return (
    <div className={embedded ? "space-y-6" : "bg-ink-950 min-h-screen"} data-testid={testId}>
      <div className={embedded ? "" : "mx-auto max-w-[1100px] px-6 pt-10 pb-6"}>
        {!embedded && <GoldPill>{kicker}</GoldPill>}
        <div className="flex flex-wrap items-end justify-between gap-3 mt-3">
          <div>
            <h1 className={`font-display font-extrabold uppercase leading-none ${embedded ? "text-3xl" : "text-4xl sm:text-5xl lg:text-6xl"}`}>{title}</h1>
            <p className="mt-2 text-sm md:text-base text-fsl-slate max-w-2xl">{intro}</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={share} className="btn-ghost h-10" data-testid={`${testId}-share`}><Share2 className="h-4 w-4" /> Condividi</button>
            {!embedded && !user && <Link to={loginTo} className="btn-gold h-10" data-testid={`${testId}-login`}>{loginLabel}</Link>}
          </div>
        </div>
      </div>
      <div className={embedded ? "space-y-6" : "mx-auto max-w-[1100px] px-6 pb-16 space-y-8"}>
        {steps.map((s) => (
          <section key={s.n} className="fsl-card p-4 md:p-6 grid lg:grid-cols-[1fr_320px] gap-6 items-start" data-testid={`${testId}-step-${s.n}`}>
            <div className="space-y-4 min-w-0">
              <div className="flex items-start gap-3"><span className="h-10 w-10 rounded-full bg-fsl-gold text-ink-950 font-display font-black text-xl inline-flex items-center justify-center shrink-0 num">{s.n}</span><div><h2 className="font-display font-bold uppercase text-base md:text-lg flex items-center gap-2"><s.icon className="h-5 w-5 text-fsl-gold" /> {s.title}</h2><p className="text-sm text-fsl-slate mt-1">{s.text}</p>{s.to && user && <Link to={s.to} className="inline-flex mt-2 text-xs text-fsl-gold hover:underline" data-testid={`${testId}-goto-${s.n}`}>{s.toLabel} →</Link>}</div></div>
              <VideoSlot kind={kind} step={s.n} video={videos[String(s.n)]} canEdit={canEdit} onChange={setVideos} />
            </div>
            <Tutorial step={s.n} />
          </section>
        ))}
        {tips?.length > 0 && <div className="grid sm:grid-cols-2 gap-3">{tips.map(([Icon, text]) => <div key={text} className="rounded-xl bg-navy-700/50 border border-white/10 p-4 text-sm text-fsl-slate flex gap-3"><Icon className="h-5 w-5 text-fsl-gold shrink-0" /><span>{text}</span></div>)}</div>}
      </div>
    </div>
  );
}
