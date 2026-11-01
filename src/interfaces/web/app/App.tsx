import type { JSX } from "preact";
import { useEffect, useState } from "preact/hooks";
import { EMPTY_LEDGER, type LedgerState } from "../../../core/Ledger";
import { ImportView } from "../features/import/ImportView";
import { OverviewView } from "../features/overview/OverviewView";
import { DEMO_VARIANTS, demoPortfolio, demoVariantFrom } from "./demoPortfolio";
import { prepareImport } from "./importPreparer";

type Route = "overview" | "import";

function routeFrom(hash: string): Route {
  return hash === "#import" ? "import" : "overview";
}

export function App(): JSX.Element {
  const [route, setRoute] = useState<Route>(routeFrom(window.location.hash));
  // Held in memory only: nothing is saved yet, so a reload starts empty.
  const [ledger, setLedger] = useState<LedgerState>(EMPTY_LEDGER);
  useEffect(() => {
    const update = (): void => {
      setRoute(routeFrom(window.location.hash));
    };
    window.addEventListener("hashchange", update);
    return () => {
      window.removeEventListener("hashchange", update);
    };
  }, []);

  const variant = demoVariantFrom(window.location.search);
  return (
    <>
      <header class="app-header">
        <h1>FolioDash</h1>
        <nav aria-label="Main">
          <ul class="demo-nav">
            <li>
              <a href="#overview" aria-current={route === "overview" ? "page" : undefined}>
                Overview
              </a>
            </li>
            <li>
              <a href="#import" aria-current={route === "import" ? "page" : undefined}>
                Import statement
              </a>
            </li>
          </ul>
        </nav>
        {route === "overview" && (
          <>
            <p class="notice" role="status">
              Demonstration with invented data. No real portfolio, bank file or Google account is connected.
            </p>
            <nav aria-label="Demonstration portfolios">
              <ul class="demo-nav">
                {DEMO_VARIANTS.map((entry) => (
                  <li key={entry.id}>
                    <a href={`?demo=${entry.id}#overview`} aria-current={entry.id === variant ? "page" : undefined}>
                      {entry.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </>
        )}
      </header>
      <main>
        {route === "overview" ? <OverviewView model={demoPortfolio(variant)} /> : (
            <ImportView
              prepare={prepareImport}
              ledger={ledger}
              createRevision={() => crypto.randomUUID()}
              onRecord={setLedger}
            />
          )}
      </main>
    </>
  );
}
