import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { LoadingState } from "@/components/fsl/States";

const ADMIN = ["super_admin", "director", "secretary"];
const AREA = { super_admin: "/admin", director: "/admin", secretary: "/admin", club_manager: "/societa", referee: "/arbitro", fan: "/account" };

export const landingFor = (user) => (user?.is_super_admin ? "/admin" : AREA[user?.role] || "/");

export function canAccess(user, roles) {
  if (!roles) return true;
  if (roles.includes(user.role)) return true;
  return !!user.is_super_admin && roles.some((r) => ADMIN.includes(r));
}

export function isPathAllowed(user, path) {
  if (!path || path === "/" || path.startsWith("/tornei") || path.startsWith("/payment")) return true;
  const area = Object.entries(AREA).filter(([, a]) => path.startsWith(a));
  if (!area.length) return true;
  return area.some(([role, a]) => canAccess(user, [role]) && path.startsWith(a));
}

export function ProtectedRoute({ roles, children }) {
  const { user, checking } = useAuth();
  const location = useLocation();
  if (checking) return <LoadingState label="Verifica sessione…" full />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (user.must_change_password && location.pathname !== "/cambia-password") return <Navigate to="/cambia-password" replace />;
  if (!canAccess(user, roles)) return <Navigate to={landingFor(user)} replace />;
  return children;
}
