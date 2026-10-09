import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, authEvents, endImpersonation, impersonationToken, setCsrfToken } from "@/lib/api";

const AuthContext = createContext(null);
const SYNC_KEY = "fsl_auth_sync";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [landing, setLanding] = useState("/admin");
  const [checking, setChecking] = useState(true);
  const impersonating = !!impersonationToken();

  const adopt = useCallback((data) => {
    setCsrfToken(data.csrf_token);
    setUser(data.user);
    setLanding(data.landing);
    if (!impersonationToken()) localStorage.setItem(SYNC_KEY, `in:${Date.now()}`);
  }, []);

  const clear = useCallback((broadcast = true) => {
    setCsrfToken("");
    if (!impersonationToken()) localStorage.removeItem("fsl_tournament");
    setUser(false);
    if (broadcast && !impersonationToken()) localStorage.setItem(SYNC_KEY, `out:${Date.now()}`);
  }, []);

  const check = useCallback(() => api.get("/auth/me").then(({ data }) => { setCsrfToken(data.csrf_token); setUser(data.user); setLanding(data.landing); }).catch(() => setUser(false)), []);

  useEffect(() => {
    if (window.location.hash?.includes("session_id=")) { setChecking(false); return; }
    check().finally(() => setChecking(false));
  }, [check]);

  useEffect(() => {
    const onLogout = (e) => { clear(false); if (e?.detail?.reason === "mfa_required") { api.post("/auth/logout").catch(() => {}); window.location.replace("/login?area=staff&mfa=obbligatoria"); } };
    const onRefreshed = (e) => { setUser(e.detail.user); setLanding(e.detail.landing); };
    const onStorage = (e) => { if (impersonationToken()) return; if (e.key === SYNC_KEY && e.newValue) { if (e.newValue.startsWith("out")) clear(false); else check(); } };
    const onImpersonationExpired = () => { setUser(false); window.location.replace("/admin/utenti?entra_come=scaduta"); };
    authEvents.addEventListener("logout", onLogout);
    authEvents.addEventListener("refreshed", onRefreshed);
    authEvents.addEventListener("impersonation-expired", onImpersonationExpired);
    window.addEventListener("storage", onStorage);
    return () => { authEvents.removeEventListener("logout", onLogout); authEvents.removeEventListener("refreshed", onRefreshed); authEvents.removeEventListener("impersonation-expired", onImpersonationExpired); window.removeEventListener("storage", onStorage); };
  }, [check, clear]);

  const login = useCallback(async (email, password, area) => {
    const { data } = await api.post("/auth/login", { email, password, area: area || undefined });
    if (data.mfa_required || data.mfa_setup_required) return data;
    adopt(data);
    return data;
  }, [adopt]);

  const mfaVerify = useCallback(async (challenge, code, remember = false) => { const { data } = await api.post("/auth/mfa/verify", { challenge, code, remember }); adopt(data); return data; }, [adopt]);
  const mfaSetupConfirm = useCallback(async (challenge, code) => { const { data } = await api.post("/auth/mfa/setup/confirm", { challenge, code }); setCsrfToken(data.csrf_token); return data; }, []);
  const register = useCallback(async (body) => { const { data } = await api.post("/auth/register", body); adopt(data); return data; }, [adopt]);
  const googleSession = useCallback(async (sessionId) => { const { data } = await api.post("/auth/google/session", { session_id: sessionId }); if (data.mfa_required || data.mfa_setup_required) return data; adopt(data); return data; }, [adopt]);
  const updateUser = useCallback((patch) => setUser((u) => ({ ...u, ...patch })), []);

  const logout = useCallback(async () => {
    if (impersonationToken()) {
      try { await api.post("/auth/impersonate/end"); } catch { /* sessione già scaduta */ }
      endImpersonation();
      setUser(false);
      window.location.replace("/admin/utenti");
      return;
    }
    try { await api.post("/auth/logout"); } finally { clear(); }
  }, [clear]);

  return <AuthContext.Provider value={{ user, landing, checking, impersonating, login, logout, register, googleSession, updateUser, setSession: adopt, mfaVerify, mfaSetupConfirm, setLanding }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
