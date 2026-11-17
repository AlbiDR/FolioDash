// Builds one synthetic browser harness (real components, FakeGoogle, no live account), runs a journey, and always removes it.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { withLocalBrowser, type LocalBrowser } from "./local-browser.ts";

export interface SyntheticJourney {
  readonly name: string;
  readonly entry: string;
  readonly directory: string;
  readonly port: number;
  /** Text that appears once the harness has rendered. */
  readonly readySelector: string;
  readonly run: (
    browser: LocalBrowser & {
      readonly check: (expression: string, label: string) => Promise<void>;
      readonly text: (value: string) => string;
      readonly click: (label: string) => Promise<void>;
    },
  ) => Promise<void>;
}

export async function runSyntheticJourney(journey: SyntheticJourney): Promise<number> {
  const directory = resolve(journey.directory);
  const html = resolve(directory, "index.html");
  const bundle = resolve(directory, "synthetic-audit.js");
  const stylesheet = resolve(directory, "styles.css");
  let assertions = 0;
  if ([html, bundle, stylesheet].some(existsSync))
    throw new Error("The synthetic harness destination is already in use.");
  mkdirSync(directory, { recursive: true });
  try {
    execFileSync(
      "node_modules/.bin/esbuild",
      [
        journey.entry,
        "--bundle",
        "--platform=browser",
        "--format=esm",
        "--jsx=automatic",
        "--jsx-import-source=preact",
        `--outfile=${bundle}`,
      ],
      { stdio: "pipe" },
    );
    const stylesheetPath = readFileSync(resolve("dist/web/index.html"), "utf8").match(
      /href="(\.\/assets\/[^"/]+\.css)"/u,
    )?.[1];
    if (stylesheetPath === undefined)
      throw new Error(`Build the app before running the synthetic ${journey.name} audit.`);
    copyFileSync(resolve("dist/web", stylesheetPath), stylesheet);
    writeFileSync(
      html,
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="./styles.css"><title>Synthetic ${journey.name} test</title></head><body><div class="shell"><main class="content-inner" id="root"></main></div><script type="module" src="./synthetic-audit.js"></script></body></html>`,
    );
    await withLocalBrowser(
      async (browser) => {
        const { origin, call, evaluate, waitFor } = browser;
        await call("Page.navigate", { url: `${origin}/` });
        // A slow machine may still be loading the page: an evaluation that fails then is not ready yet, not a failed journey.
        await waitFor(async () => {
          try {
            return (
              (await evaluate(
                `!!document.querySelector(${JSON.stringify(journey.readySelector)}) || document.body?.innerText?.includes('Synthetic setup error:') === true`,
              )) === true
            );
          } catch {
            return false;
          }
        }, `synthetic ${journey.name} harness`);
        const setupError = await evaluate(
          "document.body.innerText.includes('Synthetic setup error:') ? document.body.innerText : ''",
        );
        if (typeof setupError === "string" && setupError !== "") throw new Error(setupError);
        const check = async (expression: string, label: string): Promise<void> => {
          if ((await evaluate(expression)) !== true) throw new Error(`${journey.name}: ${label}`);
          assertions++;
        };
        const click = async (label: string): Promise<void> => {
          if (
            (await evaluate(
              `[...document.querySelectorAll('button')].some(button=>button.textContent.trim()===${JSON.stringify(label)})`,
            )) !== true
          )
            throw new Error(
              `No button named "${label}"; found: ${String(await evaluate("[...document.querySelectorAll('button')].map(b=>b.textContent.trim()).join(' | ')"))}`,
            );
          await evaluate(
            `[...document.querySelectorAll('button')].find(button=>button.textContent.trim()===${JSON.stringify(label)}).click()`,
          );
        };
        const waitForWithPage: LocalBrowser["waitFor"] = async (condition, description) => {
          const tolerant = async (): Promise<boolean> => {
            try {
              return await condition();
            } catch {
              return false;
            }
          };
          try {
            await waitFor(tolerant, description);
          } catch (error) {
            // A stalled wait names what the synthetic page showed instead, which is the first thing to know.
            throw new Error(
              `${error instanceof Error ? error.message : "Timed out."} Page showed: ${String(await evaluate("document.body.innerText.replace(/\\s+/g,' ').slice(0,700)"))}`,
              { cause: error },
            );
          }
        };
        await journey.run({
          ...browser,
          waitFor: waitForWithPage,
          check,
          click,
          text: (value) => `document.body.innerText.includes(${JSON.stringify(value)})`,
        });
      },
      journey.port,
      journey.directory,
    );
    return assertions;
  } finally {
    rmSync(html, { force: true });
    rmSync(bundle, { force: true });
    rmSync(stylesheet, { force: true });
  }
}
