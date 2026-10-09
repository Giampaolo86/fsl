import { api } from "@/lib/api";

const isReauth = (e) => e?.response?.status === 403 && e?.response?.data?.detail?.code === "REAUTH_REQUIRED";

/** Chiede password (+ codice MFA se richiesto) e conferma l'identità sul server. Ritorna false se annullato. */
export async function reauth(needsCode) {
  const password = window.prompt("Operazione critica: conferma la tua identità.\n\nInserisci la tua password:");
  if (password === null || password === "") return false;
  let code = null;
  if (needsCode) {
    code = window.prompt("Inserisci il codice MFA (6 cifre) della tua app di autenticazione:");
    if (code === null) return false;
  }
  await api.post("/auth/reauth", { password, code: code || null });
  return true;
}

/** Esegue fn; se il server richiede una ri-autenticazione recente la chiede e riprova una volta. */
export async function withReauth(fn, user) {
  try {
    return await fn();
  } catch (e) {
    if (!isReauth(e)) throw e;
    const ok = await reauth(Boolean(user?.mfa_enabled));
    if (!ok) throw Object.assign(new Error("Operazione annullata"), { cancelled: true });
    return await fn();
  }
}
