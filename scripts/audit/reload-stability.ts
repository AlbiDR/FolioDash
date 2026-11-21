// Synthetic production renderer, capture visual layout shifts and sampled flow geometry from the first frame.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { withLocalBrowser } from "../lib/local-browser.ts";

const CASES = [
  { route: "overview", selector: ".hero, .portfolio-trend, .chart-svg, .portfolio-explore" },
  { route: "activity", selector: ".activity-list, .activity-totals" },
  { route: "expenses", selector: ".expense-entry, .expense-week, .expense-record" },
  { route: "months", selector: ".month-matrices, .month-matrices .table-scroll" },
] as const;
const WIDTHS = [390, 1024, 1440] as const;
const results: unknown[] = [];

await withLocalBrowser(async ({ call, evaluate, origin, waitFor }) => {
  await call("Emulation.setTimezoneOverride", { timezoneId: "UTC" });
  await call("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "no-preference" }],
  });
  for (const { route, selector } of CASES) {
    const setup = await call("Page.addScriptToEvaluateOnNewDocument", {
      source: `(() => {
        // A Saturday makes the initial weekend notice part of the Expenses regression.
        localStorage.setItem('foliodash.privacy.v1', 'shown');
        const today = Date.parse('2026-11-21T12:00:00Z');
        const NativeDate = Date;
        window.Date = new Proxy(NativeDate, {
          construct: (target, args, newTarget) => Reflect.construct(target, args.length ? args : [today], newTarget),
          get: (target, key, receiver) => key === 'now' ? () => today : Reflect.get(target, key, receiver),
          apply: () => new NativeDate(today).toString(),
        });

        const shifts = [];
        const changes = [];
        const addShifts = entries => shifts.push(...entries.map(entry => ({
          time: entry.startTime, value: entry.value, sources: entry.sources.map(source => source.node?.classList.value),
        })));
        const observer = new PerformanceObserver(list => addShifts(list.getEntries()));
        observer.observe({type:'layout-shift', buffered:true});
        const started = performance.now();
        let firstFrame;
        let initial;
        let sawCounter = false;
        function layoutBox(element) {
          const box = element.getBoundingClientRect();
          let top = box.top + window.scrollY;
          // Subtract the compositor's entrance translation without rounding each offset parent.
          for (let node = element; node; node = node.parentElement) {
            const transform = getComputedStyle(node).transform;
            if (transform !== 'none') top -= new DOMMatrixReadOnly(transform).m42;
          }
          return [top, element.clientWidth, element.clientHeight];
        }
        function sample(time) {
          const panels = [...document.querySelectorAll(${JSON.stringify(selector)})];
          if (panels.length && document.querySelector('.topbar')) {
            firstFrame ??= time;
            sawCounter ||= !!document.querySelector('.hero-value [data-counting]');
            const geometry = panels.map(layoutBox);
            initial ??= geometry;
            // The renderer rounds fractional compositor translations. Compare the unanimated slots within half a CSS pixel.
            const moved = geometry.length !== initial.length || geometry.some(([top, width, height], index) => {
              const [firstTop, firstWidth, firstHeight] = initial[index];
              return Math.abs(top - firstTop) > 0.5 || width !== firstWidth || height !== firstHeight;
            });
            if (moved) changes.push({time, before: initial, after: geometry});
          }
          if ((firstFrame !== undefined && time - firstFrame >= 1000) || time - started >= 4500) {
            addShifts(observer.takeRecords());
            observer.disconnect();
            window.reloadEvidence = {
              firstFrame, shifts, changes, sawCounter,
              type: performance.getEntriesByType('navigation')[0]?.type,
              plot: document.querySelector('.chart-svg')?.getAttribute('viewBox'),
            };
            return;
          }
          requestAnimationFrame(sample);
        }
        requestAnimationFrame(sample);
      })()`,
    });
    for (const width of WIDTHS) {
      await call("Emulation.setDeviceMetricsOverride", {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: width < 600,
      });
      for (const type of ["navigate", "reload"] as const) {
        if (type === "navigate") {
          await call("Page.navigate", { url: `${origin}/?reload-audit=${String(width)}#${route}` });
        } else {
          await call("Page.reload", { ignoreCache: true });
        }
        await waitFor(
          async () => (await evaluate(`window.reloadEvidence?.type === ${JSON.stringify(type)}`)) === true,
          `${route} ${type} at ${String(width)}px`,
        );
        const evidence = (await evaluate("window.reloadEvidence")) as {
          firstFrame?: number;
          shifts: unknown[];
          changes: unknown[];
          sawCounter: boolean;
          plot?: string;
        };
        const label = `${route} ${type} at ${String(width)}px`;
        assert.ok(evidence.firstFrame !== undefined, `${label}: route content rendered`);
        assert.deepEqual(evidence.shifts, [], `${label}: zero layout shifts`);
        assert.deepEqual(evidence.changes, [], `${label}: stable flow geometry from the first frame`);
        if (route === "overview") assert.ok(evidence.sawCounter, `${label}: headline counted during sampling`);
        if (route === "overview" && width === 390) {
          assert.ok(evidence.plot?.endsWith(" 200"), `${label}: compact plot at first render`);
        }
        results.push({ route, type, width, ...evidence });
      }
    }
    await call("Page.removeScriptToEvaluateOnNewDocument", { identifier: setup["identifier"] });
  }
}, 4297);

const output = resolve("dist/reload-stability");
mkdirSync(output, { recursive: true });
writeFileSync(resolve(output, "report.json"), `${JSON.stringify(results, null, 2)}\n`);
console.log(`Reload stability passed: ${String(results.length)} cold opens and reloads with zero layout shifts.`);
