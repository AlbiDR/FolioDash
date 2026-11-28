// Page overflow audit: the page itself never scrolls sideways, and a wide table scrolls inside its own region. It runs
// the production build in Playwright's Chromium (Google Chrome), Firefox and WebKit, in dark and light, at six widths
// from a phone (375px) to a large desktop (320px joins once the period selector reflows there), on the screens that
// hold wide tables (Month by month, Portfolio, a Fund) and on Your data. It uses the synthetic demo only and blocks every network request that is not the local server.
//
// Three assertions per screen, width and scheme:
//   1. the document is no wider than the window (scrollWidth <= clientWidth);
//   2. every table wider than the box around it sits inside a region that scrolls sideways on its own;
//   3. no box reaches past the right edge of the window unless an ancestor clips or scrolls it. That covers sticky
//      cells, the edge drawn beside a pinned column, negative margins and anything sized in viewport units.
// A separate scan fails if a stylesheet sizes anything in viewport width units (`100vw` and its siblings), which is the
// usual way a page grows by the width of a scrollbar.

import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import process from "node:process";
import { type BrowserType, type Page, chromium, firefox, webkit } from "playwright";

const ROOT = resolve("dist/web");
const SOURCE = resolve("src");
const WIDTHS = [375, 768, 1024, 1280, 1440, 1920] as const;
const SCHEMES = ["dark", "light"] as const;
const ROUTES = ["months", "overview", "fund/XSDEMOEQ0008", "connection"] as const;
const TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain",
};
const chrome = process.env["CHROME_PATH"] === undefined ? { channel: "chrome" } : {};
const ENGINES: readonly { readonly name: string; readonly type: BrowserType; readonly launch: { channel?: string } }[] =
  [
    { name: "Chrome", type: chromium, launch: chrome },
    { name: "Firefox", type: firefox, launch: {} },
    { name: "Safari engine", type: webkit, launch: {} },
  ];

/** What the page reports: the sizes, the tables that are not contained, and the boxes that pass the right edge. */
const MEASURE = `(() => {
  const root = document.documentElement;
  const width = root.clientWidth;
  const clips = (value) => value === "auto" || value === "scroll" || value === "hidden" || value === "clip";
  const scrolls = (value) => value === "auto" || value === "scroll";
  const nearest = (element) => {
    for (let parent = element.parentElement; parent !== null; parent = parent.parentElement) {
      if (parent === document.body || parent === root) return null;
      if (clips(getComputedStyle(parent).overflowX)) return parent;
    }
    return null;
  };
  const label = (element) => element.tagName.toLowerCase() + "." + String(element.className).split(" ")[0];
  const uncontained = [];
  for (const table of document.querySelectorAll("table")) {
    const box = table.getBoundingClientRect();
    if (box.width === 0) continue;
    const region = nearest(table);
    const room = region === null ? width : region.clientWidth;
    if (box.width <= room + 0.5) continue;
    if (region === null || !scrolls(getComputedStyle(region).overflowX)) uncontained.push(label(table) + " " + Math.round(box.width) + ">" + Math.round(room));
  }
  const past = [];
  for (const element of document.body.querySelectorAll("*")) {
    const box = element.getBoundingClientRect();
    if (box.width <= 1 || box.height <= 1) continue;
    if (box.right <= width + 0.5) continue;
    if (getComputedStyle(element).position === "fixed") continue;
    if (nearest(element) !== null) continue;
    past.push(label(element) + " right=" + Math.round(box.right));
  }
  return { width, scrollWidth: root.scrollWidth, uncontained, past: past.slice(0, 6) };
})()`;

interface Measurement {
  readonly width: number;
  readonly scrollWidth: number;
  readonly uncontained: readonly string[];
  readonly past: readonly string[];
}

const server = createServer((request, response) => {
  const path = normalize(decodeURIComponent(new URL(request.url ?? "/", "http://x").pathname)).replace(
    /^(\.\.[/\\])+/u,
    "",
  );
  let file = join(ROOT, path);
  if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) file = join(ROOT, "index.html");
  response.setHeader("content-type", TYPES[extname(file)] ?? "application/octet-stream");
  createReadStream(file).pipe(response);
});
await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
const address = server.address();
const origin = `http://127.0.0.1:${String(typeof address === "object" && address !== null ? address.port : 0)}`;

const findings: string[] = [];
let checks = 0;
function expectThat(condition: boolean, label: string, where: string): void {
  checks += 1;
  if (!condition) findings.push(`${where}: ${label}`);
}

async function measure(page: Page, route: string, where: string): Promise<void> {
  await page.evaluate((target) => {
    location.hash = target;
  }, route);
  await delay(900);
  // Disclosures hold wide tables too (the chart values), so they are opened for the measurement.
  await page.evaluate("document.querySelectorAll('details').forEach((details) => { details.open = true; })");
  await delay(300);
  const found = await page.evaluate<Measurement>(MEASURE);
  const here = `${where}, ${route}`;
  expectThat(
    found.scrollWidth <= found.width,
    `the page is ${String(found.scrollWidth)}px wide in a ${String(found.width)}px window`,
    here,
  );
  expectThat(
    found.uncontained.length === 0,
    `tables not inside a sideways scroller: ${found.uncontained.join("; ")}`,
    here,
  );
  expectThat(found.past.length === 0, `boxes past the right edge: ${found.past.join("; ")}`, here);
  if (route !== "months") return;
  // A statement dated off the usual mid-month day gets its date as visually hidden text in its column header
  // (features/overview/months-parts.tsx). That text is absolutely positioned, so unless the scroller around the table is
  // its containing block it escapes the scroller and widens the page by the width of the table (reported on 2026-11-28 for a
  // history of 86 statements). The synthetic demo has none, so the same markup is added to every statement column.
  await page.evaluate(`for (const th of document.querySelectorAll('.matrix thead th:nth-child(n + 3)')) {
    const note = document.createElement('span');
    note.className = 'visually-hidden';
    note.textContent = ', statement dated 1 September';
    th.append(note);
  }`);
  await delay(200);
  const irregular = await page.evaluate<Measurement>(MEASURE);
  expectThat(
    irregular.scrollWidth <= irregular.width,
    `with hidden date text in every statement column the page is ${String(irregular.scrollWidth)}px wide in a ${String(irregular.width)}px window`,
    here,
  );
}

try {
  for (const engine of ENGINES) {
    const browser = await engine.type.launch({ headless: true, ...engine.launch });
    for (const scheme of SCHEMES) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        colorScheme: scheme,
        serviceWorkers: "block",
      });
      await context.route("**/*", (route) =>
        route.request().url().startsWith(origin) ? route.continue() : route.abort(),
      );
      const page = await context.newPage();
      await page.goto(`${origin}/#overview`);
      await delay(1200);
      // The first-run notice shifts every page by the same amount and says nothing about overflow, so it is dismissed.
      await page.evaluate(
        "[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Dismiss')?.click()",
      );
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        await delay(300);
        for (const route of ROUTES) await measure(page, route, `${engine.name}, ${scheme}, ${String(width)}px`);
      }
      await context.close();
    }
    await browser.close();
  }
} finally {
  server.close();
}

// The stylesheets never size anything in viewport width units: a page sized to 100vw is as wide as the window plus a
// scrollbar, and scrolls sideways on every engine that draws one.
function stylesheets(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return stylesheets(path);
    return entry.name.endsWith(".css") ? [path] : [];
  });
}
for (const sheet of stylesheets(SOURCE)) {
  const text = readFileSync(sheet, "utf8").replace(/\/\*[\s\S]*?\*\//gu, "");
  expectThat(
    !/(?<![\d.])100[dsl]?vw\b/u.test(text),
    "a stylesheet sizes something at 100vw",
    sheet.replace(`${SOURCE}/`, "src/"),
  );
}

if (findings.length > 0) {
  console.error(
    `Page overflow audit failed: ${String(findings.length)} of ${String(checks)} checks.\n${findings.slice(0, 40).join("\n")}`,
  );
  process.exit(1);
}
console.log(
  `Page overflow audit passed: ${String(checks)} checks across ${String(ENGINES.length)} engines, ${String(SCHEMES.length)} schemes, ${String(WIDTHS.length)} widths and ${String(ROUTES.length)} screens; no page scrolls sideways and every wide table scrolls inside its own region.`,
);
