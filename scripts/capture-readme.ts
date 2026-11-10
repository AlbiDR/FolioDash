// Captures only the signed-out synthetic production demo in a fresh local-only browser.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { readFiles, treeDigest, writeCaptureReceipt } from "./prepare-pages.ts";
import { type LocalBrowser, withLocalBrowser } from "./localBrowser.ts";

const APP = resolve("dist/web");
const OUTPUT = resolve("dist/readme");

async function capture(browser: LocalBrowser, file: string, theme: "light" | "dark", route: "overview" | "expenses", mobile = false): Promise<void> {
  const { call, evaluate, waitFor, origin: ORIGIN } = browser;
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
  if (!mobile) {
    const rowBottom = await evaluate(`Math.ceil(Math.max(...[...document.querySelectorAll(${JSON.stringify(route === "overview" ? ".hero,.portfolio-trend" : ".expense-entry,.expense-week")})].map(element=>element.getBoundingClientRect().bottom))+Math.min(24,parseFloat(getComputedStyle(document.querySelector('.dash')).rowGap)*0.75))`);
    if (typeof rowBottom !== "number" || !Number.isFinite(rowBottom) || rowBottom < 600 || rowBottom > 1600) throw new Error("Unexpected screenshot framing.");
    height = rowBottom;
    await call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2, mobile });
    await delay(100);
  }
  // A phone draws the short word "Demo"; the full "Demo data" sentence is then the status control's accessible name.
  const safe = await evaluate(`(()=>{const text=document.body.innerText;const chip=document.querySelector('.status-chip');return (text.includes('Demo data') || (text.includes('Demo') && chip?.getAttribute('aria-label')==='Demo data')) && !text.includes('Synced with Google') && !text.includes('Saved on this device') && document.querySelector('.privacy-toggle')?.getAttribute('aria-pressed')==='false' && ![...document.scripts].some(script=>script.src && new URL(script.src).origin!==location.origin) && document.documentElement.scrollWidth<=innerWidth})()`);
  if (safe !== true) throw new Error("Capture stopped: synthetic-demo, network or rendering checks failed.");
  await evaluate("window.scrollTo(0,0)");
  const screenshot = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true });
  if (typeof screenshot["data"] !== "string") throw new Error("Chrome returned no screenshot.");
  writeFileSync(join(OUTPUT, file), Buffer.from(screenshot["data"], "base64"));
  console.log(`Captured ${file}: signed-out demo, ${theme}, ${String(width)}x${String(height)}, 2x.`);
}

// This snapshot predates every browser request; the checked app is never rebuilt.
const appFiles = readFiles(APP);
if (!appFiles.has("index.html") || !appFiles.has("sw.js")) throw new Error("Run npm run verify before capturing README screenshots.");
const appDigest = treeDigest(appFiles);
const revision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
rmSync(OUTPUT, { recursive: true, force: true });
mkdirSync(OUTPUT, { recursive: true });
await withLocalBrowser(async browser => {
  await capture(browser, "hero-light.png", "light", "overview");
  await capture(browser, "hero-dark.png", "dark", "overview");
  await capture(browser, "expenses-light.png", "light", "expenses");
  await capture(browser, "expenses-dark.png", "dark", "expenses");
  await capture(browser, "portfolio-mobile.png", "dark", "overview", true);
  writeCaptureReceipt(APP, OUTPUT, appDigest, revision);
});
