import { BUILD_ID } from "@/build-id";

// Se l'app in memoria è di una build precedente (es. PWA riaperta dopo un deploy), ricarica prima di mostrare schermate vecchie
export function startVersionWatch() {
  if (process.env.NODE_ENV !== "production") return;
  let last = 0;
  const check = async () => {
    if (Date.now() - last < 30_000) return;
    last = Date.now();
    try {
      const r = await fetch(`/version.json?_=${Date.now()}`, { cache: "no-store" });
      const { build } = await r.json();
      if (build && build !== BUILD_ID) window.location.reload();
    } catch { /* offline: ignora */ }
  };
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") check(); });
  window.addEventListener("focus", check);
  window.addEventListener("pageshow", (e) => { if (e.persisted) check(); });
  setInterval(check, 10 * 60_000);
  setTimeout(check, 4000);
}
