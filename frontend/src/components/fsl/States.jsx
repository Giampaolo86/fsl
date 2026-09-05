import { AlertTriangle, Inbox, Loader2, Lock, WifiOff } from "lucide-react";
import { Link } from "react-router-dom";

export function LoadingState({ label = "Caricamento…", full = false }) {
  return (
    <div className={`flex items-center justify-center gap-3 text-fsl-slate ${full ? "min-h-screen" : "py-16"}`} role="status" data-testid="loading-state">
      <Loader2 className="h-5 w-5 animate-spin text-fsl-blue-light" aria-hidden="true" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, description, action, testId = "empty-state" }) {
  return (
    <div className="fsl-card flex flex-col items-center text-center px-6 py-14" data-testid={testId}>
      <div className="h-14 w-14 rounded-full border border-fsl-gold/30 bg-ink-950/60 flex items-center justify-center mb-4">
        <Icon className="h-6 w-6 text-fsl-gold" aria-hidden="true" />
      </div>
      <h3 className="fsl-section-title">{title}</h3>
      {description && <p className="mt-2 max-w-md text-sm text-fsl-slate">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function ErrorState({ message = "Impossibile caricare i dati.", onRetry }) {
  return (
    <div className="fsl-card border-fsl-danger/40 px-6 py-10 text-center" role="alert" data-testid="error-state">
      <AlertTriangle className="mx-auto h-8 w-8 text-fsl-danger" aria-hidden="true" />
      <p className="mt-3 text-sm text-fsl-white">{message}</p>
      {onRetry && (
        <button className="btn-ghost mt-5" onClick={onRetry} data-testid="error-retry-button">
          Riprova
        </button>
      )}
    </div>
  );
}

export function PermissionDenied() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="fsl-card max-w-md w-full px-8 py-12 text-center" data-testid="permission-denied">
        <Lock className="mx-auto h-10 w-10 text-fsl-warning" aria-hidden="true" />
        <h1 className="mt-4 text-3xl">Accesso non consentito</h1>
        <p className="mt-2 text-sm text-fsl-slate">Il tuo ruolo non ha i permessi per questa area. Se pensi sia un errore contatta l'organizzazione.</p>
        <Link to="/" className="btn-primary mt-6">
          Torna alla home
        </Link>
      </div>
    </div>
  );
}

export function OfflineBanner() {
  if (typeof navigator === "undefined" || navigator.onLine) return null;
  return (
    <div className="flex items-center gap-2 bg-fsl-warning/15 border-b border-fsl-warning/40 px-4 h-10 text-xs text-fsl-warning" role="status" data-testid="offline-banner">
      <WifiOff className="h-4 w-4" aria-hidden="true" /> Sei offline: i dati mostrati potrebbero non essere aggiornati.
    </div>
  );
}
