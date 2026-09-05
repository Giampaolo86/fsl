import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "./AuthContext";

const TournamentContext = createContext(null);

export function TournamentProvider({ children }) {
  const { user } = useAuth();
  const [tournaments, setTournaments] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentId, setCurrentId] = useState(() => localStorage.getItem("fsl_tournament") || null);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data } = await api.get("/tournaments/hub");
      setTournaments(data.tournaments);
      setStats(data.stats);
      setCurrentId((prev) => {
        if (prev && data.tournaments.some((t) => t.id === prev)) return prev;
        const first = data.tournaments.find((t) => t.status === "active") || data.tournaments[0];
        return first ? first.id : null;
      });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (currentId) localStorage.setItem("fsl_tournament", currentId);
  }, [currentId]);

  const current = useMemo(() => tournaments.find((t) => t.id === currentId) || null, [tournaments, currentId]);

  return (
    <TournamentContext.Provider value={{ tournaments, stats, loading, current, currentId, setCurrentId, refresh }}>
      {children}
    </TournamentContext.Provider>
  );
}

export const useTournaments = () => useContext(TournamentContext);
