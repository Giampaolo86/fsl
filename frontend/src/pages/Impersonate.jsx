import { useEffect } from "react";
import { LoadingState } from "@/components/fsl/States";
import { startImpersonation } from "@/lib/api";

export default function Impersonate() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const token = params.get("token");
    const to = params.get("to") || "/";
    if (!token) { window.location.replace("/admin/utenti"); return; }
    startImpersonation(token);
    window.location.replace(to.startsWith("/") ? to : "/");
  }, []);
  return <LoadingState label="Apro l'area dell'utente…" full />;
}
