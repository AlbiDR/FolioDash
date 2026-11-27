import type { RefObject } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";
import { useHeightGlide } from "../../shared/motion/height-glide";
import { useLeavingRows } from "../../shared/motion/leaving-rows";
import { useRowGlide } from "../../shared/ui/use-row-glide";
import type { HoldingsSort } from "./model/holdings-sort";
import type { OverviewFund } from "./model/overview-model";

/** Below this many listed funds a table with sold funds stays one block; from here it is grouped. */
const GROUP_FROM = 6;

/** The rows a re-sort moves: desktop holdings rows (not the grouped headers, totals or statement tables) and phone list items. */
const GLIDING_ROWS =
  ".holdings-table:not(.statement-table) > tbody > tr:not(.holdings-group), .holdings-table:not(.statement-table) > tfoot > tr, .mobile-holdings > li";

/**
 * How the Holdings card moves when what it lists changes: new rows fade in, rows that leave stay while they fade,
 * surviving rows glide and the card eases to its new height. The table and the phone list are separate sets.
 */
export function useHoldingsMotion(
  card: RefObject<HTMLElement | null>,
  input: {
    readonly funds: readonly OverviewFund[];
    readonly held: readonly OverviewFund[];
    readonly listedFunds: readonly OverviewFund[];
    readonly query: string;
    readonly holdingsSort: HoldingsSort | null;
    readonly closedOpen: boolean;
  },
) {
  const { funds, held, listedFunds, query, holdingsSort, closedOpen } = input;
  // Funds not listed in the previous render are new in this one (a search returned them, or the closed block opened).
  // Only they fade in; a row that stays keeps its element and is never re-faded.
  const listedBefore = useRef<ReadonlySet<string> | null>(null);
  const fresh: ReadonlySet<string> =
    listedBefore.current === null
      ? new Set()
      : new Set(listedFunds.filter((fund) => !listedBefore.current?.has(fund.isin)).map((fund) => fund.isin));
  useLayoutEffect(() => {
    listedBefore.current = new Set(listedFunds.map((fund) => fund.isin));
  });
  // Surviving keyed rows also glide when a search or the closed-fund fold changes their positions. New rows draw
  // immediately; their figures are never tweened. The shared controller carries an interrupted glide forward.
  /** Long lists with funds you have sold read as two blocks, each with its count; a short list stays one table. */
  const heldListed = listedFunds.filter((fund) => fund.status !== "closed");
  const closedListed = listedFunds.filter((fund) => fund.status === "closed");
  // Rows that leave (a search no longer matches them, or the closed block folds) stay while they fade, then the rows
  // below glide up. The table and the phone list are separate sets, so each keeps its own.
  const grouped = funds.length >= GROUP_FROM && held.length > 0 && funds.some((fund) => fund.status === "closed");
  const tableFunds = grouped ? [...heldListed, ...(closedOpen ? closedListed : [])] : listedFunds;
  const table = useLeavingRows(tableFunds, (fund) => fund.isin);
  const phone = useLeavingRows(listedFunds, (fund) => fund.isin);
  const leavingIn = (rows: typeof table.rows): ReadonlySet<string> =>
    new Set(rows.filter((row) => row.leaving).map((row) => row.item.isin));
  const leaving = leavingIn(table.rows);
  const tableHeld = table.rows.filter((row) => row.item.status !== "closed").map((row) => row.item);
  const tableClosed = table.rows.filter((row) => row.item.status === "closed").map((row) => row.item);
  // The card eases to its new height when rows come or go, so what is below it follows instead of snapping.
  useHeightGlide(card, JSON.stringify([holdingsSort, query, closedOpen, table.rows.length, phone.rows.length]));
  useRowGlide(card, GLIDING_ROWS, JSON.stringify([holdingsSort, query, closedOpen, table.version, phone.version]));
  return {
    fresh,
    grouped,
    heldListed,
    closedListed,
    leaving,
    tableHeld,
    tableClosed,
    tableRows: table.rows.map((row) => row.item),
    phoneFunds: phone.rows.map((row) => row.item),
    phoneLeaving: leavingIn(phone.rows),
  };
}
