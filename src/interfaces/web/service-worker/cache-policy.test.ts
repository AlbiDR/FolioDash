import { describe, expect, it } from "vitest";
import { cacheNameFor, isOldCache, isPageLoad, navigationCacheKey, shouldHandle } from "./cache-policy";

const SCOPE = "https://example.test/FolioDash/";

describe("shouldHandle", () => {
  it("answers the app's own files fetched with GET", () => {
    expect(shouldHandle("GET", `${SCOPE}assets/index-abc.js`, SCOPE)).toBe(true);
    expect(shouldHandle("GET", SCOPE, SCOPE)).toBe(true);
  });

  it("never touches Google, so no sign-in or financial data is cached", () => {
    expect(shouldHandle("GET", "https://sheets.googleapis.com/v4/spreadsheets/x", SCOPE)).toBe(false);
    expect(shouldHandle("GET", "https://accounts.google.com/gsi/client", SCOPE)).toBe(false);
  });

  it("never touches a write", () => {
    expect(shouldHandle("POST", `${SCOPE}assets/index.js`, SCOPE)).toBe(false);
    expect(shouldHandle("PUT", `${SCOPE}assets/index.js`, SCOPE)).toBe(false);
  });

  it("stays inside its own folder and leaves the worker file itself to the browser", () => {
    expect(shouldHandle("GET", "https://example.test/other/app.js", SCOPE)).toBe(false);
    expect(shouldHandle("GET", `${SCOPE}sw.js`, SCOPE)).toBe(false);
  });
});

describe("document navigation", () => {
  it("serves the privacy policy as itself, never as the app", () => {
    expect(navigationCacheKey(`${SCOPE}privacy/`, SCOPE)).toBe(`${SCOPE}privacy/index.html`);
    expect(navigationCacheKey(`${SCOPE}privacy/index.html`, SCOPE)).toBe(`${SCOPE}privacy/index.html`);
  });

  it("opens the cached app for its entry points, including hash routes", () => {
    expect(navigationCacheKey(SCOPE, SCOPE)).toBe(SCOPE);
    expect(navigationCacheKey(`${SCOPE}index.html`, SCOPE)).toBe(SCOPE);
    expect(navigationCacheKey(`${SCOPE}?demo#expenses`, SCOPE)).toBe(SCOPE);
  });

  it("leaves discovery files, other assets, unknown paths and other sites to the browser", () => {
    expect(navigationCacheKey(`${SCOPE}sitemap.xml`, SCOPE)).toBeNull();
    expect(navigationCacheKey(`${SCOPE}llms.txt`, SCOPE)).toBeNull();
    expect(navigationCacheKey(`${SCOPE}missing/`, SCOPE)).toBeNull();
    expect(navigationCacheKey(`${SCOPE}assets/index-abc.js`, SCOPE)).toBeNull();
    expect(navigationCacheKey("https://other.test/FolioDash/privacy/", SCOPE)).toBeNull();
    expect(navigationCacheKey("https://example.test/elsewhere/privacy/", SCOPE)).toBeNull();
  });

  it("lets the browser follow the host's redirect to the trailing slash, so relative links keep working", () => {
    expect(shouldHandle("GET", `${SCOPE}privacy`, SCOPE)).toBe(false);
    expect(shouldHandle("GET", `${SCOPE}privacy/`, SCOPE)).toBe(true);
  });
});

describe("caches", () => {
  it("names a cache after the build and recognises only this app's earlier ones as old", () => {
    const current = cacheNameFor("v2");
    expect(isOldCache(cacheNameFor("v1"), current)).toBe(true);
    expect(isOldCache(current, current)).toBe(false);
    expect(isOldCache("someone-elses-cache", current)).toBe(false);
  });

  it("tells a page load from other requests", () => {
    expect(isPageLoad("navigate")).toBe(true);
    expect(isPageLoad("cors")).toBe(false);
  });
});
