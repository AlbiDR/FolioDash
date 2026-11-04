/** Android Chrome reads a single theme tag; keep it in step with the CSS token palette. */
export function watchSystemTheme(): () => void {
  const theme = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  const preference = window.matchMedia("(prefers-color-scheme: dark)");
  const update = (): void => {
    const colour = getComputedStyle(document.documentElement).getPropertyValue("--color-background").trim();
    if (theme !== null && colour !== "") theme.content = colour;
  };
  update();
  preference.addEventListener("change", update);
  // Also refresh on returning from Android settings or a suspended app window.
  document.addEventListener("visibilitychange", update);
  return () => {
    preference.removeEventListener("change", update);
    document.removeEventListener("visibilitychange", update);
  };
}
