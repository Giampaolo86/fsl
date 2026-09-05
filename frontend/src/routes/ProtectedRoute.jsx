import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { LoadingState, PermissionDenied } from "@/components/fsl/States";

export function ProtectedRoute({ roles, children }) {
  const { user, checking } = useAuth();
  const location = useLocation();
  if (checking) return <LoadingState label="Verifica sessione…" full />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (roles && !user.is_super_admin && !roles.includes(user.role)) return <PermissionDenied />;
  return children;
}
