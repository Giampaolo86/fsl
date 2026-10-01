import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "./AuthContext";

const TournamentContext = createContext(null);

export function TournamentProvider({ children }) {
  const { user } = useAuth();
  const [tournaments, setTournaments] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentId, setCurrentIdState] = useState(() => {
    const v = localStorage.getItem("fsl_tournament");
    return v && v !== "all" ? v : null;
  });
  const setCurrentId = useCallback((id) => {
    setCurrentIdState(id || null);
    localStorage.setItem("fsl_tournament", id || "all");
  }, []);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data } = await api.get("/tournaments/hub");
      setTournaments(data.tournaments);
      setStats(data.stats);
      setCurrentIdState((prev) => (prev && !data.tournaments.some((t) => t.id === prev) ? null : prev));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const current = useMemo(() => tournaments.find((t) => t.id === currentId) || null, [tournaments, currentId]);

  return (
    <TournamentContext.Provider value={{ tournaments, stats, loading, current, currentId, setCurrentId, refresh }}>
      {children}
    </TournamentContext.Provider>
  );
}

export const useTournaments = () => useContext(TournamentContext);
