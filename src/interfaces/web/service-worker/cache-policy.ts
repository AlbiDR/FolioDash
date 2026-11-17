/** The rules for what the service worker may keep. Pure, so they can be tested without a browser. */

export const CACHE_PREFIX = "foliodash-shell-";

export const cacheNameFor = (build: string): string => `${CACHE_PREFIX}${build}`;

/** True for a cache this app made in an earlier version, which is cleared when a new version takes over. */
export const isOldCache = (name: string, current: string): boolean => name.startsWith(CACHE_PREFIX) && name !== current;

/**
 * Whether the worker answers a request at all. Only the app's own files, fetched with GET,
 * from inside its own folder. Everything else, above all Google's APIs and sign-in, goes
 * straight to the network and is never stored, so no financial data ever lands in a cache.
 */
export function shouldHandle(method: string, requestUrl: string, scopeUrl: string): boolean {
  if (method !== "GET") return false;
  const request = new URL(requestUrl);
  const scope = new URL(scopeUrl);
  if (request.origin !== scope.origin) return false;
  if (!request.pathname.startsWith(scope.pathname)) return false;
  // The host redirects a folder page to its trailing slash. Answering it here would keep the wrong
  // address, and the page's relative links would then point outside the app.
  if (STANDALONE_PAGES.some((page) => request.pathname === `${scope.pathname}${page.slice(0, -1)}`)) return false;
  return request.pathname !== `${scope.pathname}sw.js`;
}

/** Pages that are not the app, such as the privacy policy. A page load for one gets that page, not the app. */
const STANDALONE_PAGES = ["privacy/"] as const;

/** The saved file a page load should get when it is for a standalone page; null for the app itself. */
export function standalonePageKey(requestUrl: string, scopeUrl: string): string | null {
  const request = new URL(requestUrl);
  const scope = new URL(scopeUrl);
  if (request.origin !== scope.origin || !request.pathname.startsWith(scope.pathname)) return null;
  const relative = request.pathname.slice(scope.pathname.length);
  for (const page of STANDALONE_PAGES) {
    if (relative === page || relative === `${page}index.html`) return new URL(`${page}index.html`, scope).href;
  }
  return null;
}

/** A page load (not a script, style or image request). */
export const isPageLoad = (mode: string): boolean => mode === "navigate";
