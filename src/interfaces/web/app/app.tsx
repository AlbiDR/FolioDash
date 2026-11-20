import type { JSX } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { GetStarted } from "../features/account/get-started";
import { FundView } from "../features/overview/fund-view";
import { MonthsView } from "../features/overview/months-view";
import { OverviewView } from "../features/overview/overview-view";
import { PrivacyProvider, usePrivacyChoice } from "../presentation/privacy/privacy";
import { Presence } from "../shared/ui/presence";
import { usePageMotion } from "../shared/ui/use-page-motion";
import { DeferredView } from "../shared/ui/deferred-view";
import { readSidebarCollapsed, writeSidebarCollapsed } from "../shared/ui/sidebar-choice";
import { useMediaQuery } from "../shared/ui/use-media-query";
import { useFocusVisibility } from "../shared/ui/use-focus-visibility";
import { watchGoogleFreshness } from "../../../adapters/browser/connection/google-freshness";
import { armGestureRenewal } from "../../../adapters/browser/connection/gesture-renewal";
import { prepareGoogleIdentity } from "../../../adapters/browser/connection/google-identity";
import { createBrowserSession, watchOtherWindows } from "./session/browser-session";
import { DRIVE_FILE_SCOPE } from "./session/stack/session-policy";
import { type ChartRange, resolveRange } from "../features/overview/model/chart-range";
import { resolveClientId } from "../../../adapters/browser/connection/client-id";
import { demoVariantFrom } from "./demo/demo-portfolio";
import { navEntryOf, routeFrom, type Route } from "./routes";
import { watchForUpdate } from "./platform/service-worker";
import { describeConnect } from "../features/account/account-text";
import { useCheckpoints, useExpenses, useNow, useSession } from "./session/use-session";
import { toIsoDate } from "../../../core/values/iso-date";
import type { ExpenseCommand, ExpenseDay } from "../../../core/expenses/work-expenses";
import { demoExpenses } from "./demo/demo-expenses";
import { AppNav, AppNotices, AppTopbar, DemoPicker, guardImportLinks } from "./app-chrome";
import { CheckpointsRoute } from "./app-checkpoints-route";
import { ConnectionRoute } from "./app-connection-route";
import { ExpensesRoute } from "./app-expenses-route";
import { ImportRoutes } from "./app-import-routes";
import { ActivityView } from "./app-views";
import { activityDaysFor } from "../features/activity/activity-model";
import {
  NO_CHECKPOINTS,
  browserPrivacyStorage,
  demoCheckpointsFor,
  demoFor,
  markersFor,
  overviewFor,
  sourceOf,
  titleOf,
} from "./app-model";

export function App(): JSX.Element {
  const page = useRef<HTMLElement>(null);
  const pageMotion = usePageMotion(page);
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
    return () => {
      window.removeEventListener("beforeunload", keepReview);
    };
  }, [importLocked, expenseLocked]);
  // The person's data: the Google spreadsheet is the record, this device keeps a copy, and the session joins them.
  const [clientId, setClientId] = useState(() =>
    resolveClientId(import.meta.env.VITE_GOOGLE_CLIENT_ID, browserPrivacyStorage),
  );
  const session = useMemo(() => createBrowserSession(clientId), [clientId]);
  const data = useSession(session);
  const expenseData = useExpenses(session);
  const checkpointData = useCheckpoints(session);
  useEffect(
    () =>
      watchGoogleFreshness(
        () => session.refreshIfNeeded(),
        () => importLocked || expenseLocked,
      ),
    [session, importLocked, expenseLocked],
  );
  // A remembered connection loads Google's script and builds its token client ahead of time, so the first
  // renewal can start inside a click. The signed-out demo never loads it.
  const remembered = data.mode !== "signed-out" && data.workbook !== null;
  useEffect(() => {
    if (remembered && clientId !== "") prepareGoogleIdentity(clientId, DRIVE_FILE_SCOPE);
  }, [remembered, clientId]);
  // Google access lasts an hour and its window needs a click, so it is renewed quietly on the next click,
  // naming the remembered account. Drafts being edited pause only the check that follows, never the renewal.
  useEffect(
    () =>
      armGestureRenewal(
        document,
        {
          needed: () => navigator.onLine && session.needsRenewal(),
          renew: () => {
            void session.renewFromGesture({ sync: !(importLocked || expenseLocked) });
          },
        },
        navigator.userActivation,
      ),
    [session, importLocked, expenseLocked],
  );
  useEffect(() => {
    const resume = (): void => {
      session.resumeRenewal();
    };
    window.addEventListener("online", resume);
    return () => {
      window.removeEventListener("online", resume);
    };
  }, [session]);
  // Another window of this browser (a tab, or the installed app) may renew access or forget the device.
  useEffect(
    () =>
      watchOtherWindows({
        adopt: () => {
          if (session.adoptStoredAccess() && !(importLocked || expenseLocked)) void session.refreshIfNeeded();
        },
        forgotten: () => {
          session.forgetFromElsewhere();
        },
      }),
    [session, importLocked, expenseLocked],
  );
  useEffect(() => {
    if (data.mode === "online" && data.sheet === "ok") {
      void session.expenses.refresh();
      void session.checkpoints.refresh();
    }
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
      setImportConnectMessage(
        "Google connection did not complete. Your import review is still here. Try connecting again.",
      );
    } finally {
      setImportConnecting(false);
    }
  }
  const now = useNow(60_000);
  const localDate = new Date(now);
  const today = toIsoDate(localDate.getFullYear(), localDate.getMonth() + 1, localDate.getDate());
  if (today === null) throw new Error("The device date is outside FolioDash's supported range.");
  const [expenseDemo, setExpenseDemo] = useState<readonly ExpenseDay[]>(() => demoExpenses(today));
  const [expenseDemoHistory, setExpenseDemoHistory] = useState<readonly ExpenseCommand[]>(() =>
    demoExpenses(today).map((day) => ({
      id: day.revision,
      date: day.date,
      amounts: day.amounts,
      expectedRevision: null,
    })),
  );
  const [expenseConnectMessage, setExpenseConnectMessage] = useState("");
  useEffect(() => {
    const update = (): void => {
      if ((importLocked || expenseLocked) && routeFrom(window.location.hash).name !== route.name) {
        window.history.replaceState(null, "", `#${route.name}`);
        setImportNavigationMessage(
          expenseLocked
            ? "Save or discard your expense draft before leaving. If a save is uncertain, check its outcome first."
            : "Finish the import or return to statement selection before leaving. Your reviewed answers are still here.",
        );
        return;
      }
      setImportNavigationMessage("");
      const destination = routeFrom(window.location.hash);
      if (JSON.stringify(destination) === JSON.stringify(route)) {
        pageMotion.cancel();
        return;
      }
      pageMotion.change(() => {
        setRoute(destination);
        window.scrollTo(0, 0);
        requestAnimationFrame(() => page.current?.focus({ preventScroll: true }));
      });
    };
    window.addEventListener("hashchange", update);
    return () => {
      window.removeEventListener("hashchange", update);
    };
  }, [importLocked, expenseLocked, route, pageMotion]);

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
  const shownCheckpoints = data.mode === "signed-out" ? demoCheckpointsFor(model) : checkpointData.active;
  // Markers are observations to read, so none are drawn once the log failed its integrity check; the screen still lists the device copy.
  const checkpointMarkers = markersFor(
    data.mode !== "signed-out" && checkpointData.suspect ? NO_CHECKPOINTS : shownCheckpoints,
  );
  const current = navEntryOf(route);
  const portfolioScreen = route.name === "overview" || route.name === "months" || route.name === "fund";
  const needsAttention = data.sheet !== "ok" && data.sheet !== "unchecked";
  // The full sentence is the accessible name everywhere. On phones only the short word, always contained in it, is drawn.
  const source = sourceOf(data, needsAttention, now);
  const clientConfigured = clientId !== "";
  const pageTitle = titleOf(route, model);
  useEffect(() => {
    document.title = `${pageTitle} · FolioDash`;
  }, [pageTitle]);

  return (
    <PrivacyProvider hidden={hidden}>
      <div
        class="shell"
        data-nav={sidebarHidden ? "collapsed" : "open"}
        onClickCapture={(event) => {
          guardImportLinks(event, importLocked, route, setImportNavigationMessage);
        }}
      >
        <a
          class="skip-link"
          href="#main-content"
          onClick={(event) => {
            event.preventDefault();
            document.getElementById("main-content")?.focus();
          }}
        >
          Skip to content
        </a>
        <AppNav navigation={navigation} sidebarHidden={sidebarHidden} current={current} />
        <div class="content">
          <div class="content-inner">
            {__SYNTHETIC_ACCEPTANCE__ && (
              <p class="notice" role="status">
                Synthetic acceptance build. Use generated test statements only. Google connection uses a separate test
                spreadsheet and device copy.
              </p>
            )}
            <AppTopbar
              header={header}
              wide={wide}
              sidebarCollapsed={sidebarCollapsed}
              setSidebarCollapsed={setSidebarCollapsed}
              route={route}
              pageTitle={pageTitle}
              data={data}
              source={source}
              session={session}
              hidden={hidden}
              setHidden={setHidden}
              pageMotion={pageMotion}
            />
            <AppNotices
              applyUpdate={applyUpdate}
              importLocked={importLocked}
              expenseLocked={expenseLocked}
              portfolioScreen={portfolioScreen}
              route={route}
              data={data}
              needsAttention={needsAttention}
              clientConfigured={clientConfigured}
              importConnectMessage={importConnectMessage}
              importConnecting={importConnecting}
              connectForImport={connectForImport}
            />
            <main ref={page} id="main-content" aria-labelledby="page-title" tabIndex={-1}>
              <Presence show={(importLocked || expenseLocked) && importNavigationMessage !== ""}>
                <p class="notice notice-warning" role="status">
                  {importNavigationMessage}
                </p>
              </Presence>
              <DeferredView key={route.name === "fund" ? `fund-${route.isin}` : route.name}>
                {route.name === "overview" && data.mode === "signed-out" && (
                  <GetStarted
                    clientConfigured={clientConfigured}
                    connect={() => session.connect()}
                    onReady={() => {
                      window.location.hash = "#import";
                    }}
                  />
                )}
                {route.name === "overview" && (
                  <OverviewView
                    model={model}
                    range={resolveRange(range, model.dates)}
                    onRangeChange={setRange}
                    checkpoints={checkpointMarkers}
                    today={today}
                    pendingChange={data.pendingRevision != null}
                  />
                )}
                {route.name === "checkpoints" && (
                  <CheckpointsRoute
                    data={data}
                    checkpointData={checkpointData}
                    shownCheckpoints={shownCheckpoints}
                    today={today}
                    session={session}
                  />
                )}
                {route.name === "activity" && (
                  <ActivityView
                    days={activityDaysFor(data.mode === "signed-out", expenseDemo, expenseData.days)}
                    demo={data.mode === "signed-out"}
                  />
                )}
                {route.name === "expenses" && (
                  <ExpensesRoute
                    data={data}
                    expenseData={expenseData}
                    expenseDemo={expenseDemo}
                    setExpenseDemo={setExpenseDemo}
                    expenseDemoHistory={expenseDemoHistory}
                    setExpenseDemoHistory={setExpenseDemoHistory}
                    expenseConnectMessage={expenseConnectMessage}
                    setExpenseConnectMessage={setExpenseConnectMessage}
                    setExpenseLocked={setExpenseLocked}
                    setHidden={setHidden}
                    today={today}
                    session={session}
                  />
                )}

                {route.name === "overview" && data.mode === "signed-out" && <DemoPicker variant={variant} />}

                {route.name === "months" && <MonthsView model={model} />}
                {route.name === "fund" && (
                  <FundView
                    model={model}
                    isin={route.isin}
                    range={resolveRange(range, model.dates)}
                    onRangeChange={setRange}
                  />
                )}
                <ImportRoutes
                  route={route}
                  data={data}
                  jsonImportLocked={jsonImportLocked}
                  statementLocked={statementLocked}
                  setStatementLocked={setStatementLocked}
                  setJsonImportLocked={setJsonImportLocked}
                  session={session}
                />
                {route.name === "connection" && (
                  <ConnectionRoute
                    data={data}
                    expenseData={expenseData}
                    checkpointData={checkpointData}
                    now={now}
                    clientConfigured={clientConfigured}
                    setClientId={setClientId}
                    setExpenseLocked={setExpenseLocked}
                    session={session}
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
