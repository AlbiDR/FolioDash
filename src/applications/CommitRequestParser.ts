import { parseStoredSheet } from "../core/RawSheet";
import type { CommitRequest, StatementSource } from "./LedgerService";
import type { FundCommand, StatementInput } from "../core/ImportPlan";
import { parseIsin } from "../core/Isin";
import { parseIsoDate } from "../core/IsoDate";
import type { HoldingAction } from "../core/Ledger";
import { type EuroCents, toEuroCents } from "../core/Money";

export type ParsedRequest =
  | { readonly ok: true; readonly request: CommitRequest }
  | { readonly ok: false; readonly message: string };

const ACTIONS: readonly string[] = ["Start", "Add", "Keep", "Close", "Reopen", "Closed"];
const MAX_TEXT = 500;
const MAX_FUNDS = 500;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function cents(value: unknown): EuroCents | null {
  return typeof value === "number" ? toEuroCents(value) : null;
}

function text(value: unknown, maximum = MAX_TEXT): string | null {
  return typeof value === "string" && value.length <= maximum ? value : null;
}

/**
 * Everything the browser sends is untrusted input: shape and types are checked
 * here, and the ledger rules are checked again by the same kernel code the
 * browser used. A request that cannot be understood is refused, not repaired.
 */
export function parseCommitRequest(input: unknown): ParsedRequest {
  const body = record(input);
  if (body === null) return { ok: false, message: "The request is not an object." };
  const fail = (message: string): ParsedRequest => ({ ok: false, message });

  const commandId = text(body["commandId"], 100);
  if (commandId === null || commandId.length < 8) return fail("The command id is missing or too short.");
  const expectedRevision = text(body["expectedRevision"], 100);
  if (expectedRevision === null) return fail("The expected revision is missing.");
  const date = typeof body["date"] === "string" ? parseIsoDate(body["date"]) : null;
  if (date === null) return fail("The statement date is not a valid YYYY-MM-DD date.");

  const statementInput = record(body["statement"]);
  const fundsInput = statementInput?.["funds"];
  if (statementInput === null || !Array.isArray(fundsInput) || fundsInput.length > MAX_FUNDS) {
    return fail("The statement is missing or has too many funds.");
  }
  const funds: StatementInput["funds"][number][] = [];
  for (const entry of fundsInput as unknown[]) {
    const fund = record(entry);
    const isin = typeof fund?.["isin"] === "string" ? parseIsin(fund["isin"]) : null;
    const name = text(fund?.["name"], 160);
    const marketValue = cents(fund?.["marketValue"]);
    if (isin === null || name === null || marketValue === null || marketValue < 0) return fail("A statement fund is invalid.");
    funds.push({ isin, name, marketValue });
  }
  const fundsSubtotal = cents(statementInput["fundsSubtotal"]);
  if (fundsSubtotal === null || fundsSubtotal < 0) return fail("The funds subtotal is invalid.");

  const commandsInput = body["commands"];
  if (!Array.isArray(commandsInput) || commandsInput.length > MAX_FUNDS) return fail("The decisions are missing.");
  const commands: FundCommand[] = [];
  for (const entry of commandsInput as unknown[]) {
    const item = record(entry);
    const isin = typeof item?.["isin"] === "string" ? parseIsin(item["isin"]) : null;
    const action = text(item?.["action"], 20);
    const moneyIn = cents(item?.["moneyIn"]);
    const moneyOut = cents(item?.["moneyOut"]);
    const comment = text(item?.["comment"]);
    if (isin === null || action === null || !ACTIONS.includes(action) || moneyIn === null || moneyOut === null || comment === null) {
      return fail("A decision is invalid.");
    }
    const opening = item?.["openingNetInvested"];
    const openingNetInvested = opening === undefined ? undefined : cents(opening);
    if (opening !== undefined && openingNetInvested === null) return fail("An opening amount is invalid.");
    const name = item?.["name"] === undefined ? undefined : text(item["name"], 160);
    if (item?.["name"] !== undefined && name === null) return fail("A fund name is invalid.");
    commands.push({
      isin,
      action: action as HoldingAction,
      moneyIn,
      moneyOut,
      comment,
      ...(openingNetInvested === undefined || openingNetInvested === null ? {} : { openingNetInvested }),
      ...(name === undefined || name === null ? {} : { name }),
    });
  }

  let source: StatementSource | undefined;
  if (body["source"] !== undefined) {
    const given = record(body["source"]);
    const sheetName = text(given?.["sheetName"], 200);
    const sheet = parseStoredSheet(given?.["sheet"]);
    if (sheetName === null || sheet === null) return fail("The bank statement is missing or not in the expected form.");
    source = { sheetName, sheet };
  }

  return { ok: true, request: { commandId, expectedRevision, statement: { funds, fundsSubtotal }, date, commands, ...(source === undefined ? {} : { source }) } };
}
