import type { ExpenseConflict, ExpenseSaveOutcome } from "../../applications/session/expense-model";
import type { Grid } from "../../applications/ledger/sheet-grid";
import { canonicalJson } from "../../core/integrity/canonical-json";
import type { IsoDate } from "../../core/values/iso-date";
import { sha256Hex } from "../../core/integrity/sha256";
import type { ExpenseCommand, ExpenseDay } from "../../core/expenses/work-expenses";
import { writeGridTabs } from "./google-workbook";
import { EXPENSE_VIEW_TITLE, LEDGER_TAB } from "./sheets-layout";
import { callRest, wroteNothing, type RestClient } from "./rest";
import { SHEETS } from "./workbook/sheets-api";
import { buildExpenseView } from "./expenses/expense-view";
import { initializeExpenseLog } from "./expenses/expense-setup";
import { ANCHOR, HEADER, ROLE, commandOf, headToken, inspect, object } from "./expenses/expense-sheet";

export const EXPENSE_LOG_TITLE = "_FolioDash expenses";
export { EXPENSE_VIEW_TITLE } from "./sheets-layout";
const MAX_COMMANDS = 100_000;

export interface ExpenseHistory {
  readonly days: readonly ExpenseDay[];
  readonly commands: readonly ExpenseCommand[];
  readonly conflicts: readonly ExpenseConflict[];
}
export type ExpenseRead =
  | ({ readonly status: "ok"; readonly initialized: true } & ExpenseHistory)
  | { readonly status: "absent" }
  | { readonly status: "damaged" | "unavailable"; readonly message: string };
export type DirectExpenseOutcome = ExpenseSaveOutcome & Partial<ExpenseHistory & { readonly initialized: boolean }>;

/** Validates the complete correction graph. Branches remain visible until a reviewed resolution names all heads. */
export function parseExpenseHistory(value: unknown): ExpenseHistory | null {
  if (!Array.isArray(value) || value.length > MAX_COMMANDS) return null;
  const commands: ExpenseCommand[] = [];
  const ids = new Map<string, string>();
  type Graph = {
    heads: Set<string>;
    nodes: Map<string, ExpenseCommand>;
    tokens: Map<string | null, readonly string[]>;
  };
  const dates = new Map<IsoDate, Graph>();
  for (const raw of value as unknown[]) {
    const command = commandOf(raw);
    if (command === null) return null;
    const text = canonicalJson(command);
    const prior = ids.get(command.id);
    if (prior !== undefined) {
      if (prior !== text) return null;
      continue;
    }
    let graph = dates.get(command.date);
    if (graph === undefined) {
      graph = { heads: new Set(), nodes: new Map(), tokens: new Map([[null, []]]) };
      dates.set(command.date, graph);
    }
    const parents = graph.tokens.get(command.expectedRevision);
    if (parents === undefined) return null;
    for (const parent of parents) graph.heads.delete(parent);
    graph.heads.add(command.id);
    graph.nodes.set(command.id, command);
    graph.tokens.set(command.id, [command.id]);
    graph.tokens.set(headToken(graph.heads), [...graph.heads]);
    ids.set(command.id, text);
    commands.push(command);
  }
  const days: ExpenseDay[] = [];
  const conflicts: ExpenseConflict[] = [];
  for (const [date, graph] of [...dates].sort(([left], [right]) => left.localeCompare(right))) {
    const token = headToken(graph.heads);
    if (token === null) return null;
    const versions = [...graph.heads].sort().map((id) => {
      const command = graph.nodes.get(id);
      if (command === undefined) throw new Error("Expense graph lost a validated node.");
      return { revision: id, amounts: command.amounts };
    });
    if (versions.length > 1) conflicts.push({ date, revision: token, versions });
    else if (versions[0] !== undefined) days.push({ date, revision: token, amounts: versions[0].amounts });
  }
  return { days, commands, conflicts };
}

export function encodeExpenseBackup(commands: readonly ExpenseCommand[]): string {
  return JSON.stringify({
    format: "foliodash-work-expenses",
    version: 1,
    commands,
    checksum: sha256Hex(canonicalJson(commands)),
  });
}
/** A later legitimate append must not make an acknowledged earlier command uncertain. */
export function containsExpenseCommands(
  actual: readonly ExpenseCommand[],
  expected: readonly ExpenseCommand[],
): boolean {
  const existing = new Map(actual.map((command) => [command.id, canonicalJson(command)]));
  return expected.every((command) => existing.get(command.id) === canonicalJson(command));
}
export function decodeExpenseBackup(value: unknown): ExpenseHistory | null {
  const data = object(value);
  if (data?.["format"] !== "foliodash-work-expenses" || data["version"] !== 1) return null;
  const history = parseExpenseHistory(data["commands"]);
  if (history === null || data["checksum"] !== sha256Hex(canonicalJson(data["commands"]))) return null;
  return history;
}

const damaged = (): ExpenseRead => ({
  status: "damaged",
  message:
    "Work expense history failed its checks or its records tab is missing. Nothing was reset. Keep your backup and review Your data.",
});

/** Read-only discovery. The durable anchor survives removal of the records tab, preventing accidental reinitialisation. */
export async function readExpenses(
  rest: RestClient,
  token: string,
  id: string,
  expectedInitialized = false,
): Promise<ExpenseRead> {
  const found = await inspect(rest, token, id);
  if (found.status !== "ok") return found;
  const records = found.tabs.filter((tab) => tab.markers.includes(ROLE));
  const anchors = found.tabs.filter((tab) => tab.markers.includes(ANCHOR));
  if (found.tabs.some((tab) => tab.markers.some((marker) => marker !== ROLE && marker !== ANCHOR))) return damaged();
  if (records.length === 0 && anchors.length === 0) return expectedInitialized ? damaged() : { status: "absent" };
  const tab = records[0];
  if (
    records.length !== 1 ||
    anchors.length !== 1 ||
    tab === undefined ||
    tab.markers.length !== 1 ||
    anchors[0]?.markers.length !== 1 ||
    tab.id === anchors[0].id ||
    anchors[0].title !== LEDGER_TAB
  )
    return damaged();
  const answer = await callRest(rest, token, {
    method: "GET",
    url: `${SHEETS}/${encodeURIComponent(id)}/values/${encodeURIComponent(`'${tab.title.replaceAll("'", "''")}'!A:C`)}?valueRenderOption=UNFORMATTED_VALUE`,
  });
  if (!answer.ok)
    return { status: "unavailable", message: "Work expense records could not be read. Your saved copy was preserved." };
  const values = object(answer.value)?.["values"];
  if (!Array.isArray(values) || !Array.isArray(values[0]) || values[0].join("|") !== HEADER.join("|")) return damaged();
  const commands: unknown[] = [];
  for (const raw of values.slice(1) as unknown[]) {
    if (
      !Array.isArray(raw) ||
      raw.length !== 3 ||
      raw[0] !== "1" ||
      typeof raw[1] !== "string" ||
      raw[1].length > 2048 ||
      raw[2] !== sha256Hex(raw[1])
    )
      return damaged();
    try {
      commands.push(JSON.parse(raw[1]) as unknown);
    } catch {
      return damaged();
    }
  }
  const history = parseExpenseHistory(commands);
  return history === null ? damaged() : { status: "ok", initialized: true, ...history };
}

function currentRevision(read: Extract<ExpenseRead, { status: "ok" }>, date: IsoDate): string | null {
  return (
    read.conflicts.find((item) => item.date === date)?.revision ??
    read.days.find((item) => item.date === date)?.revision ??
    null
  );
}
async function saved(
  rest: RestClient,
  token: string,
  id: string,
  read: Extract<ExpenseRead, { status: "ok" }>,
  command: ExpenseCommand,
  today?: IsoDate,
): Promise<DirectExpenseOutcome> {
  const collision = read.conflicts.find((item) => item.date === command.date);
  const newest = read.days.find((item) => item.date === command.date);
  if (collision !== undefined || newest?.revision !== command.id)
    return {
      ...read,
      status: "conflict",
      message: "This day also changed on another device. Review the saved versions before choosing its amounts.",
    };
  const viewUpdated = await refreshExpenseView(rest, token, id, read.days, read.conflicts, today);
  return { ...read, status: "saved", viewUpdated };
}

/** Reads the original command without re-appending; confirmation may refresh the derived view. Absence after a lost response remains uncertain. */
export async function checkExpense(
  rest: RestClient,
  token: string,
  id: string,
  command: ExpenseCommand,
  expectedInitialized = true,
  today?: IsoDate,
): Promise<DirectExpenseOutcome> {
  const read = await readExpenses(rest, token, id, expectedInitialized);
  if (read.status !== "ok")
    return {
      status: "unknown",
      message: "The save outcome could not be checked yet. Keep this page open and check again before another save.",
    };
  const prior = read.commands.find((item) => item.id === command.id);
  if (prior === undefined)
    return {
      status: "unknown",
      message:
        "That command is not visible in Google yet. Keep the draft and check again; do not submit it as a new save.",
    };
  if (canonicalJson(prior) !== canonicalJson(command))
    return {
      status: "not-saved",
      message: "That save identifier already belongs to different amounts. Nothing further was written.",
    };
  return saved(rest, token, id, read, command, today);
}

export async function saveExpense(
  rest: RestClient,
  token: string,
  id: string,
  command: ExpenseCommand,
  expectedInitialized = false,
  today?: IsoDate,
): Promise<DirectExpenseOutcome> {
  if (today !== undefined && command.date > today)
    return {
      status: "not-saved",
      message: "Future dates can be browsed, but expenses can be saved only when the day arrives.",
    };
  if (commandOf(command) === null)
    return { status: "not-saved", message: "Enter valid weekday amounts before saving." };
  let read = await readExpenses(rest, token, id, expectedInitialized);
  if (read.status === "absent") {
    await initializeExpenseLog(rest, token, id, EXPENSE_LOG_TITLE);
    read = await readExpenses(rest, token, id);
    // No command append has been attempted yet, even if the structural setup
    // response was lost. Do not strand an unsent command as an uncertain save.
    if (read.status !== "ok")
      return {
        status: "not-saved",
        message:
          "Work expense setup could not be confirmed. No expense entry was submitted; check the Google connection before trying again.",
      };
  }
  if (read.status !== "ok") return { status: "not-saved", message: read.message };
  const prior = read.commands.find((item) => item.id === command.id);
  if (prior !== undefined) {
    if (canonicalJson(prior) !== canonicalJson(command))
      return { status: "not-saved", message: "That save identifier already belongs to a different entry." };
    return saved(rest, token, id, read, command, today);
  }
  if (currentRevision(read, command.date) !== command.expectedRevision)
    return {
      ...read,
      status: "conflict",
      message: "This day changed since you opened it. Review the current amounts before saving a correction.",
    };
  const found = await inspect(rest, token, id);
  if (found.status !== "ok") return { status: "not-saved", message: found.message };
  const tab = found.tabs.find((item) => item.markers.includes(ROLE));
  if (tab === undefined)
    return { status: "not-saved", message: "The expense record tab is missing. Nothing was written." };
  const payload = canonicalJson(command);
  const append = await callRest(rest, token, {
    method: "POST",
    url: `${SHEETS}/${encodeURIComponent(id)}/values/${encodeURIComponent(`'${tab.title.replaceAll("'", "''")}'!A:C`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    body: { values: [["1", payload, sha256Hex(payload)]] },
  });
  if (!append.ok && wroteNothing(append.failure))
    return {
      status: "not-saved",
      message: "Google refused this save. Your draft is intact; reconnect before trying again.",
    };
  return checkExpense(rest, token, id, command, true, today);
}

/** Exact values, typed dates and explicit partial/conflict states; no spreadsheet calculation alternatives. */
export async function refreshExpenseView(
  rest: RestClient,
  token: string,
  id: string,
  days: readonly ExpenseDay[],
  conflicts: readonly ExpenseConflict[] = [],
  today?: IsoDate,
): Promise<boolean> {
  return (
    await writeGridTabs(rest, token, id, [{ title: EXPENSE_VIEW_TITLE, grid: expenseView(days, conflicts, today) }])
  ).ok;
}

/** The same checked expense projection is used after saves and workbook organization. */
export function expenseView(
  days: readonly ExpenseDay[],
  conflicts: readonly ExpenseConflict[] = [],
  today?: IsoDate,
): Grid {
  return buildExpenseView(days, conflicts, today);
}

/** Explicit recovery into an absent or verified empty store. Existing history is never cleared or replaced. */
export async function restoreExpenses(
  rest: RestClient,
  token: string,
  id: string,
  commands: readonly ExpenseCommand[],
): Promise<ExpenseRead> {
  const history = parseExpenseHistory(commands);
  if (history === null) return { status: "damaged", message: "The expense backup is invalid. Nothing was written." };
  const before = await readExpenses(rest, token, id);
  if (before.status === "ok" && containsExpenseCommands(before.commands, history.commands)) return before;
  if (before.status !== "absent" && (before.status !== "ok" || before.commands.length !== 0)) {
    return {
      status: "damaged",
      message:
        before.status === "unavailable"
          ? "Google could not be checked. No recovery records were submitted; keep the backup and reconnect."
          : "Expense recovery requires an empty expense history. Existing or damaged records were not replaced.",
    };
  }
  let setup: "confirmed" | "not-written" | "unknown";
  if (before.status === "absent") {
    // A new log, header, ownership markers and all commands are one atomic batch.
    setup = await initializeExpenseLog(rest, token, id, EXPENSE_LOG_TITLE, commands);
  } else {
    // A refused earlier day save may have left an owned log with just its header.
    // Append the complete recovery in one request; never clear or recreate that log.
    // A competing writer can add records after the empty check. Their records remain,
    // and same-day siblings become explicit conflicts in the checked read-back.
    const found = await inspect(rest, token, id);
    if (found.status !== "ok")
      return {
        status: "damaged",
        message: "Google could not confirm the empty expense store. No recovery records were submitted.",
      };
    const tab = found.tabs.find((item) => item.markers.includes(ROLE));
    if (tab === undefined)
      return {
        status: "damaged",
        message: "The checked expense record tab is missing. No recovery records were submitted.",
      };
    const answer = await callRest(rest, token, {
      method: "POST",
      url: `${SHEETS}/${encodeURIComponent(id)}/values/${encodeURIComponent(`'${tab.title.replaceAll("'", "''")}'!A:C`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      body: {
        values: commands.map((command) => {
          const payload = canonicalJson(command);
          return ["1", payload, sha256Hex(payload)];
        }),
      },
    });
    setup = answer.ok ? "confirmed" : wroteNothing(answer.failure) ? "not-written" : "unknown";
  }
  // A lost response is reconciled by reading, never by submitting recovery again.
  const read = await readExpenses(rest, token, id, true);
  if (setup === "unknown" && read.status !== "ok")
    return {
      status: "unavailable",
      message:
        "The recovery response was lost and its records are not confirmed yet. Keep the backup and check the original workbook before any retry.",
    };
  if (setup === "not-written" && read.status !== "ok")
    return {
      status: "damaged",
      message: "Google did not accept expense recovery. No recovery records were submitted; the backup is unchanged.",
    };
  if (read.status !== "ok") return read;
  if (!containsExpenseCommands(read.commands, history.commands))
    return setup === "not-written"
      ? {
          status: "damaged",
          message:
            "Expense recovery was not submitted. Existing records were preserved; keep the backup and reconnect before trying again.",
        }
      : {
          status: "unavailable",
          message: "Expense recovery outcome could not be confirmed. Preserve your backup and check before retrying.",
        };
  await refreshExpenseView(rest, token, id, read.days, read.conflicts);
  return read;
}
