// Navigation and assertion steps shared by every journey.
import { setTimeout as delay } from "node:timers/promises";
import type { LocalBrowser } from "../../lib/local-browser.ts";
import { counters } from "./state.ts";
import type { surveyStates } from "./survey.ts";

export type JourneyContext = LocalBrowser & ReturnType<typeof createSteps> & ReturnType<typeof surveyStates>;

export function createSteps({ origin, call, evaluate, waitFor }: LocalBrowser) {
  const check = async (expression: string, label: string): Promise<void> => {
    if ((await evaluate(expression)) !== true) throw new Error(`Interaction regression: ${label}`);
    counters.assertions++;
  };
  const visit = async (route: string, width = 1440, variant = "typical"): Promise<void> => {
    await call("Emulation.setDeviceMetricsOverride", {
      width,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: width < 600,
    });
    await call("Emulation.setTouchEmulationEnabled", { enabled: width < 600 });
    await call("Emulation.setEmulatedMedia", {
      features: [
        { name: "prefers-color-scheme", value: "light" },
        { name: "prefers-reduced-motion", value: "no-preference" },
      ],
    });
    const url = `${origin}/?demo=${variant}#${route}`;
    const title = (
      {
        overview: "Portfolio",
        expenses: "Work expenses",
        activity: "Activity",
        months: "Month by month",
        checkpoints: "Checkpoints",
        import: "Update your portfolio",
        history: "Import a whole history",
        connection: "Your data",
      } as Readonly<Record<string, string>>
    )[route];
    await call("Page.navigate", { url });
    await waitFor(
      async () =>
        (await evaluate(
          `location.href===${JSON.stringify(url)} && document.readyState==='complete' && !!document.querySelector('.privacy-toggle') && !!document.querySelector('#main-content')?.children.length && !document.querySelector('#main-content .notice[data-busy=true]') && ${title === undefined ? "!!document.querySelector('#fund-chart-title')" : `document.querySelector('h1')?.textContent===${JSON.stringify(title)}`}`,
        )) === true,
      route,
    );
    await evaluate(
      "if(document.querySelector('.privacy-toggle').getAttribute('aria-pressed')==='true')document.querySelector('.privacy-toggle').click()",
    );
    await delay(500);
    await check(
      "document.querySelector('.status-chip')?.getAttribute('aria-label')==='Demo data'",
      `${route}: signed-out synthetic boundary`,
    );
  };
  const openDetails = async (): Promise<void> => {
    await evaluate("document.querySelectorAll('details').forEach(d=>d.open=true)");
    await delay(450);
  };
  return { check, visit, openDetails };
}
