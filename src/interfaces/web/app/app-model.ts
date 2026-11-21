import type { SessionState } from "../../../applications/session/session-model";
import type { OverviewModel } from "../features/overview/model/overview-model";
import type { IconName } from "../shared/ui/icons";
import { demoPortfolio } from "./demo/demo-portfolio";
import { demoCheckpoints } from "./demo/demo-checkpoints";
import { type Checkpoint, chartMarkers } from "../../../core/portfolio/checkpoints";
import { memoizeLast } from "../shared/ui/memo";
import { overviewFromLedger } from "./session/overview-from-ledger";
import { type Route, navEntryOf } from "./routes";

const TITLES = {
  overview: "Portfolio",
  expenses: "Work expenses",
  activity: "Activity",
  months: "Month by month",
  checkpoints: "Checkpoints",
  import: "Update your portfolio",
  history: "Import a whole history",
  connection: "Your data",
} as const;

export function titleOf(route: Route, model: OverviewModel): string {
  if (route.name === "fund") return model.funds.find((fund) => fund.isin === route.isin)?.name ?? "Fund";
  return TITLES[route.name];
}

// The model is redone only when the ledger itself changes, not on a toggle, a range change or a resize.
export const overviewFor = memoizeLast(overviewFromLedger);
export const NO_CHECKPOINTS: readonly Checkpoint[] = [];
export const markersFor = memoizeLast((active: readonly Checkpoint[]) => chartMarkers(active));
export const demoCheckpointsFor = memoizeLast(demoCheckpoints);
export const demoFor = memoizeLast(demoPortfolio);

export const browserPrivacyStorage = (): Storage => window.localStorage;

export const NAV: readonly {
  readonly id: ReturnType<typeof navEntryOf>;
  readonly href: string;
  readonly label: string;
  readonly icon: IconName;
}[] = [
  { id: "overview", href: "#overview", label: "Portfolio", icon: "overview" },
  { id: "expenses", href: "#expenses", label: "Expenses", icon: "expenses" },
  { id: "activity", href: "#activity", label: "Activity", icon: "activity" },
  { id: "import", href: "#import", label: "Import", icon: "import" },
  {
    id: "connection",
    href: "#connection",
    label: "Your data",
    icon: "connection",
  },
];

export interface SourceStatus {
  readonly label: string;
  readonly short: string;
  readonly tone: string;
}

// The full sentence is the accessible name everywhere. On phones only the short word, always contained in it, is drawn.
export function sourceOf(data: SessionState, needsAttention: boolean): SourceStatus {
  if (data.mode === "signed-out") return { label: "Demo data", short: "Demo", tone: "demo" };
  if (needsAttention) return { label: "Sheet needs attention", short: "Needs attention", tone: "local" };
  switch (data.connection) {
    case "renewing":
      return { label: "Renewing Google access…", short: "Renewing", tone: "local" };
    case "waiting":
      return { label: "Saved on this device · tap to sync", short: "Tap to sync", tone: "local" };
    case "reconnect":
      return { label: "Reconnect to Google", short: "Reconnect", tone: "local" };
    case "offline":
      return { label: "Google unavailable · device copy", short: "Device copy", tone: "local" };
    default:
      return { label: "Google Sheets", short: "Google", tone: "synced" };
  }
}
