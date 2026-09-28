import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/index.css";
import App from "@/App";
import { ErrorBoundary } from "@/components/fsl/ErrorBoundary";
import { startVersionWatch } from "@/lib/version";

// Host canonico: se l'app è aperta da un host diverso da quello del backend (www, *.emergent.host, vecchia PWA)
// reindirizza sullo stesso dominio: cookie di login e API restano same-origin.
(() => {
  try {
    if (process.env.NODE_ENV !== "production") return;
    const api = new URL(process.env.REACT_APP_BACKEND_URL);
    const here = window.location;
    if (api.protocol === "https:" && here.hostname !== api.hostname && here.hostname !== "localhost") {
      here.replace(`${api.origin}${here.pathname}${here.search}${here.hash}`);
    }
  } catch { /* URL non valido: nessun redirect */ }
})();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </QueryClientProvider>
  </React.StrictMode>,
);

startVersionWatch();

if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then((reg) => reg.update?.()).catch(() => {});
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (refreshing || !navigator.serviceWorker.controller) return; refreshing = true; window.location.reload(); });
  });
}

