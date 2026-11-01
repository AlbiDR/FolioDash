import type { JSX } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import { EMPTY_LEDGER, type LedgerState } from "../../../core/Ledger";
import type { ConnectionConfig } from "../features/connection/ConnectionModel";
import { ConnectionView } from "../features/connection/ConnectionView";
import { HistoryView } from "../features/history/HistoryView";
import { ImportView } from "../features/import/ImportView";
import { FundView } from "../features/overview/FundView";
import { MonthsView } from "../features/overview/MonthsView";
import type { OverviewModel } from "../features/overview/OverviewModel";
import { OverviewView } from "../features/overview/OverviewView";
import { PrivacyProvider, PrivacyToggle, usePrivacyChoice } from "../shared/privacy/privacy";
import { RangeSelector } from "../shared/ui/RangeSelector";
import { readSidebarCollapsed, writeSidebarCollapsed } from "../shared/ui/sidebarChoice";
import { useMediaQuery } from "../shared/ui/useMediaQuery";
import { Icon, type IconName } from "../shared/ui/icons";
import { buildConnectionDefaults } from "./connectionDefaults";
import { browserConnectionStorage } from "./connectionStorage";
import { DEMO_VARIANTS, demoPortfolio, demoVariantFrom } from "./demoPortfolio";
import { connectToGoogle } from "./googleConnection";
import { browserRemoteSave } from "./googleLedger";
import { CHART_RANGES, type ChartRange } from "./chartRange";
import { prepareImport } from "./importPreparer";
import { overviewFromLedger } from "./overviewFromLedger";
import { type Route, navEntryOf, routeFrom } from "./routes";

const TITLES = { overview: "Portfolio", months: "Month by month", import: "Import a statement", history: "Import a whole history", connection: "Connect your Google Sheet" } as const;

function titleOf(route: Route, model: OverviewModel): string {
  if (route.name === "fund") return model.funds.find((fund) => fund.isin === route.isin)?.name ?? "Fund";
  return TITLES[route.name];
}

const browserPrivacyStorage = (): Storage => window.localStorage;

const NAV: readonly { readonly id: ReturnType<typeof navEntryOf>; readonly href: string; readonly label: string; readonly icon: IconName }[] = [
  { id: "overview", href: "#overview", label: "Portfolio", icon: "overview" },
  { id: "import", href: "#import", label: "Import", icon: "import" },
  { id: "connection", href: "#connection", label: "Google Sheet", icon: "connection" },
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
  const [range, setRange] = useState<ChartRange>("All");
  const wide = useMediaQuery("(min-width: 64rem)");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readSidebarCollapsed(browserPrivacyStorage));
  const sidebarHidden = wide && sidebarCollapsed;
  useEffect(() => {
    writeSidebarCollapsed(browserPrivacyStorage, sidebarCollapsed);
  }, [sidebarCollapsed]);
  const variant = demoVariantFrom(window.location.search);
  const recorded = ledger.snapshots.length > 0;
  const model = recorded ? overviewFromLedger(ledger, "recorded") : demoPortfolio(variant);
  const current = navEntryOf(route);
  const portfolioScreen = route.name === "overview" || route.name === "months" || route.name === "fund";
  const source = connected !== null
    ? { label: "Synced with Google", tone: "synced" }
    : recorded
      ? { label: "This tab only", tone: "local" }
      : { label: "Demo data", tone: "demo" };

  return (
    <PrivacyProvider hidden={hidden}>
      <div class="shell" data-nav={sidebarHidden ? "collapsed" : "open"}>
        <nav class="main-nav" id="main-nav" aria-label="Main" inert={sidebarHidden}>
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
            <header class="topbar">
              {wide && (
                <button
                  type="button"
                  class="icon-button"
                  aria-controls="main-nav"
                  aria-expanded={!sidebarCollapsed}
                  onClick={() => {
                    setSidebarCollapsed(!sidebarCollapsed);
                  }}
                >
                  <Icon name="sidebar" size={20} />
                  <span class="visually-hidden">{sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}</span>
                </button>
              )}
              <div class="topbar-title">
                <p class="eyebrow">FolioDash</p>
                <h1>{titleOf(route, model)}</h1>
              </div>
              <span class={`status-chip ${source.tone}`} role="status">
                <span class="status-dot" aria-hidden="true" />
                {source.label}
              </span>
              <div class="topbar-controls">
                {(route.name === "overview" || route.name === "fund") && (
                  <>
                    <span class="control-label" aria-hidden="true">Period</span>
                    <RangeSelector label="Time range" options={CHART_RANGES} value={range} onChange={setRange} />
                  </>
                )}
                <PrivacyToggle hidden={hidden} onChange={setHidden} />
              </div>
            </header>
            {portfolioScreen && !recorded && (
              <p class="notice" role="status">
                Demonstration with invented data. No real portfolio, bank file or Google account is connected.
              </p>
            )}
            {portfolioScreen && recorded && connected === null && (
              <p class="notice" role="status">
                Based on the statements you recorded in this browser tab. They are not saved: reloading the page clears them.
              </p>
            )}
            {route.name === "overview" && !recorded && (
              <nav aria-label="Demonstration portfolios">
                <ul class="demo-nav">
                  <li class="demo-label">Demo portfolios:</li>
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
            {(route.name === "import" || route.name === "history") && (
              <div class="mode-row">
                <nav class="segmented" aria-label="What to import">
                  <a href="#import" aria-current={route.name === "import" ? "page" : undefined}>One statement</a>
                  <a href="#history" aria-current={route.name === "history" ? "page" : undefined}>Whole history</a>
                </nav>
                <p class="hint">Import one bank file, or restore many months at once from a history file.</p>
              </div>
            )}
            {(route.name === "import" || route.name === "history") && connected === null && (
              <p class="notice" role="status">
                Not connected to Google, so nothing you import here is kept after you reload. <a href="#connection">Connect your Google Sheet</a> first to save it.
              </p>
            )}
            <main>
              {route.name === "overview" && <OverviewView model={model} range={range} />}
              {route.name === "months" && <MonthsView model={model} />}
              {route.name === "fund" && <FundView model={model} isin={route.isin} range={range} />}
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
