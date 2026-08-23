import * as React from "react";

/**
 * "Compact" chrome = below the `lg` breakpoint (1024px).
 * Used only for structural decisions (drawer vs sidebar, tab bar vs desktop nav,
 * dialog vs bottom sheet) — never for styling values, which live in CSS.
 */
export const COMPACT_BREAKPOINT = 1024;

export function useIsCompact() {
  const [compact, setCompact] = React.useState(false);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${COMPACT_BREAKPOINT - 1}px)`);
    const onChange = () => setCompact(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return compact;
}
