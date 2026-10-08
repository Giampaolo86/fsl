import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { api } from "@/lib/api";

const sid = () => {
  let s = localStorage.getItem("fsl_sid");
  if (!s) { s = (crypto.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36)); localStorage.setItem("fsl_sid", s); }
  return s;
};

export function usePageTracking() {
  const { pathname } = useLocation();
  useEffect(() => {
    const first = !sessionStorage.getItem("fsl_tracked");
    sessionStorage.setItem("fsl_tracked", "1");
    const slug = pathname.match(/^\/tornei\/([^/]+)/)?.[1] || null;
    api.post("/public/track", { sid: sid(), path: pathname, ref: first ? document.referrer || "" : "", device: window.innerWidth < 768 ? "mobile" : "desktop", slug, new_session: first }).catch(() => {});
  }, [pathname]);
}
