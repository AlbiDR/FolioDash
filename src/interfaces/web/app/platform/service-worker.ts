import { UPDATE_CHECK_MILLISECONDS, mayApplyUpdateQuietly } from "./update-policy";

/**
 * Registers the service worker that lets the app open instantly and work offline, and keeps
 * the app current by itself. It looks for a newer version on opening, on coming back to the
 * page, on reconnecting and every half hour. A newer version replaces the page on its own
 * only when nobody could notice or lose anything (see update-policy.ts); otherwise it waits
 * and `onReady` offers the person a button, so a page is never swapped while a statement is
 * being reviewed or saved.
 */
export function watchForUpdate(onReady: (apply: () => void) => void, isLocked: () => boolean): () => void {
  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return () => undefined;

  const openedAt = Date.now();
  let interacted = false;
  let pending: (() => void) | null = null;
  let applied = false;
  let timer: number | undefined;
  let stopped = false;

  const markInteracted = (): void => {
    interacted = true;
  };
  const tryQuietly = (): void => {
    if (pending === null || applied) return;
    const apply = pending;
    if (
      mayApplyUpdateQuietly({
        locked: isLocked(),
        hidden: document.visibilityState === "hidden",
        millisecondsSinceLoad: Date.now() - openedAt,
        interacted,
      })
    ) {
      apply();
    }
  };

  const announce = (registration: ServiceWorkerRegistration): void => {
    const waiting = registration.waiting;
    // Without a controller this is the first install, not an update.
    if (waiting === null || navigator.serviceWorker.controller === null) return;
    pending = () => {
      if (applied) return;
      applied = true;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        window.location.reload();
      });
      waiting.postMessage({ type: "skip-waiting" });
    };
    onReady(pending);
    tryQuietly();
  };

  const checkForUpdate = (registration: ServiceWorkerRegistration): void => {
    if (stopped || applied || !navigator.onLine) return;
    registration.update().catch(() => {
      // Offline or the host is briefly unavailable: the next check tries again.
    });
  };

  const onVisibility = (): void => {
    tryQuietly();
  };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pointerdown", markInteracted, { once: true, passive: true });
  window.addEventListener("keydown", markInteracted, { once: true });

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
        const check = (): void => {
          checkForUpdate(registration);
        };
        const onShown = (): void => {
          if (document.visibilityState === "visible") check();
        };
        document.addEventListener("visibilitychange", onShown);
        window.addEventListener("online", check);
        timer = window.setInterval(check, UPDATE_CHECK_MILLISECONDS);
      })
      .catch(() => {
        // The app works without it; it just does not open offline.
      });
  };
  // Wait for the page to finish loading so the worker never competes with it, unless that has already happened.
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });

  return () => {
    stopped = true;
    if (timer !== undefined) window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
