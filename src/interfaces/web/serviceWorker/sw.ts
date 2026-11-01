/// <reference lib="webworker" />
// The service worker: keeps the app's own files so it opens instantly and works offline.
// It never handles anything but those files (see cachePolicy.ts), so Google's APIs and the
// person's data are never stored here. A new version waits until the app asks for it, so a
// page is never swapped under someone mid-import.

import { cacheNameFor, isOldCache, isPageLoad, shouldHandle } from "./cachePolicy";

declare const self: ServiceWorkerGlobalScope;
/** Replaced at build time (config/pwa.ts): every built file, relative to this worker, and a fingerprint of them. */
declare const __PRECACHE__: readonly string[];
declare const __BUILD__: string;

const CACHE = cacheNameFor(__BUILD__);
const scopeUrl = (): string => self.registration.scope;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(__PRECACHE__.map((file) => new URL(file, scopeUrl()).href))),
  );
});

self.addEventListener("message", (event) => {
  if ((event.data as { readonly type?: unknown } | null)?.type === "skip-waiting") void self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => isOldCache(name, CACHE)).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (!shouldHandle(request.method, request.url, scopeUrl())) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      // Every page load gets the saved app, which then reads its data from the device copy or Google.
      // The saved files are fixed per build, so a Vary header from the host must not stop a match.
      const cached = await cache.match(isPageLoad(request.mode) ? scopeUrl() : request, { ignoreVary: true });
      if (cached !== undefined) return cached;
      try {
        const fresh = await fetch(request);
        if (fresh.ok) await cache.put(request, fresh.clone());
        return fresh;
      } catch {
        return Response.error();
      }
    })(),
  );
});
