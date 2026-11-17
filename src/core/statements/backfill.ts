import { applyImport, type FundCommand, type StatementInput } from "./import-plan";
import { monthSerial } from "../values/iso-date";
import { EMPTY_LEDGER, type LedgerState, validateLedger } from "../portfolio/ledger";
import { ZERO_CENTS } from "../values/money";
import { computeMetrics } from "../portfolio/metrics";

/** A fully reviewed earlier statement. No values or movements are inferred. */
export interface EarlierStatement {
  readonly date: LedgerState["snapshots"][number]["date"];
  readonly statement: StatementInput;
  readonly commands: readonly FundCommand[];
}

export type BackfillResult =
  { readonly ok: true; readonly ledger: LedgerState } | { readonly ok: false; readonly message: string };

/**
 * Rebuild the financial timeline for a proposed prefix. The first existing month
 * requires new, explicit decisions because it no longer represents an opening.
 * This only prepares a candidate: persistence and consent belong to the caller.
 */
export function prepareBackfill(
  original: LedgerState,
  earlier: readonly EarlierStatement[],
  boundary: readonly FundCommand[],
  revision: string,
): BackfillResult {
  if (validateLedger(original).length !== 0 || original.snapshots.length === 0 || earlier.length === 0)
    return { ok: false, message: "A valid saved history and at least one earlier statement are required." };
  const first = original.snapshots[0];
  if (first === undefined || earlier.some((item) => monthSerial(item.date) >= monthSerial(first.date)))
    return { ok: false, message: "Every added statement must be before the first saved month." };
  let state = EMPTY_LEDGER;
  for (const item of earlier) {
    const result = applyImport(state, item.statement, item.date, item.commands, revision);
    if (!result.ok)
      return { ok: false, message: result.issues[0]?.message ?? "The earlier statement cannot be applied." };
    state = result.state;
  }
  for (let index = 0; index < original.snapshots.length; index++) {
    const saved = original.snapshots[index];
    if (saved === undefined) return { ok: false, message: "A saved statement is missing." };
    const funds = original.funds.flatMap((fund) => {
      const holding = saved.holdings[fund.isin];
      return holding?.status === "active" ? [{ isin: fund.isin, name: fund.fullName, marketValue: holding.value }] : [];
    });
    const previous = state.snapshots.at(-1);
    const extraClosed = state.funds.filter(
      (fund) => saved.holdings[fund.isin] === undefined && previous?.holdings[fund.isin]?.status === "closed",
    );
    const commands: readonly FundCommand[] =
      index === 0
        ? boundary
        : [
            ...Object.entries(saved.holdings).map(([isin, holding]) => ({
              isin,
              // An explicitly added fund may now have an earlier, closed episode.
              action:
                holding.action === "Add" && previous?.holdings[isin]?.status === "closed"
                  ? ("Reopen" as const)
                  : holding.action,
              moneyIn: holding.moneyIn,
              moneyOut: holding.moneyOut,
              comment: holding.comment,
            })),
            ...extraClosed.map((fund) => ({
              isin: fund.isin,
              action: "Closed" as const,
              moneyIn: ZERO_CENTS,
              moneyOut: ZERO_CENTS,
              comment: "",
            })),
          ];
    const result = applyImport(state, { funds, fundsSubtotal: saved.fundsSubtotal }, saved.date, commands, revision);
    if (!result.ok)
      return {
        ok: false,
        message: `${saved.date}: ${result.issues[0]?.message ?? "The saved statement cannot be replayed."}`,
      };
    const rebuilt = result.state.snapshots.at(-1);
    if (rebuilt === undefined) return { ok: false, message: "The rebuilt statement is missing." };
    // Existing valuations and statuses are evidence, not inputs that may be changed by replay.
    if (
      Object.entries(saved.holdings).some(
        ([isin, holding]) =>
          rebuilt.holdings[isin]?.value !== holding.value || rebuilt.holdings[isin].status !== holding.status,
      )
    )
      return { ok: false, message: `${saved.date}: the review changes a saved value or holding status.` };
    const holdings = Object.fromEntries(
      Object.entries(rebuilt.holdings).map(([isin, holding]) => [
        isin,
        saved.holdings[isin] === undefined || index === 0
          ? holding
          : { ...holding, cashVerified: saved.holdings[isin].cashVerified },
      ]),
    );
    const snapshots = [...result.state.snapshots.slice(0, -1), { ...rebuilt, holdings }];
    state = { ...result.state, snapshots };
  }
  // Preserve names already chosen by the owner for all previously known funds.
  state = {
    ...state,
    funds: state.funds.map((fund) => {
      const saved = original.funds.find((item) => item.isin === fund.isin);
      return saved === undefined ? fund : { ...fund, name: saved.name, fullName: saved.fullName };
    }),
  };
  if (validateLedger(state).length !== 0) return { ok: false, message: "The rebuilt history failed validation." };
  try {
    computeMetrics(state);
  } catch {
    return {
      ok: false,
      message: "The resulting totals exceed the supported amount. Check the entered cash movements.",
    };
  }
  return { ok: true, ledger: state };
}
