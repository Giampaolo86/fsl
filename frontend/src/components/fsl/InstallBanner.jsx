import { useEffect, useState } from "react";
import { Download, Share, Smartphone, X } from "lucide-react";
import { isStandalone } from "@/lib/push";

const KEY = "fsl_install_banner_dismissed";
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;

export function InstallBanner() {
  const [prompt, setPrompt] = useState(null);
  const [hidden, setHidden] = useState(() => isStandalone() || localStorage.getItem(KEY) === "1");
  const [tutorial, setTutorial] = useState(false);
  useEffect(() => {
    const h = (e) => { e.preventDefault(); setPrompt(e); };
    window.addEventListener("beforeinstallprompt", h);
    window.addEventListener("appinstalled", () => setHidden(true));
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);
  if (hidden) return null;
  const dismiss = () => { localStorage.setItem(KEY, "1"); setHidden(true); };
  const install = async () => {
    if (prompt) { prompt.prompt(); const r = await prompt.userChoice; if (r?.outcome === "accepted") setHidden(true); return; }
    setTutorial((v) => !v);
  };
  const ios = isIOS();
  return (
    <div className="bg-fsl-gold text-ink-950" data-testid="install-banner">
      <div className="mx-auto max-w-[1488px] px-3 sm:px-4 py-1.5 sm:py-2 flex flex-wrap items-center gap-x-2 sm:gap-x-3 gap-y-1 text-sm">
        <Smartphone className="h-4 w-4 shrink-0" />
        <span className="font-semibold text-xs sm:text-sm flex-1 min-w-0 truncate sm:flex-none">Salva FSL sul tuo telefono</span>
        <span className="text-xs opacity-80 hidden sm:inline">come un'app: apertura istantanea, notifiche su gare e risultati, funziona anche offline.</span>
        <button className="h-8 px-3 rounded-full bg-ink-950 text-fsl-gold text-xs font-bold inline-flex items-center gap-1.5 hover:bg-navy-800 transition-colors" onClick={install} data-testid="install-banner-cta"><Download className="h-3.5 w-3.5" /> {prompt ? "Installa" : "Come si fa"}</button>
        <button className="sm:ml-auto h-8 w-8 rounded-full hover:bg-ink-950/10 inline-flex items-center justify-center" onClick={dismiss} aria-label="Chiudi" data-testid="install-banner-close"><X className="h-4 w-4" /></button>
        {tutorial && (
          <ol className="basis-full grid sm:grid-cols-3 gap-2 pb-2 pt-1 text-xs" data-testid="install-banner-tutorial">
            {(ios ? [
              ["1", <>Apri questa pagina in <strong>Safari</strong> e tocca <Share className="inline h-3.5 w-3.5 -mt-0.5" /> <strong>Condividi</strong> in basso</>],
              ["2", <>Scorri e scegli <strong>«Aggiungi alla schermata Home»</strong></>],
              ["3", <>Conferma con <strong>Aggiungi</strong>: FSL compare tra le tue app</>],
            ] : [
              ["1", <>Tocca il menu <strong>⋮</strong> del browser (Chrome) in alto a destra</>],
              ["2", <>Scegli <strong>«Installa app»</strong> o <strong>«Aggiungi a schermata Home»</strong></>],
              ["3", <>Conferma: FSL si apre a tutto schermo come un'app e riceve le notifiche</>],
            ]).map(([n, txt]) => <li key={n} className="flex items-start gap-2 rounded-lg bg-ink-950/10 px-3 py-2"><span className="num font-display font-extrabold text-base leading-none">{n}</span><span>{txt}</span></li>)}
          </ol>
        )}
      </div>
    </div>
  );
}
