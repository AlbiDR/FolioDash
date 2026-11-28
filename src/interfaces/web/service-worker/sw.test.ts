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

type InstallListener = (event: { waitUntil: (work: Promise<unknown>) => void }) => void;

interface Installed {
  readonly saved: string[];
  readonly requests: Request[];
  readonly outcome: Promise<unknown>;
  readonly skipWaiting: ReturnType<typeof vi.fn>;
}

/** `previous` is the version already in control: the page it saved and the files it saved. */
async function installWith(page: string, previous?: { page: string; files: string[] }): Promise<Installed> {
  const scope = "https://example.test/FolioDash/";
  const listeners = new Map<string, InstallListener>();
  const saved: string[] = [];
  const requests: Request[] = [];
  vi.resetModules();
  vi.stubGlobal("__BUILD__", "new");
  vi.stubGlobal("__PRECACHE__", ["./", "assets/index-NEW.js"]);
  const skipWaiting = vi.fn(() => Promise.resolve());
  vi.stubGlobal("self", {
    registration: { scope },
    skipWaiting,
    addEventListener: (type: string, listener: InstallListener) => listeners.set(type, listener),
  });
  const previousCache = {
    match: () => Promise.resolve(previous === undefined ? undefined : new Response(previous.page)),
    keys: () => Promise.resolve((previous?.files ?? []).map((file) => ({ url: new URL(file, scope).href }))),
  };
  vi.stubGlobal("caches", {
    keys: () => Promise.resolve(previous === undefined ? [] : ["foliodash-shell-previous"]),
    open: (name: string) =>
      Promise.resolve(
        name === "foliodash-shell-previous"
          ? previousCache
          : { put: (url: string) => Promise.resolve(void saved.push(url)) },
      ),
  });
  vi.stubGlobal("fetch", (request: Request) => {
    requests.push(request);
    const body = request.url === scope ? page : "file";
    return Promise.resolve(new Response(body, { status: 200 }));
  });
  await import("./sw");
  let outcome: Promise<unknown> = Promise.resolve();
  listeners.get("install")?.({
    waitUntil: (work) => {
      outcome = work;
    },
  });
  return { saved, requests, outcome, skipWaiting };
}

it("saves a new version from the network, never from the browser's own cache", async () => {
  const { saved, requests, outcome } = await installWith('<script src="./assets/index-NEW.js"></script>');
  await outcome;
  expect(requests.map((request) => request.cache)).toEqual(["reload", "reload"]);
  expect(saved).toHaveLength(2);
});

it("refuses to install when the page belongs to the previous deployment", async () => {
  const { saved, outcome } = await installWith('<script src="./assets/index-OLD.js"></script>');
  await expect(outcome).rejects.toThrow(/another version/);
  expect(saved).toHaveLength(0);
});

it("takes over by itself when the version in control saved a page it cannot load", async () => {
  const broken = { page: '<script src="./assets/index-OLD.js"></script>', files: ["", "assets/index-MIDDLE.js"] };
  const { outcome, skipWaiting } = await installWith('<script src="./assets/index-NEW.js"></script>', broken);
  await outcome;
  expect(skipWaiting).toHaveBeenCalledOnce();
});

it("leaves a healthy version in control until the app asks", async () => {
  const healthy = { page: '<script src="./assets/index-OLD.js"></script>', files: ["", "assets/index-OLD.js"] };
  const { outcome, skipWaiting } = await installWith('<script src="./assets/index-NEW.js"></script>', healthy);
  await outcome;
  expect(skipWaiting).not.toHaveBeenCalled();
});
