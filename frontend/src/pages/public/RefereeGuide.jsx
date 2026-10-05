import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, ClipboardList, Film, ListChecks, Share2, ShieldAlert, Smartphone, Trash2, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { RefereeTutorial } from "@/components/fsl/RefereeTutorial";
import { GoldPill } from "@/components/fsl/ProfileKit";
import { useAuth } from "@/context/AuthContext";
import { api, apiError } from "@/lib/api";

const STEPS = [
  { n: 1, icon: ListChecks, title: "Prepara la distinta", text: "Prima del fischio d'inizio tocca il numero dei giocatori presenti per ciascuna squadra e salva le distinte. Le società possono averle già preparate: verifica e correggi. Le convocazioni delle società si chiudono alle 20:00 del giorno prima." },
  { n: 2, icon: ClipboardList, title: "Compila la gara", text: "Durante o dopo la gara passa a «Compila gara»: tocca il logo per «tutti presenti», il numero per presente/assente/da confermare; usa + e − per gol, assist, ammonizioni, espulsioni e voto. Il punteggio si calcola dal tabellino. L'MVP è obbligatorio." },
  { n: 3, icon: ShieldAlert, title: "Checklist e note", text: "Spunta squadre presenti, distinte verificate e firme acquisite. Scrivi eventuali note (infortuni, comportamento, ritardi). Nelle finali con parità inserisci i rigori." },
  { n: 4, icon: CheckCircle2, title: "Invia il referto", text: "«Chiudi gara e invia» rende il referto definitivo: classifiche, marcatori e badge si aggiornano solo con i risultati ufficiali. Per correzioni successive contatta il Direttore (rettifica)." },
];

function VideoSlot({ step, video, canEdit, onChange }) {
  const [url, setUrl] = useState(video?.url || "");
  const [title, setTitle] = useState(video?.title || "");
  useEffect(() => { setUrl(video?.url || ""); setTitle(video?.title || ""); }, [video]);
  const save = (clear = false) => api.put("/referee-guide/video", { step: String(step), url: clear ? null : url.trim() || null, title }).then(({ data }) => { onChange(data.videos); toast.success(clear ? "Video rimosso" : "Video salvato"); }).catch((e) => toast.error(apiError(e)));
  const isFile = video && /\.(mp4|webm|mov)(\?|$)/i.test(video.embed_url || video.url);
  return (
    <div className="space-y-2" data-testid={`referee-video-slot-${step}`}>
      {video ? (
        <div className="rounded-xl overflow-hidden border border-white/10 bg-black aspect-video">
          {isFile ? <video src={video.embed_url || video.url} controls playsInline className="w-full h-full" data-testid={`referee-video-${step}`} /> : <iframe src={video.embed_url} title={video.title || `Video passo ${step}`} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen data-testid={`referee-video-${step}`} />}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-white/20 aspect-video flex flex-col items-center justify-center gap-2 text-fsl-slate text-xs" data-testid={`referee-video-placeholder-${step}`}><Film className="h-6 w-6 text-fsl-gold/70" /> Video in arrivo · intanto guarda la demo animata</div>
      )}
      {video?.title && <div className="text-xs text-fsl-slate">{video.title}</div>}
      {canEdit && (
        <div className="flex flex-wrap gap-2 items-center rounded-lg bg-navy-700/40 border border-white/10 p-2">
          <input className="fsl-input h-9 flex-1 min-w-[180px] text-xs" placeholder="Link YouTube, Vimeo o MP4" value={url} onChange={(e) => setUrl(e.target.value)} data-testid={`referee-video-url-${step}`} />
          <input className="fsl-input h-9 w-40 text-xs" placeholder="Titolo (opz.)" value={title} onChange={(e) => setTitle(e.target.value)} data-testid={`referee-video-title-${step}`} />
          <button type="button" className="btn-gold h-9 px-3 text-xs" onClick={() => save(false)} disabled={!url.trim()} data-testid={`referee-video-save-${step}`}>Salva video</button>
          {video && <button type="button" className="btn-ghost h-9 px-2 text-xs text-fsl-danger" onClick={() => save(true)} aria-label="Rimuovi video" data-testid={`referee-video-remove-${step}`}><Trash2 className="h-3.5 w-3.5" /></button>}
        </div>
      )}
    </div>
  );
}

export default function RefereeGuide({ embedded = false }) {
  const { user } = useAuth();
  const [videos, setVideos] = useState({});
  useEffect(() => { api.get("/public/referee-guide").then(({ data }) => setVideos(data.videos || {})).catch(() => {}); }, []);
  const canEdit = !!user?.is_super_admin && !user?.impersonation;
  const share = async () => {
    const url = `${window.location.origin}/guida-arbitri`;
    try { if (navigator.share) await navigator.share({ title: "Guida Arbitri FSL", text: "Come compilare il tabellino FSL dal telefono", url }); else { await navigator.clipboard.writeText(url); toast.success("Link copiato"); } } catch { /* annullato */ }
  };
  return (
    <div className={embedded ? "space-y-6" : "bg-ink-950 min-h-screen"} data-testid="referee-guide">
      <div className={embedded ? "" : "mx-auto max-w-[1100px] px-6 pt-10 pb-6"}>
        {!embedded && <GoldPill>Area Arbitro · Guida</GoldPill>}
        <div className="flex flex-wrap items-end justify-between gap-3 mt-3">
          <div>
            <h1 className={`font-display font-extrabold uppercase leading-none ${embedded ? "text-3xl" : "text-4xl sm:text-5xl lg:text-6xl"}`}>Guida Arbitri</h1>
            <p className="mt-2 text-sm md:text-base text-fsl-slate max-w-2xl">Come compilare il tabellino FSL dal telefono, in quattro passaggi. Ogni passo ha una demo animata: guardala, poi fallo sul campo.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={share} className="btn-ghost h-10" data-testid="referee-guide-share"><Share2 className="h-4 w-4" /> Condividi agli arbitri</button>
            {!embedded && !user && <Link to="/login?area=arbitri" className="btn-gold h-10" data-testid="referee-guide-login">Accedi all'Area Arbitro</Link>}
          </div>
        </div>
      </div>
      <div className={embedded ? "space-y-6" : "mx-auto max-w-[1100px] px-6 pb-16 space-y-8"}>
        {STEPS.map((s) => (
          <section key={s.n} className="fsl-card p-4 md:p-6 grid lg:grid-cols-[1fr_320px] gap-6 items-start" data-testid={`referee-guide-step-${s.n}`}>
            <div className="space-y-4 min-w-0">
              <div className="flex items-start gap-3"><span className="h-10 w-10 rounded-full bg-fsl-gold text-ink-950 font-display font-black text-xl inline-flex items-center justify-center shrink-0 num">{s.n}</span><div><h2 className="font-display font-bold uppercase text-base md:text-lg flex items-center gap-2"><s.icon className="h-5 w-5 text-fsl-gold" /> {s.title}</h2><p className="text-sm text-fsl-slate mt-1">{s.text}</p></div></div>
              <VideoSlot step={s.n} video={videos[String(s.n)]} canEdit={canEdit} onChange={setVideos} />
            </div>
            <RefereeTutorial step={s.n} />
          </section>
        ))}
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="rounded-xl bg-navy-700/50 border border-white/10 p-4 text-sm text-fsl-slate flex gap-3"><WifiOff className="h-5 w-5 text-fsl-gold shrink-0" /><span>Se manca la connessione compare un avviso: salva di nuovo appena torna la rete. Nulla va perso finché non chiudi la pagina.</span></div>
          <div className="rounded-xl bg-navy-700/50 border border-white/10 p-4 text-sm text-fsl-slate flex gap-3"><Smartphone className="h-5 w-5 text-fsl-gold shrink-0" /><span>Aggiungi l'app alla schermata Home di iPhone o Android (Condividi → Aggiungi a Home) per un accesso rapido a bordo campo.</span></div>
        </div>
      </div>
    </div>
  );
}
