import { afterEach, expect, it, vi } from "vitest";

type FetchListener = (event: Pick<FetchEvent, "request" | "respondWith">) => void;

afterEach(() => vi.unstubAllGlobals());

it("lets the browser load a sitemap or text file without serving the cached app", async () => {
  const scope = "https://example.test/FolioDash/";
  const listeners = new Map<string, FetchListener>();
  vi.stubGlobal("__BUILD__", "test");
  vi.stubGlobal("self", {
    registration: { scope },
    addEventListener: (type: string, listener: FetchListener) => listeners.set(type, listener),
  });

  await import("./sw");
  const fetchListener = listeners.get("fetch");
  expect(fetchListener).toBeDefined();

  for (const path of ["sitemap.xml", "llms.txt"]) {
    const respondWith = vi.fn();
    fetchListener?.({
      request: { method: "GET", mode: "navigate", url: new URL(path, scope).href } as Request,
      respondWith,
    });
    expect(respondWith).not.toHaveBeenCalled();
  }
});
