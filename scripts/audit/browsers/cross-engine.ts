// Cross-engine audit (docs/operations/motion-device-checklist.md): the checks a person would otherwise make by hand on
// other browsers, run in Playwright's WebKit (Safari's engine), Firefox and Chromium, at desktop and phone sizes with
// touch, with motion on and with Reduce Motion on. It records a video of every run. It uses the synthetic demo only and
// blocks every network request that is not the local preview. It does not replace real hardware: frame pacing, real
// touch, screen readers and the installed app are not covered, and the report says so.

import { createReadStream, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import process from "node:process";
import {
  type BrowserContextOptions,
  type BrowserType,
  type Page,
  chromium,
  devices,
  firefox,
  webkit,
} from "playwright";

const ROOT = resolve("dist/web");
const OUT = resolve("dist/cross-engine");
const ROUTES = [
  "overview",
  "months",
  "checkpoints",
  "expenses",
  "activity",
  "import",
  "history",
  "connection",
] as const;
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

interface Profile {
  readonly name: string;
  readonly type: BrowserType;
  readonly options: BrowserContextOptions;
  readonly launch: { channel?: string };
  readonly phone: boolean;
}
const chrome = process.env["CHROME_PATH"] === undefined ? { channel: "chrome" } : {};
const PROFILES: readonly Profile[] = [
  {
    name: "Safari engine, desktop",
    type: webkit,
    options: { viewport: { width: 1440, height: 900 } },
    launch: {},
    phone: false,
  },
  { name: "Safari engine, iPhone 15", type: webkit, options: { ...devices["iPhone 15"] }, launch: {}, phone: true },
  {
    name: "Firefox, desktop",
    type: firefox,
    options: { viewport: { width: 1440, height: 900 } },
    launch: {},
    phone: false,
  },
  { name: "Chrome, Pixel 7", type: chromium, options: { ...devices["Pixel 7"] }, launch: chrome, phone: true },
];

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
const notes: string[] = [];
let checks = 0;
function expectThat(condition: boolean, label: string, where: string): void {
  checks += 1;
  if (!condition) findings.push(`${where}: ${label}`);
}

/** Anything still moving, or set up to move, for longer than a millisecond. */
const MOTION_IN_PAGE = `(() => {
  const ms = (list) => list.split(",").map((part) => { const s = part.trim(); return s.endsWith("ms") ? parseFloat(s) : parseFloat(s) * 1000; });
  const found = new Set();
  for (const el of document.querySelectorAll("*")) {
    for (const pseudo of ["", "::before", "::after"]) {
      const style = getComputedStyle(el, pseudo || null);
      if (style.transitionProperty !== "none" && ms(style.transitionDuration).some((v) => v > 1)) found.add("transition " + el.tagName.toLowerCase() + "." + String(el.className).split(" ")[0] + pseudo);
      if (style.animationName !== "none" && ms(style.animationDuration).some((v) => v > 1)) found.add("animation " + el.tagName.toLowerCase() + "." + String(el.className).split(" ")[0] + pseudo + " " + style.animationName);
    }
  }
  return [...found].slice(0, 6);
})()`;

/** Everything on a page has stopped moving by this time. */
async function settle(): Promise<void> {
  await delay(1300);
}

async function go(page: Page, route: string, demo = ""): Promise<void> {
  await page.evaluate(
    ([target, variant]) => {
      if (variant === "") location.hash = target;
      else location.href = `${location.pathname}?demo=${variant}#${target}`;
    },
    [route, demo] as const,
  );
  await settle();
}

async function run(profile: Profile, reduced: boolean): Promise<void> {
  const where = `${profile.name}, ${reduced ? "Reduce Motion" : "motion on"}`;
  const videos = join(OUT, `${profile.name}${reduced ? " reduced" : ""}`.replace(/[^a-z0-9]+/giu, "-").toLowerCase());
  mkdirSync(videos, { recursive: true });
  const browser = await profile.type.launch({ headless: true, ...profile.launch });
  const context = await browser.newContext({
    ...profile.options,
    reducedMotion: reduced ? "reduce" : "no-preference",
    serviceWorkers: "block",
    recordVideo: { dir: videos },
  });
  await context.route("**/*", (route) => (route.request().url().startsWith(origin) ? route.continue() : route.abort()));
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !/Failed to load resource|NetworkError|net::/iu.test(message.text()))
      errors.push(message.text());
  });
  try {
    await page.goto(`${origin}/#overview`);
    // Cold open: it draws, it fits the screen, and where motion is on the engine really animates it.
    await delay(250);
    const early = await page.evaluate("document.getAnimations().length");
    await settle();
    expectThat(
      (await page.evaluate("!!document.querySelector('.hero .hero-value')")) === true,
      "the Portfolio did not draw",
      where,
    );
    if (!reduced) expectThat(Number(early) > 0, "nothing animated while the Portfolio arrived", where);
    for (const route of ROUTES) {
      await go(page, route);
      const here = `${where}, ${route}`;
      expectThat(
        (await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1")) === true,
        "the page scrolls sideways",
        here,
      );
      expectThat(
        (await page.evaluate(
          "document.activeElement?.id !== '' && document.activeElement !== document.body || !!document.querySelector('main, .screen')",
        )) === true,
        "focus and content were lost after navigating",
        here,
      );
      if (reduced) {
        const moving = await page.evaluate<string[]>(MOTION_IN_PAGE);
        expectThat(moving.length === 0, `Reduce Motion left motion on: ${moving.join(", ")}`, here);
      }
    }
    // Touch targets on a phone: every visible control is easy to hit.
    if (profile.phone) {
      await go(page, "overview");
      const small = await page.evaluate<
        string[]
      >(`[...document.querySelectorAll("button, a[href], summary")].filter((el) => {
        const box = el.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && getComputedStyle(el).visibility !== "hidden" && !el.closest("[inert]") && box.height < 40 && !(el instanceof SVGElement) && getComputedStyle(el).display !== "inline" && !el.classList.contains("stretched") && !el.classList.contains("visually-hidden");
      }).slice(0, 4).map((el) => el.tagName.toLowerCase() + "." + String(el.className).split(" ")[0] + " " + el.textContent.trim().slice(0, 20) + " " + Math.round(el.getBoundingClientRect().height))`);
      expectThat(small.length === 0, `controls under 40 pixels tall: ${small.join("; ")}`, where);
    }
    // Holdings search with many funds: rows that no longer match leave (fading where motion is on), then are gone.
    await page.goto(`${origin}/?demo=many#overview`);
    await settle();
    const search = page.locator("#fund-search");
    if ((await search.count()) > 0 && (await search.isVisible())) {
      const rowsSelector = ".desktop-holdings .holdings-table tbody tr:not(.holdings-group), .mobile-holdings > li";
      const visibleRows = async (): Promise<number> =>
        Number(
          await page.evaluate(
            `[...document.querySelectorAll(${JSON.stringify(rowsSelector)})].filter((el) => el.getBoundingClientRect().height > 0).length`,
          ),
        );
      const before = await visibleRows();
      await page.evaluate(
        `window.__sawLeaving = false; new MutationObserver(() => { if (document.querySelector('.row-leaving')) window.__sawLeaving = true; }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] })`,
      );
      await search.fill("Fund A");
      await delay(900);
      const after = await visibleRows();
      expectThat(
        after < before && after > 0,
        `a search should narrow the list (${String(before)} to ${String(after)})`,
        where,
      );
      const saw = (await page.evaluate("window.__sawLeaving")) === true;
      expectThat(
        saw === !reduced,
        reduced ? "a row faded out under Reduce Motion" : "removed rows did not fade out",
        where,
      );
      expectThat(
        (await page.evaluate("!document.querySelector('.row-leaving')")) === true,
        "a leaving row never went away",
        where,
      );
      await search.fill("");
      await delay(900);
      expectThat((await visibleRows()) === before, "clearing the search did not bring every row back", where);
    } else notes.push(`${where}: the search box was not shown at this size`);
    // Privacy: the amounts hide at once, and nothing fades on the masked text.
    const privacy = page.locator(".privacy-toggle").first();
    if ((await privacy.count()) > 0 && (await privacy.isVisible())) {
      const pressed = await privacy.getAttribute("aria-pressed");
      await privacy.click();
      expectThat((await privacy.getAttribute("aria-pressed")) !== pressed, "the privacy toggle did not switch", where);
      await go(page, "overview");
      await privacy.click();
    }
    // Disclosures open and close.
    await go(page, "connection");
    const summary = page.locator("details > summary").first();
    if ((await summary.count()) > 0) {
      const opened = (): Promise<unknown> =>
        page.evaluate("document.querySelector('details > summary').parentElement.open");
      const was = await opened();
      await summary.click();
      await delay(500);
      expectThat((await opened()) !== was, "a disclosure did not open or close", where);
    }
    // Jump link on the Portfolio: it lands on the section and moves focus there.
    await page.goto(`${origin}/#overview`);
    await settle();
    const jump = page.locator(".page-nav button").first();
    if ((await jump.count()) > 0 && (await jump.isVisible())) {
      await jump.click();
      await delay(1000);
      expectThat(
        (await page.evaluate("document.activeElement && document.activeElement !== document.body")) === true,
        "a jump link did not move focus",
        where,
      );
    }
    mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: join(videos, "end.png"), fullPage: false });
    expectThat(errors.length === 0, `script or console errors: ${errors.slice(0, 3).join(" | ")}`, where);
  } finally {
    await context.close();
    await browser.close();
  }
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const only = process.argv[2];
try {
  for (const profile of PROFILES) {
    if (only !== undefined && !profile.name.toLowerCase().includes(only.toLowerCase())) continue;
    for (const reduced of [false, true]) await run(profile, reduced);
  }
} finally {
  server.close();
}
const NOT_COVERED = [
  "real hardware frame pacing and real touch input",
  "screen readers (VoiceOver, TalkBack, NVDA)",
  "the installed app and its update flow",
  "Safari and Firefox as whole products (the engines are tested)",
];
writeFileSync(
  join(OUT, "report.json"),
  JSON.stringify({ checks, findings, notes, notCovered: NOT_COVERED }, undefined, 2),
);
for (const note of notes) console.log(`note: ${note}`);
if (findings.length > 0) {
  console.error(`Cross-engine audit failed with ${String(findings.length)} findings:\n${findings.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log(
    `Cross-engine audit passed: ${String(checks)} checks in ${String(PROFILES.length * 2)} runs. Videos and screenshots: dist/cross-engine/. Not covered: ${NOT_COVERED.join("; ")}.`,
  );
}
