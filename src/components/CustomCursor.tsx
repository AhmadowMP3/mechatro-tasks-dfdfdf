import { useEffect } from "react";

/**
 * Mechatro branded cursor: gold dot + trailing blue ring.
 * Auto-disables on touch devices. Respects prefers-reduced-motion.
 */
export function CustomCursor() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const isTouch = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    if (isTouch) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const dot = document.createElement("div");
    const ring = document.createElement("div");
    dot.className = "mech-cursor-dot";
    ring.className = "mech-cursor-ring";
    dot.setAttribute("aria-hidden", "true");
    ring.setAttribute("aria-hidden", "true");
    document.body.appendChild(ring);
    document.body.appendChild(dot);
    document.body.classList.add("mech-cursor-active");

    let mx = window.innerWidth / 2;
    let my = window.innerHeight / 2;
    let rx = mx;
    let ry = my;
    let raf = 0;
    let visible = false;

    const show = () => {
      if (visible) return;
      visible = true;
      dot.style.opacity = "1";
      ring.style.opacity = "1";
    };
    const hide = () => {
      visible = false;
      dot.style.opacity = "0";
      ring.style.opacity = "0";
    };

    const HOVER_SEL = 'a, button, [role="button"], .brand-btn, input[type="submit"], input[type="button"], summary, label[for], select, [data-cursor="hover"], .kanban-card, [tabindex]:not([tabindex="-1"])';
    const TEXT_SEL = 'input:not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]):not([type="file"]), textarea, [contenteditable="true"]';

    const onMove = (e: MouseEvent) => {
      mx = e.clientX;
      my = e.clientY;
      show();
      dot.style.transform = `translate3d(${mx}px, ${my}px, 0) translate(-50%, -50%)`;
      if (reduceMotion) {
        rx = mx; ry = my;
        ring.style.transform = `translate3d(${rx}px, ${ry}px, 0) translate(-50%, -50%)`;
      }
      const el = e.target as HTMLElement | null;
      const isDisabled = !!el?.closest("[disabled], [aria-disabled='true']");
      const isText = !!el?.closest(TEXT_SEL);
      const isHover = !!el?.closest(HOVER_SEL);
      dot.classList.toggle("is-text", isText);
      ring.classList.toggle("is-text", isText);
      dot.classList.toggle("is-hover", isHover && !isText);
      ring.classList.toggle("is-hover", isHover && !isText);
      dot.classList.toggle("is-disabled", isDisabled);
      ring.classList.toggle("is-disabled", isDisabled);
    };
    const onDown = () => { dot.classList.add("is-active"); ring.classList.add("is-active"); };
    const onUp = () => { dot.classList.remove("is-active"); ring.classList.remove("is-active"); };
    const onLeave = () => hide();
    const onEnter = () => show();

    const tick = () => {
      rx += (mx - rx) * 0.18;
      ry += (my - ry) * 0.18;
      ring.style.transform = `translate3d(${rx}px, ${ry}px, 0) translate(-50%, -50%)`;
      raf = requestAnimationFrame(tick);
    };
    if (!reduceMotion) raf = requestAnimationFrame(tick);

    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    document.addEventListener("mouseleave", onLeave);
    document.addEventListener("mouseenter", onEnter);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
      document.removeEventListener("mouseleave", onLeave);
      document.removeEventListener("mouseenter", onEnter);
      dot.remove();
      ring.remove();
      document.body.classList.remove("mech-cursor-active");
    };
  }, []);
  return null;
}
