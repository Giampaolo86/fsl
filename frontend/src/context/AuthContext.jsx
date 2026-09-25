import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, authEvents, setCsrfToken } from "@/lib/api";

const AuthContext = createContext(null);
const SYNC_KEY = "fsl_auth_sync";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [landing, setLanding] = useState("/admin");
  const [checking, setChecking] = useState(true);

  const adopt = useCallback((data) => {
    setCsrfToken(data.csrf_token);
    setUser(data.user);
    setLanding(data.landing);
    localStorage.setItem(SYNC_KEY, `in:${Date.now()}`);
  }, []);

  const clear = useCallback((broadcast = true) => {
    setCsrfToken("");
    localStorage.removeItem("fsl_tournament");
    setUser(false);
    if (broadcast) localStorage.setItem(SYNC_KEY, `out:${Date.now()}`);
  }, []);

  const check = useCallback(() => api.get("/auth/me").then(({ data }) => { setCsrfToken(data.csrf_token); setUser(data.user); setLanding(data.landing); }).catch(() => setUser(false)), []);

  useEffect(() => {
    if (window.location.hash?.includes("session_id=")) { setChecking(false); return; }
    check().finally(() => setChecking(false));
  }, [check]);

  useEffect(() => {
    const onLogout = () => clear(false);
    const onRefreshed = (e) => { setUser(e.detail.user); setLanding(e.detail.landing); };
    const onStorage = (e) => { if (e.key === SYNC_KEY && e.newValue) { if (e.newValue.startsWith("out")) clear(false); else check(); } };
    authEvents.addEventListener("logout", onLogout);
    authEvents.addEventListener("refreshed", onRefreshed);
    window.addEventListener("storage", onStorage);
    return () => { authEvents.removeEventListener("logout", onLogout); authEvents.removeEventListener("refreshed", onRefreshed); window.removeEventListener("storage", onStorage); };
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
    try { await api.post("/auth/logout"); } finally { clear(); }
  }, [clear]);

  return <AuthContext.Provider value={{ user, landing, checking, login, logout, register, googleSession, updateUser, setSession: adopt, mfaVerify, mfaSetupConfirm, setLanding }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
