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

// Remembered sessions use the production app with synthetic responses held long enough to paint.
await withLocalBrowser(async ({ call, evaluate, origin, waitFor }) => {
  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 900, deviceScaleFactor: 1, mobile: true });
  await call("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
      const clientId = ${JSON.stringify(process.env["VITE_GOOGLE_CLIENT_ID"]?.trim() || "123456-syntheticaudit.apps.googleusercontent.com")};
      const workbook = {id:'synthetic-reload',url:'https://example.invalid/synthetic-reload'};
      localStorage.setItem('foliodash.client.v1',clientId);
      localStorage.setItem('foliodash.ledger.v1',JSON.stringify({
        version:1,workbook,ledger:{revision:'',funds:[],snapshots:[]},syncedAt:Date.now()
      }));
      localStorage.setItem('foliodash.google-session.v1',JSON.stringify({
        accessToken:'synthetic-reload-token',clientId,workbookId:workbook.id,
        validUntil:Date.now()+600000,scope:'https://www.googleapis.com/auth/drive.file'
      }));
      window.google = {accounts:{oauth2:{initTokenClient:()=>({requestAccessToken:()=>{
        window.signInAttempted = true;
      }})}}};
      const fetchLocal = window.fetch;
      window.fetch = async (url, options) => {
        if (!String(url).startsWith('https://sheets.googleapis.com/')) return fetchLocal(url,options);
        if (String(url).includes('/values/_FolioDash%20ledger')) {
          window.ledgerReads = (window.ledgerReads ?? 0) + 1;
          await new Promise(resolve => setTimeout(resolve, 800));
          window.ledgerAnswered = true;
          if (location.search.includes('offline')) throw new TypeError('Synthetic network failure');
          return Response.json({values:[['revision','type','payload','checksum']]});
        }
        return Response.json({sheets:[]});
      };
      window.syncNotices = [];
      new MutationObserver(() => {
        for (const node of document.querySelectorAll('.notice, .status-chip')) {
          if (/Checking Google|Checking your work-expense|Showing your saved device copy|Your saved copy is available/.test(node.textContent)) {
            window.syncNotices.push(node.textContent);
          }
        }
      }).observe(document,{subtree:true,childList:true,characterData:true});
    })()`,
  });
  for (const route of ["expenses", "import", "history"]) {
    await call("Page.navigate", { url: `${origin}/?signed-in=${route}#${route}` });
    for (const type of ["navigate", "reload"]) {
      if (type === "reload") await call("Page.reload", { ignoreCache: true });
      await waitFor(
        async () =>
          (await evaluate(
            `performance.getEntriesByType('navigation')[0]?.type === '${type}' &&
              window.ledgerAnswered === true && !!document.querySelector('.status-chip')`,
          )) === true,
        `${route} ${type} with a remembered Google connection`,
      );
      assert.deepEqual(await evaluate("window.syncNotices"), [], `${route} ${type} stayed quiet before the check`);
      assert.equal(
        await evaluate("document.querySelector('.status-chip').getAttribute('aria-label')"),
        "Google Sheets",
      );
      assert.equal(await evaluate("window.ledgerReads"), 1, `${route} ${type} checked the ledger once`);
      assert.equal(await evaluate("window.signInAttempted === true"), false, `${route} ${type} never opened sign-in`);
    }
  }
  await call("Page.navigate", { url: `${origin}/?offline#expenses` });
  await waitFor(
    async () =>
      (await evaluate(
        "document.querySelector('.status-chip')?.getAttribute('aria-label') === 'Google unavailable · device copy'",
      )) === true,
    "a failed check reports the device copy",
  );
  assert.deepEqual(await evaluate("window.syncNotices"), []);
  assert.equal(await evaluate("window.signInAttempted === true"), false);
}, 4297);
console.log("Remembered Google reloads passed on mobile with synthetic delayed and unavailable responses.");
