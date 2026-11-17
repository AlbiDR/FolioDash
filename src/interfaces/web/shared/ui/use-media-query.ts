import { useEffect, useState } from "preact/hooks";

/** Whether a CSS media query currently matches, following changes as the window resizes. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const update = (): void => {
      setMatches(list.matches);
    };
    update();
    list.addEventListener("change", update);
    return () => {
      list.removeEventListener("change", update);
    };
  }, [query]);
  return matches;
}
