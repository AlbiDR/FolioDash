import type { OverviewFund } from "./OverviewModel";

export type HoldingsSortKey = "name" | "value" | "share" | "gainPercent" | "gain" | "netInvested";
export interface HoldingsSort {
  readonly key: HoldingsSortKey;
  readonly direction: "asc" | "desc";
}

/** What each sortable column is called, in the words the headers and announcements use. */
export const SORT_LABELS: Readonly<Record<HoldingsSortKey, string>> = {
  name: "Fund",
  value: "Value",
  share: "Share",
  gainPercent: "Gain %",
  gain: "Gain",
  netInvested: "Net invested",
};

/** A name reads best from A to Z; a figure from largest to smallest. */
function firstDirection(key: HoldingsSortKey): "asc" | "desc" {
  return key === "name" ? "asc" : "desc";
}

/** Choosing a column sorts it, choosing it again reverses it, and a third time returns to the saved order. */
export function nextSort(current: HoldingsSort | null, key: HoldingsSortKey): HoldingsSort | null {
  if (current === null || current.key !== key) return { key, direction: firstDirection(key) };
  return current.direction === firstDirection(key) ? { key, direction: current.direction === "asc" ? "desc" : "asc" } : null;
}

/** The words a sort announces and the phone's list shows, for example "Value, highest first". */
export function describeSort(sort: HoldingsSort | null): string {
  if (sort === null) return "Default order";
  if (sort.key === "name") return sort.direction === "asc" ? "Fund, A to Z" : "Fund, Z to A";
  return `${SORT_LABELS[sort.key]}, ${sort.direction === "desc" ? "highest first" : "lowest first"}`;
}

function figure(fund: OverviewFund, key: Exclude<HoldingsSortKey, "name">): number | null {
  const latest = fund.latest;
  if (latest === null) return null;
  switch (key) {
    case "value": return Number(latest.value);
    case "share": return latest.share;
    case "gainPercent": return latest.gainPercent;
    case "gain": return Number(latest.gain);
    case "netInvested": return Number(latest.netInvested);
  }
}

/**
 * Orders what is shown, never what is calculated. Funds you have sold stay after the held ones, and a fund
 * without a figure stays after those that have one, in either direction. A null sort keeps the incoming order.
 */
export function sortHoldings(funds: readonly OverviewFund[], sort: HoldingsSort | null): OverviewFund[] {
  if (sort === null) return [...funds];
  const sign = sort.direction === "asc" ? 1 : -1;
  return funds
    .map((fund, index) => ({ fund, index }))
    .sort((a, b) => {
      const closed = Number(a.fund.status === "closed") - Number(b.fund.status === "closed");
      if (closed !== 0) return closed;
      if (sort.key === "name") return sign * a.fund.name.localeCompare(b.fund.name, "en") || a.index - b.index;
      const left = figure(a.fund, sort.key);
      const right = figure(b.fund, sort.key);
      if (left === null || right === null) return left === right ? a.index - b.index : left === null ? 1 : -1;
      return sign * (left - right) || a.index - b.index;
    })
    .map((entry) => entry.fund);
}
