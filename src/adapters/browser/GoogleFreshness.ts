const CHECK_INTERVAL_MILLISECONDS = 60_000;

/** Visible-page refresh only. OAuth and writes are never triggered by this scheduler. */
export function watchGoogleFreshness(refresh: () => Promise<void>, paused: () => boolean): () => void {
  let stopped = false;
  const check = (): void => {
    if (stopped || document.visibilityState === "hidden" || !navigator.onLine || paused()) return;
    void refresh().catch(() => { /* The session owns connection feedback. */ });
  };
  window.addEventListener("focus", check);
  window.addEventListener("online", check);
  document.addEventListener("visibilitychange", check);
  const timer = window.setInterval(check, CHECK_INTERVAL_MILLISECONDS);
  check();
  return () => {
    stopped = true;
    window.clearInterval(timer);
    window.removeEventListener("focus", check);
    window.removeEventListener("online", check);
    document.removeEventListener("visibilitychange", check);
  };
}
