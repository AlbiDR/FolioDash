// Computed motion styles of the actual production renderer, for proving that a stylesheet move changes nothing on screen
// (docs/design/polished-by-default.md, phase 3). Every element on every screen is read at rest, at 1440 and 390 px and
// under reduced motion, and every control again with hover, keyboard focus and press forced on it.
//   npm run audit:motion-snapshot -- <out.json>              write a snapshot of the current build
//   npm run audit:motion-snapshot -- --compare <a.json> <b.json>   list every difference; fails if there is one
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { type LocalBrowser, withLocalBrowser } from "../../lib/local-browser.ts";

type Snapshot = Record<string, string>;

/** CSS repeats a shorter transition or animation list to the length of its property or name list, so one curve and
 * the same curve written once per property are the same style. Compare them expanded. */
function normalise(reading: string | undefined): string | undefined {
  if (reading === undefined) return undefined;
  const fields = new Map(
    reading.split("; ").map((field) => {
      const at = field.indexOf("=");
      return [field.slice(0, at), field.slice(at + 1)] as const;
    }),
  );
  const split = (value: string): string[] => value.split(/,(?![^(]*\))/).map((part) => part.trim());
  for (const [leader, family] of [
    ["transition-property", "transition-"],
    ["animation-name", "animation-"],
  ] as const) {
    const length = split(fields.get(leader) ?? "").length;
    for (const [name, value] of fields) {
      if (!name.startsWith(family) || name === leader) continue;
      const parts = split(value);
      fields.set(name, Array.from({ length }, (_, index) => parts[index % parts.length]).join(", "));
    }
  }
  // A transition that takes no time and has no delay does nothing, whatever its curve.
  if (
    split(fields.get("transition-duration") ?? "").every((d) => d === "0s") &&
    split(fields.get("transition-delay") ?? "").every((d) => d === "0s")
  ) {
    fields.delete("transition-timing-function");
  }
  // With no animation named, the other animation longhands do nothing either.
  if (fields.get("animation-name") === "none") fields.delete("animation-timing-function");
  return [...fields].map(([name, value]) => `${name}=${value}`).join("; ");
}

const args = process.argv.slice(2);
if (args[0] === "--compare") {
  const [a, b] = [args[1], args[2]].map((path) => JSON.parse(readFileSync(String(path), "utf8")) as Snapshot);
  if (a === undefined || b === undefined) throw new Error("Usage: --compare <a.json> <b.json>");
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  const differences = keys.filter((key) => normalise(a[key]) !== normalise(b[key]));
  for (const key of differences.slice(0, 200))
    console.log(`${key}\n  - ${a[key] ?? "(absent)"}\n  + ${b[key] ?? "(absent)"}`);
  if (differences.length > 0) {
    console.error(`Motion snapshot differs in ${String(differences.length)} of ${String(keys.length)} readings.`);
    process.exit(1);
  }
  console.log(`Motion snapshots match: ${String(keys.length)} readings.`);
  process.exit(0);
}
const out = resolve(args[0] ?? "dist/motion-snapshot/snapshot.json");

const ROUTES = ["overview", "months", "checkpoints", "expenses", "activity", "import", "history", "connection"];
const CONTROLS =
  "button, a[href], summary, input, select, textarea, [role='button'], [role='tab'], [role='switch'], [role='checkbox'], [tabindex]:not([tabindex='-1'])";
const PROPERTIES = [
  "transition-property",
  "transition-duration",
  "transition-timing-function",
  "transition-delay",
  "animation-name",
  "animation-duration",
  "animation-timing-function",
  "animation-delay",
  "animation-fill-mode",
  "animation-iteration-count",
  "transform",
  "scale",
  "translate",
  "rotate",
  "opacity",
];

// In the page: a stable address for an element (its index path, as the markup does not change between two builds) and
// its motion styles, for the element and, for a control, its descendants.
const READ = `function (withChildren) {
  const properties = ${JSON.stringify(PROPERTIES)};
  const path = (element) => {
    const parts = [];
    for (let node = element; node && node.parentElement; node = node.parentElement) {
      parts.unshift(node.tagName.toLowerCase() + ':' + [...node.parentElement.children].indexOf(node));
    }
    return parts.join('/');
  };
  const read = (element) => { const style = getComputedStyle(element); return properties.map((p) => p + '=' + style.getPropertyValue(p)).join('; '); };
  // A forced state starts its transitions; read where they end, not wherever they happen to be.
  for (const animation of this.getAnimations({ subtree: true })) {
    if (animation.effect?.getComputedTiming().endTime !== Infinity) animation.finish();
  }
  const result = {};
  const elements = withChildren ? [this, ...this.querySelectorAll('*')] : [this];
  for (const element of elements) result[path(element)] = read(element);
  return result;
}`;

async function settle({ evaluate, waitFor }: LocalBrowser): Promise<void> {
  await waitFor(
    async () =>
      (await evaluate(
        "document.getAnimations().every(a => a.playState !== 'running' || a.effect?.getComputedTiming().endTime === Infinity) && !document.querySelector('[data-counting]')",
      )) === true,
    "motion settles",
  );
}

const snapshot: Snapshot = {};

await withLocalBrowser(async (browser) => {
  const { call, evaluate, origin, waitFor } = browser;
  await call("Emulation.setTimezoneOverride", { timezoneId: "UTC" });
  await call("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
      localStorage.setItem('foliodash.privacy.v1', 'shown');
      localStorage.setItem('foliodash.client.v1', '123456-syntheticaudit.apps.googleusercontent.com');
      const today = Date.parse('2026-11-18T12:00:00Z');
      const NativeDate = Date;
      window.Date = new Proxy(NativeDate, {
        construct: (target, args, newTarget) => Reflect.construct(target, args.length ? args : [today], newTarget),
        get: (target, key, receiver) => key === 'now' ? () => today : Reflect.get(target, key, receiver),
        apply: () => new NativeDate(today).toString(),
      });
    })();`,
  });
  await call("DOM.enable");
  await call("CSS.enable");
  const cases = [
    { width: 1440, motion: "no-preference", states: true },
    { width: 390, motion: "no-preference", states: true },
    { width: 1440, motion: "reduce", states: false },
  ];
  for (const { width, motion, states } of cases) {
    await call("Emulation.setDeviceMetricsOverride", {
      width,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: width < 600,
    });
    await call("Emulation.setEmulatedMedia", {
      features: [
        { name: "prefers-color-scheme", value: "light" },
        { name: "prefers-reduced-motion", value: motion },
      ],
    });
    for (const route of ROUTES) {
      const url = `${origin}/?demo=typical&snapshot=${route}-${String(width)}-${motion}#${route}`;
      await call("Page.navigate", { url });
      await waitFor(
        async () =>
          (await evaluate(
            `location.href===${JSON.stringify(url)} && document.readyState==='complete' && !!document.querySelector('#main-content :is(.dash,.screen,.account,.import,.get-started)') && !document.querySelector('#main-content .notice[data-busy=true]')`,
          )) === true,
        `${route} loads`,
      );
      await evaluate("document.querySelectorAll('details').forEach((d) => { d.open = true; })");
      await settle(browser);
      const prefix = `${String(width)}/${motion}/${route}`;
      const rest = (await evaluate(`(${READ}).call(document.body, true)`)) as Snapshot;
      for (const [key, value] of Object.entries(rest)) snapshot[`${prefix}/rest/${key}`] = value;
      if (!states) continue;
      const { root } = (await call("DOM.getDocument", { depth: 0 })) as { root: { nodeId: number } };
      const { nodeIds } = (await call("DOM.querySelectorAll", { nodeId: root.nodeId, selector: CONTROLS })) as {
        nodeIds: number[];
      };
      for (const nodeId of nodeIds) {
        const { object } = (await call("DOM.resolveNode", { nodeId })) as { object: { objectId?: string } };
        if (object.objectId === undefined) continue;
        for (const state of ["hover", "focus-visible", "active"]) {
          await call("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: [state] });
          await delay(0);
          const reading = (await call("Runtime.callFunctionOn", {
            objectId: object.objectId,
            functionDeclaration: READ,
            arguments: [{ value: true }],
            returnByValue: true,
          })) as { result: { value: Snapshot } };
          for (const [key, value] of Object.entries(reading.result.value)) {
            snapshot[`${prefix}/${state}/${key}`] = value;
          }
        }
        await call("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: [] });
      }
    }
  }
}, 4219);

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(snapshot, null, 1)}\n`);
console.log(`Motion snapshot written: ${String(Object.keys(snapshot).length)} readings in ${out}.`);
