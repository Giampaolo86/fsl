import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/lib/api";

export function useTournamentDetail() {
  const { tournamentId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/tournaments/${tournamentId}`);
      setData(res.data);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);
  useEffect(() => {
    load();
  }, [load]);
  return { tournamentId, data, error, loading, reload: load, setData };
}

export function useScoped(path) {
  const { tournamentId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/tournaments/${tournamentId}/${path}`);
      setData(res.data);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [tournamentId, path]);
  useEffect(() => {
    load();
  }, [load]);
  return { tournamentId, data, error, loading, reload: load };
}
