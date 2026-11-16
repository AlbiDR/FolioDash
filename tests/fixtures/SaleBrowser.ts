// Local browser harness: all funds, amounts and ledgers are synthetic.
import { h, render } from "preact";
import { applyImport, type FundCommand, type StatementInput } from "../../src/core/ImportPlan";
import { EMPTY_LEDGER, type LedgerState } from "../../src/core/Ledger";
import { parseIsoDate, type IsoDate } from "../../src/core/IsoDate";
import { toEuroCents, ZERO_CENTS, type EuroCents } from "../../src/core/Money";
import { CashQuestions } from "../../src/interfaces/web/features/import/CashQuestions";
import { PrivacyProvider } from "../../src/interfaces/web/presentation/privacy/privacy";

const A = "US0378331005";
const B = "AU0000XVGZA3";
const C = "US5949181045";
const E = "US0231351067";

function euros(value: number): EuroCents {
  const cents = toEuroCents(Math.round(value * 100));
  if (cents === null) throw new Error("Invalid synthetic amount");
  return cents;
}
function day(text: string): IsoDate {
  const date = parseIsoDate(text);
  if (date === null) throw new Error("Invalid synthetic date");
  return date;
}
function statement(funds: readonly (readonly [string, string, number])[]): StatementInput {
  const listed = funds.map(([isin, name, value]) => ({ isin, name, marketValue: euros(value) }));
  return { funds: listed, fundsSubtotal: euros(funds.reduce((sum, fund) => sum + fund[2], 0)) };
}
const command = (isin: string, action: FundCommand["action"], extra: Partial<FundCommand> = {}): FundCommand => ({ isin, action, moneyIn: ZERO_CENTS, moneyOut: ZERO_CENTS, comment: "", ...extra });

function record(state: LedgerState, input: StatementInput, date: string, commands: FundCommand[], revision: string): LedgerState {
  const result = applyImport(state, input, day(date), commands, revision);
  if (!result.ok) throw new Error(`Synthetic ledger setup failed: ${JSON.stringify(result.issues)}`);
  return result.state;
}

function start(): void {
  // January: four funds. February: Synthetic Fund C is fully sold and stays closed until the statement under review.
  let ledger = record(EMPTY_LEDGER, statement([[A, "Synthetic Fund A", 1000], [B, "Synthetic Fund B", 500], [C, "Synthetic Fund C", 300], [E, "Synthetic Fund E", 800]]), "2026-01-31", [
    command(A, "Start", { openingNetInvested: euros(900) }), command(B, "Start", { openingNetInvested: euros(450) }), command(C, "Start", { openingNetInvested: euros(250) }), command(E, "Start", { openingNetInvested: euros(700) }),
  ], "synthetic-1");
  ledger = record(ledger, statement([[A, "Synthetic Fund A", 1010], [B, "Synthetic Fund B", 510], [E, "Synthetic Fund E", 810]]), "2026-02-28", [
    command(A, "Keep"), command(B, "Keep"), command(E, "Keep"), command(C, "Close", { moneyOut: euros(310) }),
  ], "synthetic-2");
  // March under review: A is absent, B is listed at zero, C reappears, E continues.
  const march = statement([[B, "Synthetic Fund B", 0], [C, "Synthetic Fund C", 500], [E, "Synthetic Fund E", 820]]);
  let recorded: LedgerState | null = null;
  const root = document.getElementById("root");
  if (root === null) throw new Error("Synthetic mount missing");
  render(h(PrivacyProvider, { hidden: false, children: h(CashQuestions, {
    statement: { ...march, categories: [], total: null, adjustments: [] },
    date: day("2026-03-31"),
    ledger,
    createRevision: () => "synthetic-3",
    onRecord: next => { recorded = next; },
  }) }), root);
  Object.assign(window, { syntheticSale: {
    recorded: () => recorded !== null,
    /** The recorded March holdings, reduced to what the audit asserts. */
    march: () => {
      const holdings = recorded?.snapshots.find(snapshot => snapshot.date === "2026-03-31")?.holdings;
      return holdings === undefined ? null : Object.fromEntries(Object.entries(holdings).map(([isin, holding]) => [isin, { action: holding.action, status: holding.status, value: Number(holding.value), moneyOut: Number(holding.moneyOut), moneyIn: Number(holding.moneyIn) }]));
    },
    isins: { A, B, C, E },
    snapshots: () => recorded?.snapshots.length ?? ledger.snapshots.length,
  } });
}
try { start(); } catch (error: unknown) {
  const root = document.getElementById("root");
  if (root !== null) root.textContent = `Synthetic setup error: ${error instanceof Error ? error.message : "unknown"}`;
}
