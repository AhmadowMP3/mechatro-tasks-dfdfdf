import { useEffect, useState } from "react";

export function useBreakpoint() {
  const [w, setW] = useState<number>(() =>
    typeof window === "undefined" ? 1280 : window.innerWidth
  );
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return {
    width: w,
    isMobile: w < 640,
    isTablet: w < 1024,
  };
}

export function useIsMobile(breakpoint = 640) {
  const [m, setM] = useState<boolean>(() =>
    typeof window === "undefined" ? false : window.innerWidth < breakpoint
  );
  useEffect(() => {
    const h = () => setM(window.innerWidth < breakpoint);
    h();
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [breakpoint]);
  return m;
}
