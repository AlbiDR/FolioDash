import type { JSX, RefObject } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";
import { REDUCED_MOTION_QUERY } from "../shared/motion/reduced-motion";
import type { SessionState } from "../../../applications/session/session-model";
import { PrivacyToggle } from "../presentation/privacy/privacy";
import { Presence } from "../shared/ui/presence";
import { usePageMotion } from "../shared/ui/use-page-motion";
import { Icon } from "../shared/ui/icons";
import { DEMO_VARIANTS, type demoVariantFrom } from "./demo/demo-portfolio";
import { type Route, type navEntryOf, routeFrom } from "./routes";
import { NAV, type SourceStatus } from "./app-model";
import type { Session } from "./session/session";

interface NavBounds {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

const NAV_FAST_MS = 360;
const NAV_SLOW_MS = 550;
const NAV_SIDE_MS = 450;

const clampProgress = (value: number): number => Math.min(1, Math.max(0, value));
const powerThreeOut = (value: number): number => 1 - (1 - clampProgress(value)) ** 4;
const powerThreeInOut = (value: number): number => {
  const progress = clampProgress(value);
  return progress < 0.5 ? 8 * progress ** 4 : 1 - (-2 * progress + 2) ** 4 / 2;
};
const blend = (from: number, to: number, progress: number): number => from + (to - from) * progress;

function navClipPath(bounds: NavBounds, width: number, height: number): string {
  const insets = [bounds.top, width - bounds.right, height - bounds.bottom, bounds.left];
  return `inset(${insets.map((edge) => edge.toFixed(3) + "px").join(" ")} round var(--nav-radius))`;
}

function boundsFor(nav: HTMLElement, item: HTMLElement): NavBounds {
  const navBox = nav.getBoundingClientRect();
  const itemBox = item.getBoundingClientRect();
  return {
    top: itemBox.top - navBox.top,
    right: itemBox.right - navBox.left,
    bottom: itemBox.bottom - navBox.top,
    left: itemBox.left - navBox.left,
  };
}

export function AppNav(props: {
  navigation: RefObject<HTMLElement | null>;
  sidebarHidden: boolean;
  current: ReturnType<typeof navEntryOf>;
}): JSX.Element {
  const { navigation, sidebarHidden, current } = props;
  const activeBounds = useRef<NavBounds | null>(null);
  const animationFrame = useRef<number | null>(null);

  useLayoutEffect(() => {
    const nav = navigation.current;
    if (nav === null) return;
    const pill = nav.querySelector<HTMLElement>(".nav-pill");
    const active = nav.querySelector<HTMLElement>('.nav-link[aria-current="page"]');
    const list = pill?.parentElement;
    if (pill === null || active === null || !list) return;

    const target = boundsFor(list, active);
    const previous = activeBounds.current;
    let width = pill.clientWidth;
    let height = pill.clientHeight;
    const setClip = (bounds: NavBounds): void => {
      pill.style.clipPath = navClipPath(bounds, width, height);
      activeBounds.current = bounds;
    };

    const preference = matchMedia(REDUCED_MOTION_QUERY);
    const stop = (): void => {
      if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
      animationFrame.current = null;
    };
    const settle = (): void => {
      stop();
      width = pill.clientWidth;
      height = pill.clientHeight;
      setClip(boundsFor(list, active));
    };
    const layout = (): string => [pill.clientWidth, pill.clientHeight, active.offsetWidth, active.offsetHeight].join();
    let size = layout();
    const observer = new ResizeObserver(() => {
      const next = layout();
      if (next !== size) settle();
      size = next;
    });
    observer.observe(list);
    observer.observe(active);
    preference.addEventListener("change", settle);

    const startedAt = performance.now();
    const movingDown = previous !== null && target.top + target.bottom > previous.top + previous.bottom;
    const vertical = previous !== null && Math.abs(target.top - previous.top) > Math.abs(target.left - previous.left);
    const movingRight = previous !== null && target.left + target.right > previous.left + previous.right;
    // The horizontal dock gives the same stretch a quicker release on touch.
    const durationScale = vertical ? 1 : 0.75;
    const frame = (now: number): void => {
      if (previous === null) return;
      const elapsed = (now - startedAt) / durationScale;
      const lead = powerThreeOut(elapsed / NAV_FAST_MS);
      const trail = powerThreeInOut(elapsed / NAV_SLOW_MS);
      const cross = powerThreeInOut(elapsed / NAV_SIDE_MS);
      const next: NavBounds = {
        top: blend(previous.top, target.top, vertical ? (movingDown ? trail : lead) : cross),
        right: blend(previous.right, target.right, vertical ? cross : movingRight ? lead : trail),
        bottom: blend(previous.bottom, target.bottom, vertical ? (movingDown ? lead : trail) : cross),
        left: blend(previous.left, target.left, vertical ? cross : movingRight ? trail : lead),
      };
      setClip(next);
      if (elapsed < NAV_SLOW_MS) animationFrame.current = requestAnimationFrame(frame);
      else animationFrame.current = null;
    };
    if (previous === null || preference.matches || sidebarHidden) settle();
    else animationFrame.current = requestAnimationFrame(frame);
    return () => {
      stop();
      observer.disconnect();
      preference.removeEventListener("change", settle);
    };
  }, [current, navigation, sidebarHidden]);

  return (
    <nav ref={navigation} class="main-nav" id="main-nav" aria-label="Main" inert={sidebarHidden}>
      <p class="brand">
        <img src={`${import.meta.env.BASE_URL}icons/icon.svg`} width="32" height="32" alt="" />
        FolioDash
      </p>
      <ul class="nav-list">
        <li class="nav-pill" aria-hidden="true" />
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
