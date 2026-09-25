import React from "react";
import { RefreshCw } from "lucide-react";

export class ErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  static isStale(error) {
    return /ChunkLoadError|Loading chunk|Loading CSS chunk|dynamically imported module|Unexpected token '<'|Importing a module script failed/.test(String(error?.message || error));
  }

  async componentDidCatch(error) {
    if (ErrorBoundary.isStale(error) && !sessionStorage.getItem("fsl-reloaded")) {
      sessionStorage.setItem("fsl-reloaded", "1");
      try { const keys = await caches.keys(); await Promise.all(keys.map((k) => caches.delete(k))); } catch { /* no cache API */ }
      try { const regs = await navigator.serviceWorker?.getRegistrations?.(); await Promise.all((regs || []).map((r) => r.update())); } catch { /* no sw */ }
      window.location.reload();
    } else if (!ErrorBoundary.isStale(error)) {
      sessionStorage.removeItem("fsl-reloaded");
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    if (ErrorBoundary.isStale(this.state.error) && !sessionStorage.getItem("fsl-reloaded")) {
      return <div className="min-h-screen bg-navy-900 text-fsl-white flex items-center justify-center p-6" data-testid="app-updating"><div className="text-center"><RefreshCw className="h-8 w-8 mx-auto text-fsl-gold animate-spin" /><div className="mt-4 font-display font-extrabold uppercase text-xl">Aggiornamento in corso…</div><p className="mt-1 text-sm text-fsl-slate">Stiamo caricando la nuova versione dell'app.</p></div></div>;
    }
    return (
      <div className="min-h-screen bg-navy-900 text-fsl-white flex items-center justify-center p-6" data-testid="app-error-boundary">
        <div className="fsl-card p-8 max-w-md text-center">
          <div className="font-display font-extrabold uppercase text-3xl">Qualcosa è andato storto</div>
          <p className="mt-3 text-sm text-fsl-slate">La pagina non è riuscita a caricarsi correttamente. Ricarica per riprovare.</p>
          <button type="button" className="btn-gold h-11 px-6 mt-6" onClick={() => { sessionStorage.removeItem("fsl-reloaded"); window.location.reload(); }} data-testid="app-error-reload"><RefreshCw className="h-4 w-4" /> Ricarica</button>
        </div>
      </div>
    );
  }
}
