/// <reference lib="webworker" />
// The service worker: keeps the app's own files so it opens instantly and works offline.
// It never handles anything but those files (see cache-policy.ts), so Google's APIs and the
// person's data are never stored here. A new version waits until the app asks for it, so a
// page is never swapped under someone mid-import.

import {
  cacheNameFor,
  isOldCache,
  isPageLoad,
  navigationCacheKey,
  shellFilesMissing,
  shouldHandle,
} from "./cache-policy";

declare const self: ServiceWorkerGlobalScope;
/** Replaced at build time (config/pwa.ts): every built file, relative to this worker, and a fingerprint of them. */
declare const __PRECACHE__: readonly string[];
declare const __BUILD__: string;

const CACHE = cacheNameFor(__BUILD__);
const scopeUrl = (): string => self.registration.scope;

/**
 * Fetches every file straight from the network. The default would answer from the browser's own cache, which
 * the host lets keep a page for ten minutes, so a new version could be saved with the previous version's page.
 */
async function precache(cache: Cache): Promise<void> {
  const urls = __PRECACHE__.map((file) => new URL(file, scopeUrl()).href);
  const responses = await Promise.all(urls.map((url) => fetch(new Request(url, { cache: "reload" }))));
  for (const response of responses) {
    if (!response.ok)
      throw new Error(`The new version could not be saved: ${response.url} answered ${String(response.status)}.`);
  }
  const page = responses[urls.indexOf(new URL("./", scopeUrl()).href)];
  const missing = page === undefined ? [] : shellFilesMissing(await page.clone().text(), __PRECACHE__);
  // Failing here keeps the working version in control; the next check tries again with a fresh page.
  if (missing.length > 0) throw new Error(`The page belongs to another version; missing ${missing.join(", ")}.`);
  await Promise.all(urls.map((url, index) => cache.put(url, responses[index] as Response)));
}

/**
 * Whether the saved version now in control is itself broken: its page names files its own cache lacks, which is
 * what an update saved from a stale page used to leave behind. Such a window shows nothing and cannot ask for the
 * fixed version, so nobody has anything to lose by replacing it.
 */
async function controllingShellIsBroken(): Promise<boolean> {
  const scope = scopeUrl();
  for (const name of await caches.keys()) {
    if (!isOldCache(name, CACHE)) continue;
    const cache = await caches.open(name);
    const page = await cache.match(scope, { ignoreVary: true });
    if (page === undefined) continue;
    const saved = (await cache.keys()).map((request) => request.url.replace(scope, ""));
    if (shellFilesMissing(await page.text(), saved).length > 0) return true;
  }
  return false;
}

let replacedBrokenShell = false;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      await precache(await caches.open(CACHE));
      replacedBrokenShell = await controllingShellIsBroken();
      if (replacedBrokenShell) await self.skipWaiting();
    })(),
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
      .then(() => self.clients.claim())
      .then(async () => {
        if (!replacedBrokenShell) return;
        // The windows that were blank show the fixed version now.
        for (const client of await self.clients.matchAll({ type: "window" })) await client.navigate(client.url);
      }),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (!shouldHandle(request.method, request.url, scopeUrl())) return;
  const cacheKey = isPageLoad(request.mode) ? navigationCacheKey(request.url, scopeUrl()) : request;
  if (cacheKey === null) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      // The saved files are fixed per build, so a Vary header from the host must not stop a match.
      const cached = await cache.match(cacheKey, { ignoreVary: true });
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
