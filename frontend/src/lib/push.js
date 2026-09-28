import { api } from "@/lib/api";

const keyBytes = (v) => { const pad = "=".repeat((4 - (v.length % 4)) % 4); return Uint8Array.from(atob((v + pad).replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)); };

export const pushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
export const isStandalone = () => window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;
export const permission = () => (typeof Notification === "undefined" ? "unsupported" : Notification.permission);

// In produzione usa il service worker principale; in sviluppo ne registra uno in uno scope inerte (niente cache).
async function registration() {
  if (process.env.NODE_ENV === "production") { await navigator.serviceWorker.register("/sw.js"); return navigator.serviceWorker.ready; }
  return navigator.serviceWorker.register("/sw.js", { scope: "/__push/" });
}

export async function currentSubscription() {
  if (!pushSupported()) return null;
  try { const reg = await registration(); return await reg.pushManager.getSubscription(); } catch { return null; }
}

export async function subscribePush(publicKey, label) {
  if (!pushSupported()) throw new Error("Questo browser non supporta le notifiche push");
  if (Notification.permission === "denied") throw new Error("Le notifiche sono bloccate nelle impostazioni del browser");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Permesso non concesso");
  const reg = await registration();
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
  await api.post("/push/subscribe", { subscription: sub.toJSON(), label });
  return sub;
}

export async function unsubscribePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  try { await api.delete("/push/subscribe", { data: { endpoint: sub.endpoint } }); } catch { /* già rimossa */ }
  await sub.unsubscribe();
}

export const deviceLabel = () => { const ua = navigator.userAgent; const os = /iphone|ipad/i.test(ua) ? "iPhone/iPad" : /android/i.test(ua) ? "Android" : /mac/i.test(ua) ? "Mac" : /windows/i.test(ua) ? "Windows" : "Dispositivo"; const br = /edg/i.test(ua) ? "Edge" : /chrome/i.test(ua) ? "Chrome" : /safari/i.test(ua) ? "Safari" : /firefox/i.test(ua) ? "Firefox" : ""; return `${os} · ${br}`.replace(/ · $/, ""); };
