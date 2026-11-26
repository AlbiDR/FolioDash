import { useEffect } from "preact/hooks";

const NAME = "fund-title";

/**
 * Opening a fund from a row lets that row's fund name become the fund page's title during the view transition
 * (docs/design/polished-by-default.md, phase 5). The clicked name takes the title's view-transition name just before
 * the navigation; a name must be unique on each side, so it is cleared from the previous row on the next click, and
 * nothing is named when the page already shows a fund title.
 */
export function useFundTitleContinuity(): void {
  useEffect(() => {
    let named: HTMLElement | null = null;
    const name = (event: MouseEvent): void => {
      if (named !== null) named.style.removeProperty("view-transition-name");
      named = null;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest('a[href^="#fund/"]') : null;
      if (!(link instanceof HTMLElement) || document.querySelector(".fund-title") !== null) return;
      named = link.querySelector<HTMLElement>(".holding-name, .mover-name") ?? link;
      named.style.setProperty("view-transition-name", NAME);
    };
    document.addEventListener("click", name, true);
    return () => {
      document.removeEventListener("click", name, true);
    };
  }, []);
}
