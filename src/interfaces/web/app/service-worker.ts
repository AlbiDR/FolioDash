/**
 * Registers the service worker that lets the app open instantly and work offline, and tells
 * the app when a newer version is waiting. The new version is only taken when the person
 * chooses, so a page is never swapped while a statement is being reviewed or saved.
 */
export function watchForUpdate(onReady: (apply: () => void) => void): void {
  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return;

  const announce = (registration: ServiceWorkerRegistration): void => {
    const waiting = registration.waiting;
    // Without a controller this is the first install, not an update.
    if (waiting === null || navigator.serviceWorker.controller === null) return;
    onReady(() => {
      let reloaded = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloaded) return;
        reloaded = true;
        window.location.reload();
      });
      waiting.postMessage({ type: "skip-waiting" });
    });
  };

  const register = (): void => {
    navigator.serviceWorker
      .register("./sw.js", { scope: "./" })
      .then((registration) => {
        announce(registration);
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          installing?.addEventListener("statechange", () => {
            if (installing.state === "installed") announce(registration);
          });
        });
      })
      .catch(() => {
        // The app works without it; it just does not open offline.
      });
  };
  // Wait for the page to finish loading so the worker never competes with it, unless that has already happened.
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
