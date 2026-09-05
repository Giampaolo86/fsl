import axios from "axios";

export const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API, withCredentials: true });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("fsl_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export function apiError(err, fallback = "Si è verificato un errore. Riprova.") {
  const detail = err?.response?.data?.detail;
  if (!detail) return err?.message || fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((e) => e?.msg || JSON.stringify(e)).join(" ");
  if (detail.message) return detail.message;
  return fallback;
}

export function apiCode(err) {
  return err?.response?.data?.detail?.code || null;
}
