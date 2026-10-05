import axios from "axios";

export const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API, withCredentials: true });

const UNSAFE = ["post", "put", "patch", "delete"];
const readCookie = (name) => document.cookie.split("; ").find((c) => c.startsWith(`${name}=`))?.split("=").slice(1).join("=") || "";
let csrfToken = "";
export const setCsrfToken = (t) => { csrfToken = t || ""; };
export const currentCsrf = () => csrfToken || readCookie("csrf_token");

const IMP_KEY = "fsl_impersonation";
export const impersonationToken = () => sessionStorage.getItem(IMP_KEY);
export const startImpersonation = (token) => sessionStorage.setItem(IMP_KEY, token);
export const endImpersonation = () => sessionStorage.removeItem(IMP_KEY);

api.interceptors.request.use((config) => {
  const imp = impersonationToken();
  if (imp) config.headers.Authorization = `Bearer ${imp}`;
  else if (UNSAFE.includes((config.method || "get").toLowerCase())) config.headers["X-CSRF-Token"] = currentCsrf();
  return config;
});

let refreshing = null;
const NO_RETRY = ["/auth/login", "/auth/refresh", "/auth/logout", "/auth/register", "/auth/google/session", "/auth/mfa/"];
export const authEvents = new EventTarget();

api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const { config, response } = err;
    const code = response?.data?.detail?.code;
    if (response?.status !== 401 || !config || config._retried || NO_RETRY.some((p) => config.url?.includes(p))) throw err;
    if (impersonationToken()) { endImpersonation(); authEvents.dispatchEvent(new Event("impersonation-expired")); throw err; }
    if (code === "UNAUTHENTICATED" && !readCookie("csrf_token")) throw err;
    if (code === "SESSION_REVOKED" || code === "USER_NOT_FOUND") { authEvents.dispatchEvent(new Event("logout")); throw err; }
    try {
      refreshing = refreshing || api.post("/auth/refresh").finally(() => { refreshing = null; });
      const { data } = await refreshing;
      setCsrfToken(data.csrf_token);
      authEvents.dispatchEvent(new CustomEvent("refreshed", { detail: data }));
    } catch (e) {
      authEvents.dispatchEvent(new Event("logout"));
      throw err;
    }
    config._retried = true;
    return api(config);
  },
);

export function apiError(err, fallback = "Si è verificato un errore. Riprova.") {
  const detail = err?.response?.data?.detail;
  if (!detail) return err?.message || fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((e) => e?.msg || JSON.stringify(e)).join(" ");
  if (detail.message) return detail.message;
  return fallback;
}

export function apiCode(err) {
  return err?.response?.data?.detail?.code || null;
}
