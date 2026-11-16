import { prepareBackfill, type EarlierStatement } from "../core/Backfill";
import type { FundCommand } from "../core/ImportPlan";
import type { LedgerState } from "../core/Ledger";
import { toStoredSheet } from "../core/RawSheet";
import { ZERO_CENTS } from "../core/Money";
import { verifyRebuild, type InterpretStatement } from "./Rebuild";
import type { StatementSource } from "./LedgerService";
import type { SourceRecord } from "./StatementSource";

export interface BackfillStatement extends EarlierStatement {
  readonly source?: StatementSource;
}
export type BackfillReviewResult =
  | { readonly ok: true; readonly ledger: LedgerState; readonly sources: readonly SourceRecord[] }
  | { readonly ok: false; readonly message: string };

/** Validate source evidence before and after preparing a complete candidate history. */
export function prepareBackfillReview(original: LedgerState, sources: readonly SourceRecord[], earlier: readonly BackfillStatement[], boundary: readonly FundCommand[], revision: string, commandId: string, interpret: InterpretStatement): BackfillReviewResult {
  const dates = new Set(sources.map(source => source.date));
  if (dates.size !== sources.length || sources.some(source => !original.snapshots.some(snapshot => snapshot.date === source.date))) return { ok: false, message: "The saved bank sources are ambiguous or do not belong to this history." };
  const before = verifyRebuild(original, sources, interpret);
  if (before.differing.length || before.unreadable.length) return { ok: false, message: "Saved bank statements do not match the current history. Resolve this before inserting earlier months." };
  const candidate = prepareBackfill(original, earlier, boundary, revision);
  if (!candidate.ok) return candidate;
  const firstDate = original.snapshots[0]?.date;
  const revised = sources.map(source => {
    if (source.date === firstDate) return { ...source, commands: boundary };
    const originalMonth = original.snapshots.find(snapshot => snapshot.date === source.date);
    const candidateMonth = candidate.ledger.snapshots.find(snapshot => snapshot.date === source.date);
    const carriedClosed = Object.entries(candidateMonth?.holdings ?? {}).flatMap(([isin, holding]) =>
      originalMonth?.holdings[isin] === undefined && holding.action === "Closed"
        ? [{ isin, action: "Closed" as const, moneyIn: ZERO_CENTS, moneyOut: ZERO_CENTS, comment: "" }]
        : []);
    const commands = source.commands.map(command => {
      const holding = candidateMonth?.holdings[command.isin];
      return command.action === "Add" && holding?.action === "Reopen" ? { ...command, action: "Reopen" as const } : command;
    });
    return { ...source, commands: [...commands, ...carriedClosed] };
  });
  for (const item of earlier) {
    if (item.source !== undefined) revised.push({ date: item.date, commandId, sheetName: item.source.sheetName, sheet: toStoredSheet(item.source.sheet), commands: item.commands });
  }
  const after = verifyRebuild(candidate.ledger, revised, interpret);
  if (after.differing.length || after.unreadable.length) return { ok: false, message: "The reviewed bank statements do not reproduce the proposed history." };
  return { ok: true, ledger: candidate.ledger, sources: revised };
}
