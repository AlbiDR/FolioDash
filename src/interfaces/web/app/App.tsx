import type { JSX } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import { EMPTY_LEDGER, type LedgerState } from "../../../core/Ledger";
import type { ConnectionConfig } from "../features/connection/ConnectionModel";
import { ConnectionView } from "../features/connection/ConnectionView";
import { HistoryView } from "../features/history/HistoryView";
import { ImportView } from "../features/import/ImportView";
import { FundView } from "../features/overview/FundView";
import { MonthsView } from "../features/overview/MonthsView";
import { OverviewView } from "../features/overview/OverviewView";
import { PrivacyProvider, PrivacyToggle, usePrivacyChoice } from "../shared/privacy/privacy";
import { Icon, type IconName } from "../shared/ui/icons";
import { buildConnectionDefaults } from "./connectionDefaults";
import { browserConnectionStorage } from "./connectionStorage";
import { DEMO_VARIANTS, demoPortfolio, demoVariantFrom } from "./demoPortfolio";
import { connectToGoogle } from "./googleConnection";
import { browserRemoteSave } from "./googleLedger";
import { prepareImport } from "./importPreparer";
import { overviewFromLedger } from "./overviewFromLedger";
import { type Route, navEntryOf, routeFrom } from "./routes";

const browserPrivacyStorage = (): Storage => window.localStorage;

const NAV: readonly { readonly id: ReturnType<typeof navEntryOf>; readonly href: string; readonly label: string; readonly icon: IconName }[] = [
  { id: "overview", href: "#overview", label: "Portfolio", icon: "overview" },
  { id: "import", href: "#import", label: "Import", icon: "import" },
  { id: "history", href: "#history", label: "History", icon: "history" },
  { id: "connection", href: "#connection", label: "Connection", icon: "connection" },
];

export function App(): JSX.Element {
  const [route, setRoute] = useState<Route>(routeFrom(window.location.hash));
  // Held in memory. Until a spreadsheet is connected it is only this tab; once connected it mirrors the spreadsheet.
  const [ledger, setLedger] = useState<LedgerState>(EMPTY_LEDGER);
  const [connected, setConnected] = useState<ConnectionConfig | null>(null);
  const save = useMemo(() => (connected === null ? undefined : browserRemoteSave(connected)), [connected]);
  useEffect(() => {
    const update = (): void => {
      setRoute(routeFrom(window.location.hash));
      window.scrollTo(0, 0);
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
  const current = navEntryOf(route);
  const portfolioScreen = route.name === "overview" || route.name === "months" || route.name === "fund";

  return (
    <PrivacyProvider hidden={hidden}>
      <div class="shell">
        <nav class="main-nav" aria-label="Main">
          <p class="brand">FolioDash</p>
          <ul class="nav-list">
            {NAV.map((entry) => (
              <li key={entry.id}>
                <a class="nav-link" href={entry.href} aria-current={current === entry.id ? "page" : undefined}>
                  <Icon name={entry.icon} />
                  {entry.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div class="content">
          <div class="content-inner">
            <div class="toolbar">
              <PrivacyToggle hidden={hidden} onChange={setHidden} />
            </div>
            {portfolioScreen && !recorded && (
              <p class="notice" role="status">
                Demonstration with invented data. No real portfolio, bank file or Google account is connected.
              </p>
            )}
            {portfolioScreen && recorded && (
              <p class="notice" role="status">
                {connected === null
                  ? "Based on the statements you recorded in this browser tab. They are not saved: reloading the page clears them."
                  : "Based on the ledger in your connected Google spreadsheet, as loaded when you connected or last saved."}
              </p>
            )}
            {route.name === "overview" && !recorded && (
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
            )}
            <main>
              {route.name === "overview" && <OverviewView model={model} />}
              {route.name === "months" && <MonthsView model={model} />}
              {route.name === "fund" && <FundView model={model} isin={route.isin} />}
              {route.name === "import" && (
                <ImportView
                  prepare={prepareImport}
                  ledger={ledger}
                  createRevision={() => crypto.randomUUID()}
                  onRecord={setLedger}
                  {...(save === undefined ? {} : { save })}
                />
              )}
              {route.name === "history" && <HistoryView ledger={ledger} onLedger={setLedger} {...(save === undefined ? {} : { save })} />}
              {route.name === "connection" && (
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
          </div>
        </div>
      </div>
    </PrivacyProvider>
  );
}
