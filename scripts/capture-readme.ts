// Captures only the signed-out synthetic demo, with a fresh browser profile and
// all network requests restricted to the local preview of the already-checked app.
// Run after `npm run verify`. Requires Google Chrome, or CHROME_PATH.
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { stripVTControlCharacters } from "node:util";
import { readFiles, treeDigest, writeCaptureReceipt } from "./prepare-pages.ts";

const APP_PORT = 4197;
const ORIGIN = `http://127.0.0.1:${String(APP_PORT)}`;
const APP = resolve("dist/web");
const OUTPUT = resolve("dist/readme");
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
  if (response["exceptionDetails"] !== undefined) throw new Error("Screenshot readiness check failed in the browser.");
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

async function stop(child: ChildProcess | undefined): Promise<void> {
  if (child === undefined || child.pid === undefined || child.exitCode !== null) return;
  await new Promise<void>((resolveExit) => {
    const timer = setTimeout(() => { child.kill("SIGKILL"); }, 1500);
    child.once("exit", () => { clearTimeout(timer); resolveExit(); });
    child.kill();
  });
}

async function capture(file: string, theme: "light" | "dark", route: "overview" | "expenses", mobile = false): Promise<void> {
  const width = mobile ? 390 : 1440;
  let height = mobile ? 844 : 1120;
  await call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2, mobile });
  await call("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }, { name: "prefers-reduced-motion", value: "reduce" }] });
  const url = `${ORIGIN}/?demo=typical&readme=${encodeURIComponent(file)}#${route}`;
  await call("Page.navigate", { url });
  await waitFor(async () => await evaluate(`location.href === ${JSON.stringify(url)} && document.readyState === "complete" && document.querySelector('.privacy-toggle') !== null && document.querySelector('h1')?.textContent === ${JSON.stringify(route === "overview" ? "Portfolio" : "Work expenses")}`) === true, "the synthetic demo");
  await evaluate("document.fonts.ready");
  // These are the app's ordinary controls; the captured DOM and financial values are unchanged.
  await evaluate("(()=>{const toggle=document.querySelector('.privacy-toggle');if(toggle?.getAttribute('aria-pressed')==='true')toggle.click()})()");
  if (route === "expenses") {
    await waitFor(async () => await evaluate("document.querySelector('.expense-entry') !== null") === true, "the expense editor");
    await evaluate("document.querySelector('.expense-date-controls button')?.click()");
    await waitFor(async () => await evaluate("document.querySelectorAll('.expense-fields input').length === 5 && document.querySelector('.expense-entry .expense-state')?.textContent === 'Recorded workday'") === true, "a complete invented workday");
  }
  await waitFor(async () => await evaluate("document.querySelector('.privacy-toggle')?.getAttribute('aria-pressed') === 'false' && document.getAnimations().every(animation => animation.playState !== 'running')") === true, "visible demo values and idle rendering");
  await delay(300);
  if (!mobile) {
    const rowBottom = await evaluate(`Math.ceil(Math.max(...[...document.querySelectorAll(${JSON.stringify(route === "overview" ? ".hero,.portfolio-trend" : ".expense-entry,.expense-week")})].map(element=>element.getBoundingClientRect().bottom))+Math.min(24,parseFloat(getComputedStyle(document.querySelector('.dash')).rowGap)*0.75))`);
    if (typeof rowBottom !== "number" || !Number.isFinite(rowBottom) || rowBottom < 600 || rowBottom > 1600) throw new Error("Unexpected screenshot framing.");
    height = rowBottom;
    await call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2, mobile });
    await delay(100);
  }
  const safe = await evaluate(`(()=>{const text=document.body.innerText;return text.includes('Demo data') && !text.includes('Synced with Google') && !text.includes('Saved on this device') && document.querySelector('.privacy-toggle')?.getAttribute('aria-pressed')==='false' && ![...document.scripts].some(script=>script.src && new URL(script.src).origin!==location.origin) && document.documentElement.scrollWidth<=innerWidth})()`);
  if (safe !== true || browserErrors.length > 0 || blockedOrigins.size > 0) throw new Error("Capture stopped: synthetic-demo, network or rendering checks failed.");
  await evaluate("window.scrollTo(0,0)");
  const screenshot = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true });
  if (typeof screenshot["data"] !== "string") throw new Error("Chrome returned no screenshot.");
  writeFileSync(join(OUTPUT, file), Buffer.from(screenshot["data"], "base64"));
  console.log(`Captured ${file}: signed-out demo, ${theme}, ${String(width)}x${String(height)}, 2x.`);
}

try {
  // This snapshot predates every browser request; the checked app is never rebuilt.
  const appFiles = readFiles(APP);
  if (!appFiles.has("index.html") || !appFiles.has("sw.js")) throw new Error("Run npm run verify before capturing README screenshots.");
  const appDigest = treeDigest(appFiles);
  const revision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  rmSync(OUTPUT, { recursive: true, force: true });
  mkdirSync(OUTPUT, { recursive: true });
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
  await capture("hero-light.png", "light", "overview");
  await capture("hero-dark.png", "dark", "overview");
  await capture("expenses-light.png", "light", "expenses");
  await capture("expenses-dark.png", "dark", "expenses");
  await capture("portfolio-mobile.png", "dark", "overview", true);
  writeCaptureReceipt(APP, OUTPUT, appDigest, revision);
} finally {
  for (const operation of pending.values()) {
    clearTimeout(operation.timer);
    operation.reject(new Error("Browser connection closed."));
  }
  pending.clear();
  socket?.close();
  await stop(chrome);
  await stop(preview);
  // Chrome helpers can finish profile writes just after its main process exits.
  rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
