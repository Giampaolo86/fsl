import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/lib/api";

export function usePublicTournament() {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => {
    setError(null);
    api.get(`/public/tournaments/${slug}`).then((r) => setData(r.data)).catch(setError);
  }, [slug]);
  useEffect(() => {
    load();
  }, [load]);
  return { slug, data, error, reload: load };
}
