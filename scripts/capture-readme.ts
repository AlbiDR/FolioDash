// Captures only the signed-out synthetic production demo in a fresh local-only browser.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { readFiles, treeDigest, writeCaptureReceipt } from "./prepare-pages.ts";
import { type LocalBrowser, withLocalBrowser } from "./localBrowser.ts";
import { CAPTURED, type CapturedView, type RouteName } from "./readmeViews.ts";

// Opaque surfaces replace frosted glass, which would otherwise show the page behind it through the cards' neighbours.
const TRANSPARENT_CSS = "html,body{background:transparent!important}body::before{display:none!important}:root{--glass:var(--color-surface)!important;--glass-edge:transparent!important;--glass-blur:none!important}.topbar,.main-nav{visibility:hidden!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important}";
const APP = resolve("dist/web");
const OUTPUT = resolve("dist/readme");

async function capture(browser: LocalBrowser, file: string, theme: "light" | "dark", route: RouteName, view: CapturedView, mobile = false): Promise<void> {
  const { call, evaluate, waitFor, origin: ORIGIN } = browser;
  const width = mobile ? 390 : 1440;
  let height = mobile ? 844 : 1120;
  await call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2, mobile });
  await call("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }, { name: "prefers-reduced-motion", value: "reduce" }] });
  const transparent = mobile ? undefined : view.transparent;
  // Without a colour this restores the opaque default for the next capture.
  await call("Emulation.setDefaultBackgroundColorOverride", transparent === undefined ? {} : { color: { r: 0, g: 0, b: 0, a: 0 } });
  const url = `${ORIGIN}/?demo=typical&readme=${encodeURIComponent(file)}${view.hash}`;
  await call("Page.navigate", { url });
  await waitFor(async () => await evaluate(`location.href === ${JSON.stringify(url)} && document.readyState === "complete" && document.querySelector('.privacy-toggle') !== null && ${view.open === undefined ? `document.querySelector('h1')?.textContent === ${JSON.stringify(view.heading)}` : `document.querySelector(${JSON.stringify(view.open)}) !== null`}`) === true, `the ${route} view`);
  if (view.open !== undefined) {
    // A detail screen is reached the way a person reaches it: through the first link the demo offers.
    await evaluate(`document.querySelector(${JSON.stringify(view.open)})?.click()`);
    await waitFor(async () => await evaluate(`location.hash.startsWith('#fund/') && (document.querySelector('h1')?.textContent ?? '') !== '' && document.querySelector('h1')?.textContent !== 'Portfolio'`) === true, `the ${route} detail`);
  }
  await evaluate("document.fonts.ready");
  // These are the app's ordinary controls; the captured DOM and financial values are unchanged.
  await evaluate("(()=>{const toggle=document.querySelector('.privacy-toggle');if(toggle?.getAttribute('aria-pressed')==='true')toggle.click()})()");
  if (route === "expenses") {
    await waitFor(async () => await evaluate("document.querySelector('.expense-entry') !== null") === true, "the expense editor");
    // Previous steps one calendar day, so from a weekend or a Monday it takes up to three steps back to the last invented recorded workday.
    for (let step = 0; step < 4; step++) {
      if (await evaluate("document.querySelector('.expense-entry .expense-state')?.textContent === 'Recorded workday'") === true) break;
      await evaluate("document.querySelector('.expense-date-controls button')?.click()");
      await delay(250);
    }
    await waitFor(async () => await evaluate("document.querySelectorAll('.expense-fields input').length === 5 && document.querySelector('.expense-entry .expense-state')?.textContent === 'Recorded workday'") === true, "a complete invented workday");
  }
  await waitFor(async () => await evaluate("document.querySelector('.privacy-toggle')?.getAttribute('aria-pressed') === 'false' && document.getAnimations().every(animation => animation.playState !== 'running')") === true, "visible demo values and idle rendering");
  await delay(300);
  if (!mobile && transparent === undefined) {
    const rowBottom = await evaluate(`Math.ceil(Math.max(...[...document.querySelectorAll(${JSON.stringify(view.frame ?? "#main-content > *")})].map(element=>element.getBoundingClientRect().bottom))+12)`);
    if (typeof rowBottom !== "number" || !Number.isFinite(rowBottom) || rowBottom < 600) throw new Error("Unexpected screenshot framing.");
    // A long screen is cut at the first 2000 points; the file check bounds the finished image the same way.
    height = Math.min(rowBottom, 2000);
    await call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2, mobile });
    await delay(100);
  }
  // A phone draws the short word "Demo"; the full "Demo data" sentence is then the status control's accessible name.
  const safe = await evaluate(`(()=>{const text=document.body.innerText;const chip=document.querySelector('.status-chip');return (text.includes('Demo data') || (text.includes('Demo') && chip?.getAttribute('aria-label')==='Demo data')) && !text.includes('Synced with Google') && !text.includes('Saved on this device') && document.querySelector('.privacy-toggle')?.getAttribute('aria-pressed')==='false' && ![...document.scripts].some(script=>script.src && new URL(script.src).origin!==location.origin) && document.documentElement.scrollWidth<=innerWidth})()`);
  if (safe !== true) throw new Error("Capture stopped: synthetic-demo, network or rendering checks failed.");
  await evaluate("window.scrollTo(0,0)");
  let clip: Record<string, number> | undefined;
  if (transparent !== undefined) {
    // Applied after the safety checks above, which read the page's visible text. The sidebar and top bar only hide;
    // removing them would reflow the page.
    await evaluate(`(()=>{const style=document.createElement('style');style.textContent=${JSON.stringify(`${TRANSPARENT_CSS}${transparent.hide}{display:none!important}`)};document.head.append(style)})()`);
    await delay(300);
    const box = await evaluate(`(()=>{const rects=[...document.querySelectorAll(${JSON.stringify(transparent.include)})].map(element=>element.getBoundingClientRect());return rects.length===0?null:{left:Math.min(...rects.map(r=>r.left)),top:Math.min(...rects.map(r=>r.top)),right:Math.max(...rects.map(r=>r.right)),bottom:Math.max(...rects.map(r=>r.bottom))}})()`);
    if (typeof box !== "object" || box === null) throw new Error("Unexpected screenshot framing.");
    const { left, top, right, bottom } = box as Record<string, number>;
    if (![left, top, right, bottom].every(value => Number.isFinite(value)) || (bottom ?? 0) - (top ?? 0) < 600) throw new Error("Unexpected screenshot framing.");
    // Room for the cards' shadows, so they are not cut off at the edge of the picture.
    const margin = 36;
    height = Math.min(Math.ceil((bottom ?? 0) - (top ?? 0)) + 2 * margin, 2000);
    await call("Emulation.setDeviceMetricsOverride", { width, height: Math.ceil((bottom ?? 0) + margin + 20), deviceScaleFactor: 2, mobile });
    await delay(200);
    clip = { x: Math.max(0, (left ?? 0) - margin), y: Math.max(0, (top ?? 0) - margin), width: Math.ceil((right ?? 0) - (left ?? 0)) + 2 * margin, height, scale: 1 };
  }
  const screenshot = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true, ...(clip === undefined ? {} : { clip }) });
  if (typeof screenshot["data"] !== "string") throw new Error("Chrome returned no screenshot.");
  writeFileSync(join(OUTPUT, file), Buffer.from(screenshot["data"], "base64"));
  console.log(`Captured ${file}: signed-out demo, ${theme}, ${String(clip === undefined ? width : clip["width"])}x${String(height)}, 2x${clip === undefined ? "" : ", transparent"}.`);
}

// This snapshot predates every browser request; the checked app is never rebuilt.
const appFiles = readFiles(APP);
if (!appFiles.has("index.html") || !appFiles.has("sw.js")) throw new Error("Run npm run verify before capturing README screenshots.");
const appDigest = treeDigest(appFiles);
const revision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
rmSync(OUTPUT, { recursive: true, force: true });
mkdirSync(OUTPUT, { recursive: true });
await withLocalBrowser(async browser => {
  for (const [route, view] of CAPTURED) {
    await capture(browser, `${view.file}-light.png`, "light", route, view);
    await capture(browser, `${view.file}-dark.png`, "dark", route, view);
    if (view.mobile !== undefined) await capture(browser, view.mobile, "dark", route, view, true);
  }
  writeCaptureReceipt(APP, OUTPUT, appDigest, revision);
}, Number(process.env["FOLIODASH_AUDIT_PORT"] ?? 4197));
