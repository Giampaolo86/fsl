import { useEffect, useState } from "react";

export function useIsMobile(maxWidth = 767) {
  const q = `(max-width: ${maxWidth}px)`;
  const [mobile, setMobile] = useState(() => (typeof window !== "undefined" ? window.matchMedia(q).matches : false));
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = (e) => setMobile(e.matches);
    mq.addEventListener("change", on);
    setMobile(mq.matches);
    return () => mq.removeEventListener("change", on);
  }, [q]);
  return mobile;
}
