import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [landing, setLanding] = useState("/admin");
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    api
      .get("/auth/me")
      .then(({ data }) => {
        setUser(data.user);
        setLanding(data.landing);
      })
      .catch(() => setUser(false))
      .finally(() => setChecking(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("fsl_token", data.access_token);
    setUser(data.user);
    setLanding(data.landing);
    return data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      localStorage.removeItem("fsl_token");
      localStorage.removeItem("fsl_tournament");
      setUser(false);
    }
  }, []);

  return <AuthContext.Provider value={{ user, landing, checking, login, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
