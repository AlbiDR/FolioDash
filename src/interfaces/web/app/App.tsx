import type { JSX } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { lazy } from "preact/compat";
import { GetStarted } from "../features/account/GetStarted";
import type { ImportPreparer } from "../../../applications/ImportModel";
import { FundView } from "../features/overview/FundView";
import { MonthsView } from "../features/overview/MonthsView";
import type { OverviewModel } from "../features/overview/OverviewModel";
import { OverviewView } from "../features/overview/OverviewView";
import { PrivacyProvider, PrivacyToggle, usePrivacyChoice } from "../presentation/privacy/privacy";
import { RangeSelector } from "../shared/ui/RangeSelector";
import { DeferredView } from "../shared/ui/DeferredView";
import { readSidebarCollapsed, writeSidebarCollapsed } from "../shared/ui/sidebarChoice";
import { useMediaQuery } from "../shared/ui/useMediaQuery";
import { useFocusVisibility } from "../shared/ui/useFocusVisibility";
import { Icon, type IconName } from "../shared/ui/icons";
import { createBrowserSession } from "./browserSession";
import { CHART_RANGES, type ChartRange } from "../features/overview/chartRange";
import { rememberClientId, resolveClientId } from "../../../adapters/browser/ClientId";
import { DEMO_VARIANTS, demoPortfolio, demoVariantFrom } from "./demoPortfolio";
import { memoizeLast } from "../shared/ui/memo";
import { overviewFromLedger } from "./overviewFromLedger";
import { type Route, navEntryOf, routeFrom } from "./routes";
import { watchForUpdate } from "./serviceWorker";
import { describeAge } from "../features/account/timeAgo";
import { describeConnect } from "../features/account/accountText";
import { useNow, useSession } from "./useSession";

const TITLES = { overview: "Portfolio", months: "Month by month", import: "Update your portfolio", history: "Import a whole history", connection: "Your data" } as const;
const AccountView = lazy(async () => ({ default: (await import("../features/account/AccountView")).AccountView }));
const HistoryView = lazy(async () => ({ default: (await import("../features/history/HistoryView")).HistoryView }));
const ImportView = lazy(async () => ({ default: (await import("../features/import/ImportView")).ImportView }));
const prepareImport: ImportPreparer = async (file) => {
  try {
    return await (await import("./importPreparer")).prepareImport(file);
  } catch {
    return { status: "unreadable-file", message: "The import tools or file could not be loaded. Check your connection, then select the file again." };
  }
};

function titleOf(route: Route, model: OverviewModel): string {
  if (route.name === "fund") return model.funds.find((fund) => fund.isin === route.isin)?.name ?? "Fund";
  return TITLES[route.name];
}

// The model is redone only when the ledger itself changes, not on a toggle, a range change or a resize.
const overviewFor = memoizeLast(overviewFromLedger);
const demoFor = memoizeLast(demoPortfolio);

const browserPrivacyStorage = (): Storage => window.localStorage;

const NAV: readonly { readonly id: ReturnType<typeof navEntryOf>; readonly href: string; readonly label: string; readonly icon: IconName }[] = [
  { id: "overview", href: "#overview", label: "Portfolio", icon: "overview" },
  { id: "import", href: "#import", label: "Import", icon: "import" },
  { id: "connection", href: "#connection", label: "Your data", icon: "connection" },
];

export function App(): JSX.Element {
  const header = useRef<HTMLElement>(null);
  const navigation = useRef<HTMLElement>(null);
  useFocusVisibility(header, navigation);
  const [route, setRoute] = useState<Route>(routeFrom(window.location.hash));
  const [statementLocked, setStatementLocked] = useState(false);
  const [jsonImportLocked, setJsonImportLocked] = useState(false);
  const importLocked = statementLocked || jsonImportLocked;
  const [importNavigationMessage, setImportNavigationMessage] = useState("");
  const [importConnecting, setImportConnecting] = useState(false);
  const [importConnectMessage, setImportConnectMessage] = useState("");
  useEffect(() => {
    if (!importLocked) return;
    const keepReview = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", keepReview);
    return () => { window.removeEventListener("beforeunload", keepReview); };
  }, [importLocked]);
  // The person's data: the Google spreadsheet is the record, this device keeps a copy, and the session joins them.
  const [clientId, setClientId] = useState(() => resolveClientId(import.meta.env.VITE_GOOGLE_CLIENT_ID, browserPrivacyStorage));
  const session = useMemo(() => createBrowserSession(clientId), [clientId]);
  const data = useSession(session);
  async function connectForImport(): Promise<void> {
    setImportConnecting(true);
    setImportConnectMessage("");
    try {
      const outcome = await session.connect();
      if (outcome.status !== "connected") {
        const described = describeConnect(outcome);
        setImportConnectMessage(`${described.title}. ${described.body} Your import review is still here.`);
      }
    } catch {
      setImportConnectMessage("Google connection did not complete. Your import review is still here. Try connecting again.");
    } finally {
      setImportConnecting(false);
    }
  }
  const now = useNow(60_000);
  useEffect(() => {
    const update = (): void => {
      if (importLocked && routeFrom(window.location.hash).name !== route.name) {
        window.history.replaceState(null, "", `#${route.name}`);
        setImportNavigationMessage("Finish the import or return to statement selection before leaving. Your reviewed answers are still here.");
        return;
      }
      setImportNavigationMessage("");
      setRoute(routeFrom(window.location.hash));
      window.scrollTo(0, 0);
      requestAnimationFrame(() => document.getElementById("main-content")?.focus({ preventScroll: true }));
    };
    window.addEventListener("hashchange", update);
    return () => {
      window.removeEventListener("hashchange", update);
    };
  }, [importLocked, route.name]);

  // A newer version of the app, kept waiting until the person chooses to switch.
  const [applyUpdate, setApplyUpdate] = useState<(() => void) | null>(null);
  useEffect(() => {
    watchForUpdate((apply) => {
      setApplyUpdate(() => apply);
    });
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
  const model = data.mode === "signed-out" ? demoFor(variant) : overviewFor(data.ledger, "recorded");
  const current = navEntryOf(route);
  const portfolioScreen = route.name === "overview" || route.name === "months" || route.name === "fund";
  const needsAttention = data.sheet !== "ok" && data.sheet !== "unchecked";
  const source = data.mode === "signed-out"
    ? { label: "Demo data", tone: "demo" }
    : needsAttention
      ? { label: "Sheet needs attention", tone: "local" }
      : data.mode === "online"
        ? { label: "Synced with Google", tone: "synced" }
        : { label: `Saved on this device${data.syncedAt === null ? "" : ` · ${describeAge(now, data.syncedAt)}`}`, tone: "local" };
  const clientConfigured = clientId !== "";
  const pageTitle = titleOf(route, model);
  useEffect(() => {
    document.title = `${pageTitle} · FolioDash`;
  }, [pageTitle]);

  return (
    <PrivacyProvider hidden={hidden}>
      <div class="shell" data-nav={sidebarHidden ? "collapsed" : "open"} onClickCapture={(event) => {
        if (!importLocked || !(event.target instanceof Element)) return;
        const link = event.target.closest<HTMLAnchorElement>("a[href]");
        if (link === null || link.target === "_blank" || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const destination = new URL(link.href);
        if (destination.origin === window.location.origin && destination.pathname === window.location.pathname && destination.hash !== "#main-content" && routeFrom(destination.hash).name !== route.name) {
          event.preventDefault();
          setImportNavigationMessage("Finish the import or return to statement selection before leaving. Your reviewed answers are still here.");
        }
      }}>
        <a class="skip-link" href="#main-content" onClick={(event) => {
          event.preventDefault();
          document.getElementById("main-content")?.focus();
        }}>Skip to content</a>
        <nav ref={navigation} class="main-nav" id="main-nav" aria-label="Main" inert={sidebarHidden}>
          <p class="brand"><img src={`${import.meta.env.BASE_URL}icons/icon.svg`} width="32" height="32" alt="" />FolioDash</p>
          <ul class="nav-list" style={{ "--nav-count": NAV.length, "--nav-index": Math.max(0, NAV.findIndex(entry => entry.id === current)) }}>
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
            {__SYNTHETIC_ACCEPTANCE__ && <p class="notice" role="status">Synthetic acceptance build. Use generated test statements only. Google connection uses a separate test spreadsheet and device copy.</p>}
            <header ref={header} class="topbar">
              {wide && (
                <button
                  type="button"
                  class="icon-button sidebar-toggle"
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
                <h1 key={pageTitle} id="page-title" class="page-title-arrival">{pageTitle}</h1>
              </div>
              <a class={`status-chip ${source.tone}`} href="#connection" title="Where your data lives">
                <span key={source.tone} class="status-dot" aria-hidden="true" />
                <span key={source.label} class="source-label">{source.label}</span>
              </a>
              <div class="topbar-controls">
                <PrivacyToggle hidden={hidden} onChange={setHidden} />
              </div>
            </header>
            {applyUpdate !== null && (
              <p class="notice app-update" role="status">
                A new version of FolioDash is ready.{" "}
                <button type="button" disabled={importLocked} onClick={applyUpdate}>
                  Reload to update
                </button>
                {importLocked && <> Finish the import or return to statement selection before updating.</>}
              </p>
            )}
            {portfolioScreen && route.name !== "overview" && data.mode === "signed-out" && (
              <p class="notice" role="status">
                Demonstration with invented data. Nothing here is yours until you continue with Google.
              </p>
            )}
            {portfolioScreen && needsAttention && (
              <p class="notice" role="status">
                Your Google Sheet needs attention. <a href="#connection">See what to do</a>
              </p>
            )}
            {(route.name === "import" || route.name === "history") && data.mode === "signed-out" && (
              <p class="notice" role="status">
                Continue with Google to save your statements. You can review the files first.{" "}
                <button type="button" disabled={importConnecting || !clientConfigured} onClick={() => { void connectForImport(); }}>{importConnecting ? "Connecting to Google…" : "Continue with Google"}</button>
                {!clientConfigured && <> Set up Google on <a href="#connection">Your data</a> first.</>}
                {importConnectMessage !== "" && <span>{importConnectMessage}</span>}
              </p>
            )}
            {(route.name === "import" || route.name === "history") && data.mode === "device-copy" && (
              <p class="notice" role="status">
                Saving will ask you to sign in with Google first.
              </p>
            )}
            <main id="main-content" aria-labelledby="page-title" tabIndex={-1}>
              {importLocked && importNavigationMessage !== "" && <p class="notice" role="status">{importNavigationMessage}</p>}
              {(route.name === "overview" || route.name === "fund") && model.dates.length > 0 && <div class="view-tools"><div><span class="control-label">Chart period</span><span class="hint">Changes the charts, not your latest figures.</span></div><RangeSelector label="Chart time range" options={CHART_RANGES} value={range} onChange={setRange} /></div>}
              <DeferredView key={route.name === "fund" ? `fund-${route.isin}` : route.name}>
              {route.name === "overview" && <OverviewView model={model} range={range} />}
              {route.name === "overview" && data.mode === "signed-out" && (
                <GetStarted
                  clientConfigured={clientConfigured}
                  connect={() => session.connect()}
                  onReady={() => {
                    window.location.hash = "#import";
                  }}
                />
              )}
              {route.name === "overview" && data.mode === "signed-out" && (
                <details class="demo-picker">
                  <summary>Explore demo portfolios</summary>
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
                </details>
              )}

              {route.name === "months" && <MonthsView model={model} />}
              {route.name === "fund" && <FundView model={model} isin={route.isin} range={range} />}
              {route.name === "import" && (
                <div inert={jsonImportLocked}>
                <ImportView
                  prepare={prepareImport}
                  ledger={data.ledger}
                  createRevision={() => crypto.randomUUID()}
                  onRecord={() => undefined}
                  save={session.save}
                  onWorkflowLock={setStatementLocked}
                />
                </div>
              )}
              {route.name === "history" && (
                <div inert={jsonImportLocked}><ImportView historyMode prepare={prepareImport} ledger={data.ledger} createRevision={() => crypto.randomUUID()} onRecord={() => undefined} save={session.save} onWorkflowLock={setStatementLocked} /></div>
              )}
              {(route.name === "import" || route.name === "history") && <details class="setup-details" inert={statementLocked}><summary>Import an existing FolioDash JSON history file</summary><HistoryView ledger={data.ledger} onLedger={() => undefined} save={session.save} onWorkflowLock={setJsonImportLocked} /></details>}
              {route.name === "connection" && (
                <AccountView
                  state={data}
                  now={now}
                  clientConfigured={clientConfigured}
                  build={__APP_BUILD__}
                  actions={{
                    connect: () => session.connect(),
                    refresh: () => session.refresh(),
                    restore: () => session.restoreFromDevice(),
                    verify: () => session.verifyHistory(),
                    tidy: () => session.tidySheet(),
                    forget: () => {
                      session.forget();
                    },
                    setClientId: (text) => {
                      const kept = rememberClientId(text, browserPrivacyStorage);
                      if (kept) setClientId(text.trim());
                      return kept;
                    },
                  }}
                />
              )}
              </DeferredView>
            </main>
          </div>
        </div>
      </div>
    </PrivacyProvider>
  );
}
