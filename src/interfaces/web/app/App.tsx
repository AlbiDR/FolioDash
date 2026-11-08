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
import { DeferredView } from "../shared/ui/DeferredView";
import { readSidebarCollapsed, writeSidebarCollapsed } from "../shared/ui/sidebarChoice";
import { useMediaQuery } from "../shared/ui/useMediaQuery";
import { useFocusVisibility } from "../shared/ui/useFocusVisibility";
import { Icon, type IconName } from "../shared/ui/icons";
import { watchGoogleFreshness } from "../../../adapters/browser/GoogleFreshness";
import { armGestureRenewal } from "../../../adapters/browser/GestureRenewal";
import { prepareGoogleIdentity } from "../../../adapters/browser/GoogleIdentity";
import { createBrowserSession, watchOtherWindows } from "./browserSession";
import { DRIVE_FILE_SCOPE } from "./session";
import type { ChartRange } from "../features/overview/chartRange";
import { rememberClientId, resolveClientId } from "../../../adapters/browser/ClientId";
import { DEMO_VARIANTS, demoPortfolio, demoVariantFrom } from "./demoPortfolio";
import { memoizeLast } from "../shared/ui/memo";
import { overviewFromLedger } from "./overviewFromLedger";
import { type Route, navEntryOf, routeFrom } from "./routes";
import { watchForUpdate } from "./serviceWorker";
import { describeAge } from "../features/account/timeAgo";
import { describeConnect } from "../features/account/accountText";
import { useExpenses, useNow, useSession } from "./useSession";
import { toIsoDate } from "../../../core/IsoDate";
import type { ExpenseCommand, ExpenseDay } from "../../../core/WorkExpenses";
import { demoExpenses } from "./demoExpenses";

const TITLES = { overview: "Portfolio", expenses: "Work expenses", months: "Month by month", import: "Update your portfolio", history: "Import a whole history", connection: "Your data" } as const;
const ExpensesView = lazy(async () => ({ default: (await import("../features/expenses/ExpensesView")).ExpensesView }));
const ExpenseDataTools = lazy(async () => ({ default: (await import("../features/expenses/ExpenseDataTools")).ExpenseDataTools }));
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
  { id: "expenses", href: "#expenses", label: "Expenses", icon: "expenses" },
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
  const [expenseLocked, setExpenseLocked] = useState(false);
  const [importNavigationMessage, setImportNavigationMessage] = useState("");
  const [importConnecting, setImportConnecting] = useState(false);
  const [importConnectMessage, setImportConnectMessage] = useState("");
  useEffect(() => {
    if (!importLocked && !expenseLocked) return;
    const keepReview = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", keepReview);
    return () => { window.removeEventListener("beforeunload", keepReview); };
  }, [importLocked, expenseLocked]);
  // The person's data: the Google spreadsheet is the record, this device keeps a copy, and the session joins them.
  const [clientId, setClientId] = useState(() => resolveClientId(import.meta.env.VITE_GOOGLE_CLIENT_ID, browserPrivacyStorage));
  const session = useMemo(() => createBrowserSession(clientId), [clientId]);
  const data = useSession(session);
  const expenseData = useExpenses(session);
  useEffect(() => watchGoogleFreshness(() => session.refreshIfNeeded(), () => importLocked || expenseLocked), [session, importLocked, expenseLocked]);
  // A remembered connection loads Google's script and builds its token client ahead of time, so the first
  // renewal can start inside a click. The signed-out demo never loads it.
  const remembered = data.mode !== "signed-out" && data.workbook !== null;
  useEffect(() => {
    if (remembered && clientId !== "") prepareGoogleIdentity(clientId, DRIVE_FILE_SCOPE);
  }, [remembered, clientId]);
  // Google access lasts an hour and its window needs a click, so it is renewed quietly on the next click,
  // naming the remembered account. Drafts being edited pause only the check that follows, never the renewal.
  useEffect(() => armGestureRenewal(document, {
    needed: () => navigator.onLine && session.needsRenewal(),
    renew: () => { void session.renewFromGesture({ sync: !(importLocked || expenseLocked) }); },
  }, navigator.userActivation), [session, importLocked, expenseLocked]);
  useEffect(() => {
    const resume = (): void => { session.resumeRenewal(); };
    window.addEventListener("online", resume);
    return () => { window.removeEventListener("online", resume); };
  }, [session]);
  // Another window of this browser (a tab, or the installed app) may renew access or forget the device.
  useEffect(() => watchOtherWindows({
    adopt: () => { if (session.adoptStoredAccess() && !(importLocked || expenseLocked)) void session.refreshIfNeeded(); },
    forgotten: () => { session.forgetFromElsewhere(); },
  }), [session, importLocked, expenseLocked]);
  useEffect(() => {
    if (data.mode === "online" && data.sheet === "ok") void session.expenses.refresh();
  }, [session, data.mode, data.sheet, data.workbook?.id, data.syncedAt]);
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
  const localDate = new Date(now);
  const today = toIsoDate(localDate.getFullYear(), localDate.getMonth() + 1, localDate.getDate());
  if (today === null) throw new Error("The device date is outside FolioDash's supported range.");
  const [expenseDemo, setExpenseDemo] = useState<readonly ExpenseDay[]>(() => demoExpenses(today));
  const [expenseDemoHistory, setExpenseDemoHistory] = useState<readonly ExpenseCommand[]>(() => demoExpenses(today).map(day => ({ id: day.revision, date: day.date, amounts: day.amounts, expectedRevision: null })));
  const [expenseConnectMessage, setExpenseConnectMessage] = useState("");
  useEffect(() => {
    const update = (): void => {
      if ((importLocked || expenseLocked) && routeFrom(window.location.hash).name !== route.name) {
        window.history.replaceState(null, "", `#${route.name}`);
        setImportNavigationMessage(expenseLocked ? "Save or discard your expense draft before leaving. If a save is uncertain, check its outcome first." : "Finish the import or return to statement selection before leaving. Your reviewed answers are still here.");
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
  }, [importLocked, expenseLocked, route.name]);

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
  // The full sentence is the accessible name everywhere. On phones only the short word, always contained in it, is drawn.
  const source = data.mode === "signed-out"
    ? { label: "Demo data", short: "Demo", tone: "demo" }
    : needsAttention
      ? { label: "Sheet needs attention", short: "Needs attention", tone: "local" }
      : data.connection === "checking"
        ? { label: "Checking Google…", short: "Checking", tone: "local" }
        : data.connection === "renewing"
          ? { label: "Renewing Google access…", short: "Renewing", tone: "local" }
        : data.connection === "waiting"
          ? { label: `Saved on this device · tap to sync${data.syncedAt === null ? "" : ` · ${describeAge(now, data.syncedAt)}`}`, short: "Tap to sync", tone: "local" }
        : data.connection === "reconnect"
          ? { label: "Reconnect to Google", short: "Reconnect", tone: "local" }
          : data.connection === "offline"
            ? { label: "Google unavailable · device copy", short: "Device copy", tone: "local" }
            : data.mode === "online"
              ? { label: `Checked with Google${data.syncedAt === null ? "" : ` · ${describeAge(now, data.syncedAt)}`}`, short: "Checked", tone: "synced" }
              : { label: `Saved on this device${data.syncedAt === null ? "" : ` · ${describeAge(now, data.syncedAt)}`}`, short: "Saved", tone: "local" };
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
              {(route.name === "fund" || route.name === "months") && (
                <a class="icon-button back-button" href="#overview" aria-label="Back to Portfolio">
                  <Icon name="back" size={20} />
                </a>
              )}
              <div class="topbar-title">
                <h1 key={pageTitle} id="page-title" class="page-title-arrival">{pageTitle}</h1>
              </div>
              {data.connection === "waiting" || data.connection === "reconnect" ? (
                // Always one tap away, on every screen, and its own click is the gesture Google's window needs.
                <button type="button" class={`status-chip ${source.tone}`} title="Sync with Google now" aria-label={source.label} onClick={() => { void session.reconnect(); }}>
                  <span key={source.tone} class="status-dot" aria-hidden="true" />
                  <span key={source.label} class="source-label"><span class="source-full">{source.label}</span><span class="source-short" aria-hidden="true">{source.short}</span></span>
                </button>
              ) : (
                <a class={`status-chip ${source.tone}`} href="#connection" title="Where your data lives" aria-label={source.label}>
                  <span key={source.tone} class="status-dot" aria-hidden="true" />
                  <span key={source.label} class="source-label"><span class="source-full">{source.label}</span><span class="source-short" aria-hidden="true">{source.short}</span></span>
                </a>
              )}
              <div class="topbar-controls">
                <PrivacyToggle hidden={hidden} onChange={setHidden} />
              </div>
            </header>
            {applyUpdate !== null && (
              <p class="notice app-update" role="status">
                A new version of FolioDash is ready.{" "}
                <button type="button" disabled={importLocked || expenseLocked} onClick={applyUpdate}>
                  Reload to update
                </button>
                {importLocked && <> Finish the import or return to statement selection before updating.</>}
                {expenseLocked && <> Save or discard the expense draft, or check its uncertain save, before updating.</>}
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
                Your saved copy is available. Google access is renewed quietly on your next tap, and checked before saving.
              </p>
            )}
            <main id="main-content" aria-labelledby="page-title" tabIndex={-1}>
              {(importLocked || expenseLocked) && importNavigationMessage !== "" && <p class="notice" role="status">{importNavigationMessage}</p>}
              <DeferredView key={route.name === "fund" ? `fund-${route.isin}` : route.name}>
              {route.name === "overview" && <OverviewView model={model} range={range} onRangeChange={setRange} />}
              {route.name === "expenses" && <ExpensesView
                days={data.mode === "signed-out" ? expenseDemo : expenseData.days}
                conflicts={data.mode === "signed-out" ? [] : expenseData.conflicts}
                history={data.mode === "signed-out" ? expenseDemoHistory : expenseData.commands}
                today={today}
                mode={data.mode}
                ready={data.mode === "signed-out" || expenseData.ready}
                pending={data.mode !== "signed-out" && expenseData.pending}
                onCheckPending={() => session.expenses.checkPending()}
                message={expenseConnectMessage || expenseData.message}
                onDirtyChange={setExpenseLocked}
                onRevealAmounts={() => { setHidden(false); }}
                onRefresh={() => session.expenses.refresh()}
                onConnect={async () => {
                  const result = await session.connect();
                  if (result.status === "connected") { setExpenseConnectMessage(""); await session.expenses.refresh(); }
                  else { const described = describeConnect(result); setExpenseConnectMessage(`${described.title}. ${described.body}`); }
                }}
                onSave={async (request) => {
                  if (data.mode !== "signed-out") return session.expenses.save(request);
                  const entry = expenseDemo.find(day => day.date === request.date);
                  if ((entry?.revision ?? null) !== request.expectedRevision) return { status: "conflict", days: expenseDemo, message: "The demo day changed. Review it before saving again." };
                  const id = crypto.randomUUID();
                  const days = [...expenseDemo.filter(day => day.date !== request.date), { date: request.date, amounts: request.amounts, revision: id }].sort((a, b) => a.date.localeCompare(b.date));
                  setExpenseDemoHistory(current => [...current, { ...request, id }]);
                  setExpenseDemo(days);
                  return { status: "saved", days, viewUpdated: true };
                }}
              />}
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
              {route.name === "fund" && <FundView model={model} isin={route.isin} range={range} onRangeChange={setRange} />}
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
                  expenseCommands={expenseData.commands.length}
                  actions={{
                    connect: () => session.connect(),
                    refresh: () => session.refresh(),
                    reconnect: (options) => session.reconnect(options),
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
              {route.name === "connection" && data.mode !== "signed-out" && <ExpenseDataTools
                days={expenseData.days.length} commands={expenseData.commands.length} conflicts={expenseData.conflicts.length}
                initialized={expenseData.initialized} ready={expenseData.ready && data.mode === "online" && data.sheet === "ok"} pending={expenseData.pending}
                connected={data.mode === "online" && data.sheet === "ok"} message={expenseData.message}
                onLock={setExpenseLocked} onExport={() => session.expenses.exportBackup()}
                onPreview={text => { const history = session.expenses.previewBackup(text); return history === null ? null : { days: history.days.length, commands: history.commands.length, conflicts: history.conflicts.length }; }}
                onRestore={text => session.expenses.restoreBackup(text)} onCheck={() => session.expenses.checkPending()}
                onSync={async () => {
                  if (session.state.mode !== "online" || session.state.sheet !== "ok") {
                    const result = await session.refresh();
                    if (result.status !== "connected") { const described = describeConnect(result); throw new Error(`${described.title}. ${described.body}`); }
                  }
                  await session.expenses.refresh();
                  if (!session.expenses.state.ready) throw new Error(session.expenses.state.message || "Your expense records could not be checked. Keep the backup selected and check again.");
                }}
              />}
              </DeferredView>
            </main>
          </div>
        </div>
      </div>
    </PrivacyProvider>
  );
}
