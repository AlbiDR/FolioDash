import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { stripVTControlCharacters } from "node:util";

export interface LocalBrowser {
  readonly origin: string;
  readonly call: (method: string, params?: Record<string, unknown>) => Promise<Record<string, unknown>>;
  readonly evaluate: (expression: string) => Promise<unknown>;
  readonly waitFor: (check: () => Promise<boolean>, description: string) => Promise<void>;
}

/** Fresh signed-out browser, production preview, service-worker bypass and local-only network.
 * Shared by README capture and the interaction audit; never attaches to a person's browser. */
export async function withLocalBrowser(run: (browser: LocalBrowser) => Promise<void>, APP_PORT = 4197): Promise<void> {
  const ORIGIN = `http://127.0.0.1:${String(APP_PORT)}`;
  const chromePath = process.env["CHROME_PATH"] ?? (process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : "google-chrome");
  const profile = mkdtempSync(join(tmpdir(), "foliodash-readme-"));
  const pending = new Map<number, { resolve: (value: Record<string, unknown>) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  const browserErrors: string[] = [];
  const blockedOrigins = new Set<string>();
  let preview: ChildProcess | undefined;
  let previewReady = false;
  let previewOutput = "";
  let chrome: ChildProcess | undefined;
  let socket: WebSocket | undefined;
  let sequence = 0;

  function object(value: unknown): Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Unexpected browser response.");
    return value as Record<string, unknown>;
  }

  function call(method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const active = socket;
    if (active?.readyState !== WebSocket.OPEN) return Promise.reject(new Error("Browser connection is unavailable."));
    const id = ++sequence;
    return new Promise((resolveResult, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Browser command timed out: ${method}`));
      }, 15_000);
      pending.set(id, { resolve: resolveResult, reject, timer });
      active.send(JSON.stringify({ id, method, params }));
    });
  }

  async function evaluate(expression: string): Promise<unknown> {
    const response = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (response["exceptionDetails"] !== undefined) throw new Error("Browser evaluation failed.");
    return object(response["result"])["value"];
  }

  async function intercept(params: Record<string, unknown>): Promise<void> {
    const request = object(params["request"]);
    const url = new URL(String(request["url"]));
    if (url.origin === ORIGIN) await call("Fetch.continueRequest", { requestId: params["requestId"] });
    else {
      blockedOrigins.add(url.origin);
      await call("Fetch.failRequest", { requestId: params["requestId"], errorReason: "BlockedByClient" });
    }
  }

  function message(event: MessageEvent): void {
    try {
      const response = object(JSON.parse(String(event.data)) as unknown);
      if (typeof response["id"] === "number") {
        const operation = pending.get(response["id"]);
        if (operation === undefined) return;
        pending.delete(response["id"]);
        clearTimeout(operation.timer);
        if (response["error"] !== undefined) operation.reject(new Error("Browser command failed."));
        else operation.resolve(object(response["result"]));
      } else if (response["method"] === "Fetch.requestPaused") {
        void intercept(object(response["params"])).catch(() => { browserErrors.push("Network interception failed."); });
      } else if (response["method"] === "Runtime.exceptionThrown") browserErrors.push("Unhandled browser exception.");
    } catch {
      browserErrors.push("Invalid browser protocol response.");
    }
  }

  async function waitFor(check: () => Promise<boolean>, description: string): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await check()) return;
      await delay(100);
    }
    throw new Error(`Timed out waiting for ${description}.`);
  }

  async function localReady(): Promise<boolean> {
    if (preview?.exitCode !== null && preview?.exitCode !== undefined) throw new Error("The local preview could not bind its port.");
    if (!previewReady) return false;
    try { return (await fetch(ORIGIN)).ok; } catch { return false; }
  }

  async function connectBrowser(): Promise<void> {
    let address: string | undefined;
    await waitFor(async () => {
      try {
        const debugPort = Number(readFileSync(join(profile, "DevToolsActivePort"), "utf8").split("\n")[0]);
        if (!Number.isInteger(debugPort) || debugPort <= 0) return false;
        const pages: unknown = await (await fetch(`http://127.0.0.1:${String(debugPort)}/json/list`)).json();
        if (!Array.isArray(pages)) return false;
        for (const candidate of pages as unknown[]) {
          const page = object(candidate);
          if (page["type"] === "page" && typeof page["webSocketDebuggerUrl"] === "string") address = page["webSocketDebuggerUrl"];
        }
        return address !== undefined;
      } catch { return false; }
    }, "Chrome");
    if (address === undefined) throw new Error("Chrome did not expose a page.");
    socket = new WebSocket(address);
    socket.addEventListener("message", message);
    await new Promise<void>((resolveOpen, reject) => {
      socket?.addEventListener("open", () => { resolveOpen(); }, { once: true });
      socket?.addEventListener("error", () => { reject(new Error("Could not connect to Chrome.")); }, { once: true });
    });
  }

  async function stop(child: ChildProcess | undefined, graceful = false): Promise<void> {
    if (child === undefined || child.pid === undefined || child.exitCode !== null) return;
    await new Promise<void>((resolveExit) => {
      const timer = setTimeout(() => { child.kill("SIGKILL"); }, graceful ? 5000 : 1500);
      child.once("exit", () => { clearTimeout(timer); resolveExit(); });
      if (!graceful) child.kill();
    });
  }

  try {
    preview = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--config", "config/vite.config.ts", "--host", "127.0.0.1", "--port", String(APP_PORT), "--strictPort"], { stdio: ["ignore", "pipe", "ignore"] });
    preview.stdout?.on("data", (chunk: Buffer) => {
      previewOutput += stripVTControlCharacters(chunk.toString());
      if (previewOutput.includes(ORIGIN)) previewReady = true;
    });
    preview.on("error", () => { browserErrors.push("Could not start the local preview."); });
    await waitFor(localReady, "the local production preview");
    chrome = spawn(chromePath, ["--headless", "--disable-gpu", "--disable-background-networking", "--disable-component-update", "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
    chrome.on("error", () => { browserErrors.push("Could not start Chrome. Check CHROME_PATH."); });
    await connectBrowser();
    await call("Runtime.enable");
    await call("Page.enable");
    await call("Network.enable");
    await call("Network.setBypassServiceWorker", { bypass: true });
    await call("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
    await run({ origin: ORIGIN, call, evaluate, waitFor });
    if (browserErrors.length > 0 || blockedOrigins.size > 0) throw new Error("Browser check failed: runtime error or nonlocal request.");
  } finally {
    // Closing through CDP lets Chrome stop its profile-writing helpers first.
    let closingBrowser = false;
    if (socket?.readyState === WebSocket.OPEN) {
      try {
        await call("Browser.close");
        closingBrowser = true;
      } catch {
        // A crashed or disconnected browser still needs the process fallback.
      }
    }
    for (const operation of pending.values()) {
      clearTimeout(operation.timer);
      operation.reject(new Error("Browser connection closed."));
    }
    pending.clear();
    socket?.close();
    await stop(chrome, closingBrowser);
    await stop(preview);
    // Chrome helpers can finish profile writes just after its main process exits.
    rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}
