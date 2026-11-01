import type { JSX } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import { EMPTY_LEDGER, type LedgerState } from "../../../core/Ledger";
import type { ConnectionConfig } from "../features/connection/ConnectionModel";
import { ConnectionView } from "../features/connection/ConnectionView";
import { HistoryView } from "../features/history/HistoryView";
import { ImportView } from "../features/import/ImportView";
import { OverviewView } from "../features/overview/OverviewView";
import { DEMO_VARIANTS, demoPortfolio, demoVariantFrom } from "./demoPortfolio";
import { buildConnectionDefaults } from "./connectionDefaults";
import { browserConnectionStorage } from "./connectionStorage";
import { connectToGoogle } from "./googleConnection";
import { browserRemoteSave } from "./googleLedger";
import { prepareImport } from "./importPreparer";
import { overviewFromLedger } from "./overviewFromLedger";
import { PrivacyProvider, PrivacyToggle, usePrivacyChoice } from "../shared/privacy/privacy";

type Route = "overview" | "import" | "history" | "connection";

function routeFrom(hash: string): Route {
  if (hash === "#import") return "import";
  if (hash === "#history") return "history";
  return hash === "#connection" ? "connection" : "overview";
}

const browserPrivacyStorage = (): Storage => window.localStorage;

export function App(): JSX.Element {
  const [route, setRoute] = useState<Route>(routeFrom(window.location.hash));
  // Held in memory. Until a spreadsheet is connected it is only this tab; once connected it mirrors the spreadsheet.
  const [ledger, setLedger] = useState<LedgerState>(EMPTY_LEDGER);
  const [connected, setConnected] = useState<ConnectionConfig | null>(null);
  const save = useMemo(() => (connected === null ? undefined : browserRemoteSave(connected)), [connected]);
  useEffect(() => {
    const update = (): void => {
      setRoute(routeFrom(window.location.hash));
    };
    window.addEventListener("hashchange", update);
    return () => {
      window.removeEventListener("hashchange", update);
    };
  }, []);

  const [hidden, setHidden] = usePrivacyChoice(browserPrivacyStorage);
  const variant = demoVariantFrom(window.location.search);
  const recorded = ledger.snapshots.length > 0;
  const model = recorded ? overviewFromLedger(ledger, "recorded") : demoPortfolio(variant);
  return (
    <PrivacyProvider hidden={hidden}>
      <header class="app-header">
        <div class="app-title">
          <h1>FolioDash</h1>
          <PrivacyToggle hidden={hidden} onChange={setHidden} />
        </div>
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
            <li>
              <a href="#history" aria-current={route === "history" ? "page" : undefined}>
                Import history
              </a>
            </li>
            <li>
              <a href="#connection" aria-current={route === "connection" ? "page" : undefined}>
                Connection
              </a>
            </li>
          </ul>
        </nav>
        {route === "overview" && !recorded && (
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
        {route === "overview" && recorded && (
          <p class="notice" role="status">
            {connected === null
              ? "Based on the statements you recorded in this browser tab. They are not saved: reloading the page clears them."
              : "Based on the ledger in your connected Google spreadsheet, as loaded when you connected or last saved."}
          </p>
        )}
      </header>
      <main>
        {route === "overview" && <OverviewView model={model} />}
        {route === "import" && (
          <ImportView
            prepare={prepareImport}
            ledger={ledger}
            createRevision={() => crypto.randomUUID()}
            onRecord={setLedger}
            {...(save === undefined ? {} : { save })}
          />
        )}
        {route === "history" && <HistoryView ledger={ledger} onLedger={setLedger} {...(save === undefined ? {} : { save })} />}
        {route === "connection" && (
          <ConnectionView
            connect={connectToGoogle}
            storage={browserConnectionStorage}
            defaults={buildConnectionDefaults}
            onConnected={(config, loaded) => {
              setConnected(config);
              setLedger(loaded);
            }}
          />
        )}
      </main>
    </PrivacyProvider>
  );
}
