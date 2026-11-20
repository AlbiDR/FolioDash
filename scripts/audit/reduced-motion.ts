// Reduced-motion audit (docs/architecture/cleanstack.md UXC-5): with prefers-reduced-motion set, nothing in the
// real renderer may transition or animate, smooth scrolling is off, and hiding amounts is immediate. Every screen
// of the signed-out synthetic demo is checked at a desktop and a phone width; any finding fails the run.

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import process from "node:process";
import { withLocalBrowser } from "../lib/local-browser.ts";
import { createSteps } from "./interactions/browser-steps.ts";

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
const WIDTHS = [1440, 390] as const;
// Under one millisecond counts as none: it is how a motion rule is switched off without removing it.
const NEGLIGIBLE_MS = 1;

const INSPECT = `(() => {
  const ms = (list) => list.split(",").map((part) => { const s = part.trim(); return s.endsWith("ms") ? parseFloat(s) : parseFloat(s) * 1000; });
  const sig = (el, pseudo) => el.tagName.toLowerCase() + (typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\\s+/).slice(0, 2).join(".") : "") + pseudo;
  const found = new Set();
  for (const el of document.querySelectorAll("*")) {
    for (const pseudo of ["", "::before", "::after"]) {
      const style = getComputedStyle(el, pseudo || null);
      if (style.transitionProperty !== "none" && ms(style.transitionDuration).some((v) => v > ${String(NEGLIGIBLE_MS)})) found.add("transition " + sig(el, pseudo) + " " + style.transitionDuration);
      if (style.animationName !== "none" && ms(style.animationDuration).some((v) => v > ${String(NEGLIGIBLE_MS)})) found.add("animation " + sig(el, pseudo) + " " + style.animationName + " " + style.animationDuration);
    }
  }
  const running = document.getAnimations().filter((a) => a.playState === "running" && a.effect && a.effect.getComputedTiming().activeDuration > ${String(NEGLIGIBLE_MS)}).map((a) => "running " + (a.animationName || a.transitionProperty || "animation"));
  return JSON.stringify({ findings: [...found, ...new Set(running)], smooth: getComputedStyle(document.documentElement).scrollBehavior });
})()`;

const findings: string[] = [];
let checks = 0;

await withLocalBrowser(
  async (browser) => {
    const { call, evaluate } = browser;
    await call("DOM.enable");
    const steps = createSteps(browser);
    for (const route of ROUTES) {
      for (const width of WIDTHS) {
        await steps.visit(route, width);
        await call("Emulation.setEmulatedMedia", {
          features: [
            { name: "prefers-color-scheme", value: "light" },
            { name: "prefers-reduced-motion", value: "reduce" },
          ],
        });
        await delay(700);
        const where = `${route} / ${width < 600 ? "phone" : "desktop"}`;
        const result = JSON.parse((await evaluate(INSPECT)) as string) as { findings: string[]; smooth: string };
        checks += 2;
        for (const finding of result.findings) findings.push(`${where}: ${finding}`);
        if (result.smooth === "smooth") findings.push(`${where}: smooth scrolling stays on`);
        // Hiding amounts is immediate: right after the toggle nothing is transitioning or animating.
        const immediate = (await evaluate(
          `new Promise((done) => { const toggle = document.querySelector(".privacy-toggle"); toggle.click(); requestAnimationFrame(() => requestAnimationFrame(() => { const slow = document.getAnimations().filter((a) => a.effect && a.effect.getComputedTiming().activeDuration > ${String(NEGLIGIBLE_MS)}).length; const hidden = toggle.getAttribute("aria-pressed") === "true"; toggle.click(); done(hidden && slow === 0); })); })`,
        )) as boolean;
        checks += 1;
        if (!immediate) findings.push(`${where}: hiding amounts is not immediate`);
      }
    }
  },
  Number(process.env["FOLIODASH_MOTION_PORT"] ?? 4194),
);

const output = resolve("dist/reduced-motion-audit");
mkdirSync(output, { recursive: true });
writeFileSync(resolve(output, "report.json"), `${JSON.stringify({ checks, findings }, null, 2)}\n`);
if (findings.length > 0) {
  console.error(
    `Reduced-motion audit failed: ${String(findings.length)} findings.\n${findings.slice(0, 40).join("\n")}`,
  );
  process.exit(1);
}
console.log(
  `Reduced-motion audit passed: ${String(ROUTES.length * WIDTHS.length)} screens, ${String(checks)} checks, nothing moves and amounts hide at once.`,
);
