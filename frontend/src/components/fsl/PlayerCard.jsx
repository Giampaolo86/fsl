import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { profileLink } from "@/pages/PlayerProfile";

// Ogni clic su un giocatore apre la scheda completa (stesso layout ovunque)
export function PlayerCardDialog({ playerId, onClose }) {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (!playerId) return;
    const to = profileLink(location.pathname, playerId);
    onClose?.();
    if (to) navigate(to);
  }, [playerId, location.pathname, navigate, onClose]);
  return null;
}
