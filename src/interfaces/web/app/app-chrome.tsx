import type { JSX, RefObject } from "preact";
import type { SessionState } from "../../../applications/session/session-model";
import { PrivacyToggle } from "../presentation/privacy/privacy";
import { Presence } from "../shared/ui/presence";
import { usePageMotion } from "../shared/ui/use-page-motion";
import { Icon } from "../shared/ui/icons";
import { DEMO_VARIANTS, type demoVariantFrom } from "./demo/demo-portfolio";
import { type Route, type navEntryOf, routeFrom } from "./routes";
import { NAV, type SourceStatus } from "./app-model";
import type { Session } from "./session/session";

export function AppNav(props: {
  navigation: RefObject<HTMLElement | null>;
  sidebarHidden: boolean;
  current: ReturnType<typeof navEntryOf>;
}): JSX.Element {
  const { navigation, sidebarHidden, current } = props;
  return (
    <nav ref={navigation} class="main-nav" id="main-nav" aria-label="Main" inert={sidebarHidden}>
      <p class="brand">
        <img src={`${import.meta.env.BASE_URL}icons/icon.svg`} width="32" height="32" alt="" />
        FolioDash
      </p>
      <ul
        class="nav-list"
        style={{
          "--nav-count": NAV.length,
          "--nav-index": Math.max(
            0,
            NAV.findIndex((entry) => entry.id === current),
          ),
        }}
      >
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
  );
}

export function AppTopbar(props: {
  header: RefObject<HTMLElement | null>;
  wide: boolean;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  route: Route;
  pageTitle: string;
  data: SessionState;
  source: SourceStatus;
  session: Session;
  hidden: boolean;
  setHidden: (hidden: boolean) => void;
  pageMotion: ReturnType<typeof usePageMotion>;
}): JSX.Element {
  const {
    header,
    wide,
    sidebarCollapsed,
    setSidebarCollapsed,
    route,
    pageTitle,
    data,
    source,
    session,
    hidden,
    setHidden,
    pageMotion,
  } = props;
  return (
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
        <h1 key={pageTitle} id="page-title" class="page-title-arrival">
          {pageTitle}
        </h1>
      </div>
      {data.connection === "waiting" || data.connection === "reconnect" ? (
        // Always one tap away, on every screen, and its own click is the gesture Google's window needs.
        <button
          type="button"
          class={`status-chip ${source.tone}`}
          title="Sync with Google now"
          aria-label={source.label}
          onClick={() => {
            void session.reconnect();
          }}
        >
          <span key={source.tone} class="status-dot" aria-hidden="true" />
          <span key={source.label} class="source-label">
            <span class="source-full">{source.label}</span>
            <span class="source-short" aria-hidden="true">
              {source.short}
            </span>
          </span>
        </button>
      ) : (
        <a
          class={`status-chip ${source.tone}`}
          href="#connection"
          title="Where your data lives"
          aria-label={source.label}
        >
          <span key={source.tone} class="status-dot" aria-hidden="true" />
          <span key={source.label} class="source-label">
            <span class="source-full">{source.label}</span>
            <span class="source-short" aria-hidden="true">
              {source.short}
            </span>
          </span>
        </a>
      )}
      <div class="topbar-controls">
        <PrivacyToggle
          hidden={hidden}
          onChange={(value) => {
            pageMotion.finish();
            setHidden(value);
          }}
        />
      </div>
    </header>
  );
}

export function AppNotices(props: {
  applyUpdate: (() => void) | null;
  importLocked: boolean;
  expenseLocked: boolean;
  portfolioScreen: boolean;
  route: Route;
  data: SessionState;
  needsAttention: boolean;
  clientConfigured: boolean;
  importConnectMessage: string;
  importConnecting: boolean;
  connectForImport: () => Promise<void>;
}): JSX.Element {
  const {
    applyUpdate,
    importLocked,
    expenseLocked,
    portfolioScreen,
    route,
    data,
    needsAttention,
    clientConfigured,
    importConnectMessage,
    importConnecting,
    connectForImport,
  } = props;
  return (
    <>
      <Presence show={applyUpdate !== null}>
        {applyUpdate !== null && (
          <div class="notice app-update" role="status">
            <p>
              A new version of FolioDash is ready.
              {importLocked && <> Finish the import or return to statement selection before updating.</>}
              {expenseLocked && <> Save or discard the expense draft, or check its uncertain save, before updating.</>}
            </p>
            <button type="button" disabled={importLocked || expenseLocked} onClick={applyUpdate}>
              Reload to update
            </button>
          </div>
        )}
      </Presence>
      <Presence show={portfolioScreen && route.name !== "overview" && data.mode === "signed-out"}>
        <p class="notice" role="status">
          Demonstration with invented data. Nothing here is yours until you continue with Google.
        </p>
      </Presence>
      <Presence show={portfolioScreen && needsAttention}>
        <p class="notice notice-warning" role="status">
          Your Google Sheet needs attention. <a href="#connection">See what to do</a>
        </p>
      </Presence>
      <Presence show={(route.name === "import" || route.name === "history") && data.mode === "signed-out"}>
        {(route.name === "import" || route.name === "history") && data.mode === "signed-out" && (
          <div class="notice" role="status">
            <p>
              Continue with Google to save your statements. You can review the files first.
              {!clientConfigured && (
                <>
                  {" "}
                  Set up Google on <a href="#connection">Your data</a> first.
                </>
              )}
              {importConnectMessage !== "" && <> {importConnectMessage}</>}
            </p>
            <button
              type="button"
              disabled={importConnecting || !clientConfigured}
              onClick={() => {
                void connectForImport();
              }}
            >
              {importConnecting ? "Connecting to Google…" : "Continue with Google"}
            </button>
          </div>
        )}
      </Presence>
      <Presence show={(route.name === "import" || route.name === "history") && data.mode === "device-copy"}>
        {(route.name === "import" || route.name === "history") && data.mode === "device-copy" && (
          <p class="notice" role="status">
            Your saved copy is available. Google access is renewed quietly on your next tap, and checked before saving.
          </p>
        )}
      </Presence>
    </>
  );
}

export function DemoPicker(props: { variant: ReturnType<typeof demoVariantFrom> }): JSX.Element {
  const { variant } = props;
  return (
    <div class="more">
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
    </div>
  );
}

export function guardImportLinks(
  event: MouseEvent,
  importLocked: boolean,
  route: Route,
  setImportNavigationMessage: (message: string) => void,
): void {
  if (!importLocked || !(event.target instanceof Element)) return;
  const link = event.target.closest<HTMLAnchorElement>("a[href]");
  if (link === null || link.target === "_blank" || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
    return;
  const destination = new URL(link.href);
  if (
    destination.origin === window.location.origin &&
    destination.pathname === window.location.pathname &&
    destination.hash !== "#main-content" &&
    routeFrom(destination.hash).name !== route.name
  ) {
    event.preventDefault();
    setImportNavigationMessage(
      "Finish the import or return to statement selection before leaving. Your reviewed answers are still here.",
    );
  }
}
