import type { RefObject } from "preact";
import { useEffect } from "preact/hooks";

/** Keep keyboard focus clear of sticky chrome, including after zoom and resizing. */
export function useFocusVisibility(header: RefObject<HTMLElement | null>, navigation: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.getPropertyValue("--header-clearance");
    let frame = 0;
    const stickyHeader = (): HTMLElement | null => {
      const element = header.current;
      return element !== null && getComputedStyle(element).position === "sticky" ? element : null;
    };
    const measure = (): void => {
      const element = stickyHeader();
      const clearance = element === null ? 0 : element.getBoundingClientRect().height + parseFloat(getComputedStyle(element).top);
      root.style.setProperty("--header-clearance", `${String(Math.ceil(clearance))}px`);
    };
    const revealFocus = (event: FocusEvent): void => {
      const target = event.target;
      if (!(target instanceof Element) || target.id === "main-content" || header.current?.contains(target) || navigation.current?.contains(target) || target.classList.contains("skip-link")) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!target.isConnected || document.activeElement !== target) return;
        const bounds = target.getBoundingClientRect();
        const inset = parseFloat(getComputedStyle(root).fontSize) / 2;
        const upper = (stickyHeader()?.getBoundingClientRect().bottom ?? 0) + inset;
        const nav = navigation.current;
        const lower = nav !== null && getComputedStyle(nav).position === "fixed" ? nav.getBoundingClientRect().top - inset : window.innerHeight - inset;
        if (bounds.height > 0 && (bounds.top < upper || bounds.bottom > lower)) {
          target.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
        }
      });
    };
    const observer = new ResizeObserver(measure);
    if (header.current !== null) observer.observe(header.current);
    measure();
    window.addEventListener("resize", measure);
    document.addEventListener("focusin", revealFocus);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
      document.removeEventListener("focusin", revealFocus);
      if (previous === "") root.style.removeProperty("--header-clearance");
      else root.style.setProperty("--header-clearance", previous);
    };
  }, [header, navigation]);
}
