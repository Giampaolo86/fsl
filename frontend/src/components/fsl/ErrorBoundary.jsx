import React from "react";
import { RefreshCw } from "lucide-react";

export class ErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    const stale = /ChunkLoadError|Loading chunk|dynamically imported module|Unexpected token '<'/.test(String(error?.message || error));
    if (stale && !sessionStorage.getItem("fsl-reloaded")) {
      sessionStorage.setItem("fsl-reloaded", "1");
      window.location.reload();
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
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
