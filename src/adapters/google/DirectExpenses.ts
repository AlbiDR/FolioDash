import type { ExpenseConflict, ExpenseSaveOutcome } from "../../applications/ExpenseModel";
import { bufferedGrid, plainCell, type Grid, type GridCell } from "../../applications/SheetGrid";
import { canonicalJson } from "../../core/CanonicalJson";
import { toSpreadsheetSerial, type IsoDate } from "../../core/IsoDate";
import { sha256Hex } from "../../core/Sha256";
import { EXPENSE_LABELS, EXPENSE_OPTIONAL_INDICES, EXPENSE_REPORTING_POLICY, expenseDayKind, expenseReport, expenseWeek, filledExpenseFields, parseExpenseCommand, sumExpenseAmounts, weekDates, type ExpenseCommand, type ExpenseDay } from "../../core/WorkExpenses";
import type { EuroCents } from "../../core/Money";
import { writeGridTabs } from "./GoogleWorkbook";
import { EXPENSE_METADATA_KEY, EXPENSE_RECORD_ROLE, EXPENSE_VIEW_TITLE, LEDGER_TAB } from "./SheetsLayout";
import { callRest, wroteNothing, type RestClient } from "./Rest";

const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";
export const EXPENSE_LOG_TITLE = "_FolioDash expenses";
export { EXPENSE_VIEW_TITLE } from "./SheetsLayout";
const KEY = EXPENSE_METADATA_KEY;
const ROLE = EXPENSE_RECORD_ROLE;
const ANCHOR = "enabled-v1";
const HEADER = ["schema", "payload", "checksum"];
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

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function commandOf(value: unknown): ExpenseCommand | null {
  const item = object(value);
  if (item === null || Object.keys(item).sort().join() !== "amounts,date,expectedRevision,id") return null;
  return parseExpenseCommand(item);
}
function headToken(heads: ReadonlySet<string>): string | null {
  const ids = [...heads].sort();
  return ids.length > 1 ? `conflict:${sha256Hex(canonicalJson(ids))}` : ids[0] ?? null;
}

/** Validates the complete correction graph. Branches remain visible until a reviewed resolution names all heads. */
export function parseExpenseHistory(value: unknown): ExpenseHistory | null {
  if (!Array.isArray(value) || value.length > MAX_COMMANDS) return null;
  const commands: ExpenseCommand[] = [];
  const ids = new Map<string, string>();
  type Graph = { heads: Set<string>; nodes: Map<string, ExpenseCommand>; tokens: Map<string | null, readonly string[]> };
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
  return JSON.stringify({ format: "foliodash-work-expenses", version: 1, commands, checksum: sha256Hex(canonicalJson(commands)) });
}
/** A later legitimate append must not make an acknowledged earlier command uncertain. */
export function containsExpenseCommands(actual: readonly ExpenseCommand[], expected: readonly ExpenseCommand[]): boolean {
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

interface Tab { readonly id: number; readonly title: string; readonly markers: readonly string[] }
async function inspect(rest: RestClient, token: string, id: string): Promise<{ readonly status: "ok"; readonly tabs: readonly Tab[] } | { readonly status: "unavailable"; readonly message: string }> {
  const answer = await callRest(rest, token, { method: "GET", url: `${SHEETS}/${encodeURIComponent(id)}?fields=${encodeURIComponent("sheets(properties(sheetId,title),developerMetadata)")}` });
  if (!answer.ok) return { status: "unavailable", message: "Your work expense records could not be checked against Google. Nothing on this device was replaced." };
  const sheets = object(answer.value)?.["sheets"];
  if (!Array.isArray(sheets)) return { status: "unavailable", message: "Google returned an unrecognised workbook description." };
  const tabs: Tab[] = [];
  for (const raw of sheets as unknown[]) {
    const item = object(raw);
    const rawProps = object(item?.["properties"]);
    const props: Record<string, unknown> | null = rawProps === null ? null : { ...rawProps, sheetId: rawProps["sheetId"] ?? 0 };
    if (typeof props?.["sheetId"] !== "number" || typeof props["title"] !== "string") return { status: "unavailable", message: "Google returned an unrecognised sheet description." };
    const metadata = item?.["developerMetadata"];
    const markers = (Array.isArray(metadata) ? metadata as unknown[] : []).flatMap((entry): string[] => {
      const marker = object(entry);
      const location = object(marker?.["location"]);
      return marker?.["metadataKey"] === KEY && typeof marker["metadataValue"] === "string" && location !== null && location["sheetId"] === props["sheetId"] && location["dimensionRange"] === undefined ? [marker["metadataValue"]] : [];
    });
    tabs.push({ id: props["sheetId"], title: props["title"], markers });
  }
  return { status: "ok", tabs };
}
const damaged = (): ExpenseRead => ({ status: "damaged", message: "Work expense history failed its checks or its records tab is missing. Nothing was reset. Keep your backup and review Your data." });

/** Read-only discovery. The durable anchor survives removal of the records tab, preventing accidental reinitialisation. */
export async function readExpenses(rest: RestClient, token: string, id: string, expectedInitialized = false): Promise<ExpenseRead> {
  const found = await inspect(rest, token, id);
  if (found.status !== "ok") return found;
  const records = found.tabs.filter((tab) => tab.markers.includes(ROLE));
  const anchors = found.tabs.filter((tab) => tab.markers.includes(ANCHOR));
  if (found.tabs.some((tab) => tab.markers.some((marker) => marker !== ROLE && marker !== ANCHOR))) return damaged();
  if (records.length === 0 && anchors.length === 0) return expectedInitialized ? damaged() : { status: "absent" };
  const tab = records[0];
  if (records.length !== 1 || anchors.length !== 1 || tab === undefined || tab.markers.length !== 1 || anchors[0]?.markers.length !== 1 || tab.id === anchors[0].id || anchors[0].title !== LEDGER_TAB) return damaged();
  const answer = await callRest(rest, token, { method: "GET", url: `${SHEETS}/${encodeURIComponent(id)}/values/${encodeURIComponent(`'${tab.title.replaceAll("'", "''")}'!A:C`)}?valueRenderOption=UNFORMATTED_VALUE` });
  if (!answer.ok) return { status: "unavailable", message: "Work expense records could not be read. Your saved copy was preserved." };
  const values = object(answer.value)?.["values"];
  if (!Array.isArray(values) || !Array.isArray(values[0]) || values[0].join("|") !== HEADER.join("|")) return damaged();
  const commands: unknown[] = [];
  for (const raw of values.slice(1) as unknown[]) {
    if (!Array.isArray(raw) || raw.length !== 3 || raw[0] !== "1" || typeof raw[1] !== "string" || raw[1].length > 2048 || raw[2] !== sha256Hex(raw[1])) return damaged();
    try { commands.push(JSON.parse(raw[1]) as unknown); } catch { return damaged(); }
  }
  const history = parseExpenseHistory(commands);
  return history === null ? damaged() : { status: "ok", initialized: true, ...history };
}

/** Adds ownership, the durable enabled marker and the header in one atomic batch, only for explicit financial actions. */
async function initialize(rest: RestClient, token: string, id: string, commands: readonly ExpenseCommand[] = []): Promise<"confirmed" | "not-written" | "unknown"> {
  const found = await inspect(rest, token, id);
  if (found.status !== "ok") return "not-written";
  if (found.tabs.some((tab) => tab.markers.length > 0)) return "not-written";
  const ledger = found.tabs.find((tab) => tab.title === LEDGER_TAB);
  if (ledger === undefined) return "not-written";
  const sheetId = Math.max(...found.tabs.map((tab) => tab.id), 0) + 1;
  const names = new Set(found.tabs.map((tab) => tab.title));
  let title = EXPENSE_LOG_TITLE;
  for (let suffix = 2; names.has(title); suffix++) title = `${EXPENSE_LOG_TITLE} (${String(suffix)})`;
  const metadata = (sheet: number, role: string): unknown => ({ createDeveloperMetadata: { developerMetadata: { metadataKey: KEY, metadataValue: role, location: { sheetId: sheet }, visibility: "DOCUMENT" } } });
  const result = await callRest(rest, token, { method: "POST", url: `${SHEETS}/${encodeURIComponent(id)}:batchUpdate`, body: { requests: [
    { addSheet: { properties: { sheetId, title, hidden: true, gridProperties: { rowCount: Math.max(2, commands.length + 1), columnCount: 3, frozenRowCount: 1 } } } },
    metadata(sheetId, ROLE), metadata(ledger.id, ANCHOR),
    { updateCells: { start: { sheetId, rowIndex: 0, columnIndex: 0 }, rows: [HEADER, ...commands.map((command) => { const text = canonicalJson(command); return ["1", text, sha256Hex(text)]; })].map((row) => ({ values: row.map((text) => ({ userEnteredValue: { stringValue: text } })) })), fields: "userEnteredValue" } },
  ] } });
  return result.ok ? "confirmed" : wroteNothing(result.failure) ? "not-written" : "unknown";
}

function currentRevision(read: Extract<ExpenseRead, { status: "ok" }>, date: IsoDate): string | null {
  return read.conflicts.find((item) => item.date === date)?.revision ?? read.days.find((item) => item.date === date)?.revision ?? null;
}
async function saved(rest: RestClient, token: string, id: string, read: Extract<ExpenseRead, { status: "ok" }>, command: ExpenseCommand, today?: IsoDate): Promise<DirectExpenseOutcome> {
  const collision = read.conflicts.find((item) => item.date === command.date);
  const newest = read.days.find((item) => item.date === command.date);
  if (collision !== undefined || newest?.revision !== command.id) return { ...read, status: "conflict", message: "This day also changed on another device. Review the saved versions before choosing its amounts." };
  const viewUpdated = await refreshExpenseView(rest, token, id, read.days, read.conflicts, today);
  return { ...read, status: "saved", viewUpdated };
}

/** Reads the original command without re-appending; confirmation may refresh the derived view. Absence after a lost response remains uncertain. */
export async function checkExpense(rest: RestClient, token: string, id: string, command: ExpenseCommand, expectedInitialized = true, today?: IsoDate): Promise<DirectExpenseOutcome> {
  const read = await readExpenses(rest, token, id, expectedInitialized);
  if (read.status !== "ok") return { status: "unknown", message: "The save outcome could not be checked yet. Keep this page open and check again before another save." };
  const prior = read.commands.find((item) => item.id === command.id);
  if (prior === undefined) return { status: "unknown", message: "That command is not visible in Google yet. Keep the draft and check again; do not submit it as a new save." };
  if (canonicalJson(prior) !== canonicalJson(command)) return { status: "not-saved", message: "That save identifier already belongs to different amounts. Nothing further was written." };
  return saved(rest, token, id, read, command, today);
}

export async function saveExpense(rest: RestClient, token: string, id: string, command: ExpenseCommand, expectedInitialized = false, today?: IsoDate): Promise<DirectExpenseOutcome> {
  if (today !== undefined && command.date > today) return { status: "not-saved", message: "Future dates can be browsed, but expenses can be saved only when the day arrives." };
  if (commandOf(command) === null) return { status: "not-saved", message: "Enter valid weekday amounts before saving." };
  let read = await readExpenses(rest, token, id, expectedInitialized);
  if (read.status === "absent") {
    await initialize(rest, token, id);
    read = await readExpenses(rest, token, id);
    // No command append has been attempted yet, even if the structural setup
    // response was lost. Do not strand an unsent command as an uncertain save.
    if (read.status !== "ok") return { status: "not-saved", message: "Work expense setup could not be confirmed. No expense entry was submitted; check the Google connection before trying again." };
  }
  if (read.status !== "ok") return { status: "not-saved", message: read.message };
  const prior = read.commands.find((item) => item.id === command.id);
  if (prior !== undefined) {
    if (canonicalJson(prior) !== canonicalJson(command)) return { status: "not-saved", message: "That save identifier already belongs to a different entry." };
    return saved(rest, token, id, read, command, today);
  }
  if (currentRevision(read, command.date) !== command.expectedRevision) return { ...read, status: "conflict", message: "This day changed since you opened it. Review the current amounts before saving a correction." };
  const found = await inspect(rest, token, id);
  if (found.status !== "ok") return { status: "not-saved", message: found.message };
  const tab = found.tabs.find((item) => item.markers.includes(ROLE));
  if (tab === undefined) return { status: "not-saved", message: "The expense record tab is missing. Nothing was written." };
  const payload = canonicalJson(command);
  const append = await callRest(rest, token, { method: "POST", url: `${SHEETS}/${encodeURIComponent(id)}/values/${encodeURIComponent(`'${tab.title.replaceAll("'", "''")}'!A:C`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, body: { values: [["1", payload, sha256Hex(payload)]] } });
  if (!append.ok && wroteNothing(append.failure)) return { status: "not-saved", message: "Google refused this save. Your draft is intact; reconnect before trying again." };
  return checkExpense(rest, token, id, command, true, today);
}

/** Exact values, typed dates and explicit partial/conflict states; no spreadsheet calculation alternatives. */
export async function refreshExpenseView(rest: RestClient, token: string, id: string, days: readonly ExpenseDay[], conflicts: readonly ExpenseConflict[] = [], today?: IsoDate): Promise<boolean> {
  return (await writeGridTabs(rest, token, id, [{ title: EXPENSE_VIEW_TITLE, grid: expenseView(days, conflicts, today) }])).ok;
}

/** The same checked expense projection is used after saves and workbook organization. */
export function expenseView(days: readonly ExpenseDay[], conflicts: readonly ExpenseConflict[] = [], today?: IsoDate): Grid {
  const money = (amount: EuroCents | null): GridCell => amount === null ? plainCell("") : { value: amount / 100, format: '#,##0.00" €"', emphasis: null };
  const startDate = [...days].sort((left, right) => left.date.localeCompare(right.date))[0]?.date ?? null;
  const descriptions = { complete: "Recorded workday", partial: "Needs review; amount recorded so far", "no-work": "No onsite work", "not-entered": "Not entered yet", future: "Future date", "outside-history": "Outside tracked history", weekend: "Weekend" };
  const rows: GridCell[][] = [
    [plainCell("Work expenses", "header")],
    [plainCell("Costs incurred because of onsite work. Dinner and Other Expenses are optional. Rebuilt from checked records; edit in FolioDash.")],
    [plainCell("Date", "header"), ...EXPENSE_LABELS.map((label, index) => plainCell(EXPENSE_OPTIONAL_INDICES.some(optional => optional === index) ? `${label} (optional)` : label, "header")), plainCell("Recorded amount", "header"), plainCell("State", "header")],
    ...days.map((day) => [
      { value: toSpreadsheetSerial(day.date), format: "dd/mm/yyyy", emphasis: null },
      ...day.amounts.map(money),
      money(filledExpenseFields(day.amounts) === 0 ? null : sumExpenseAmounts(day.amounts)),
      plainCell(descriptions[expenseDayKind(day, day.date, today ?? day.date, startDate)]),
    ]),
    ...conflicts.map((conflict) => [plainCell(conflict.date), plainCell("Conflicting saved versions; review in FolioDash")]),
  ];
  rows.push([plainCell("Weekly recorded spending", "header")]);
  for (const monday of [...new Set([...days, ...conflicts].flatMap((day) => weekDates(day.date)[0] ?? []))].sort()) {
    const total = expenseWeek(days, monday, today ?? weekDates(monday)[4] ?? monday);
    const unresolved = conflicts.some((conflict) => total.dates.includes(conflict.date));
    rows.push([plainCell(monday), money(unresolved || total.completeDays + total.partialDays === 0 ? null : total.total), plainCell(unresolved ? "Resolve conflicting versions first" : `${String(total.partialDays)} partial day(s); sum of entered amounts`)]);
  }
  if (today !== undefined) {
    rows.push([plainCell(`Annual recap: ${EXPENSE_REPORTING_POLICY}, completed-periods`, "header")], [plainCell(`As of ${today}; Dinner and Other Expenses may stay blank. An entered Dinner or Other Expenses amount, including zero, completes a day; otherwise missing commute/lunch entries are excluded from averages. Estimates exclude leave and holidays.`)]);
    for (const year of [...new Set([Number(today.slice(0, 4)), ...days.map((day) => Number(day.date.slice(0, 4)))])].sort()) {
      const report = expenseReport(days, year, today);
      const unresolved = conflicts.some((conflict) => Number(conflict.date.slice(0, 4)) === year);
      rows.push([plainCell(String(year), "strong")]);
      const metrics = [["Average Daily", report.averageDaily], ["Average Weekly", report.averageWeekly], ["Average Monthly", report.averageMonthly], ["Total Yearly", report.totalYearly], ["Yearly Projection (estimate)", report.yearlyProjection]] as const;
      for (const [label, amount] of metrics) rows.push([plainCell(label), money(unresolved ? null : amount), plainCell(unresolved ? "Resolve conflicting versions first" : amount === null ? "Not enough eligible history" : "See FolioDash for period counts and definitions")]);
    }
  }
  return bufferedGrid(rows, [140, 160, 130, 160, 130, 160, 150, 260]);
}

/** Explicit recovery into an absent or verified empty store. Existing history is never cleared or replaced. */
export async function restoreExpenses(rest: RestClient, token: string, id: string, commands: readonly ExpenseCommand[]): Promise<ExpenseRead> {
  const history = parseExpenseHistory(commands);
  if (history === null) return { status: "damaged", message: "The expense backup is invalid. Nothing was written." };
  const before = await readExpenses(rest, token, id);
  if (before.status === "ok" && containsExpenseCommands(before.commands, history.commands)) return before;
  if (before.status !== "absent" && (before.status !== "ok" || before.commands.length !== 0)) {
    return { status: "damaged", message: before.status === "unavailable" ? "Google could not be checked. No recovery records were submitted; keep the backup and reconnect." : "Expense recovery requires an empty expense history. Existing or damaged records were not replaced." };
  }
  let setup: "confirmed" | "not-written" | "unknown";
  if (before.status === "absent") {
    // A new log, header, ownership markers and all commands are one atomic batch.
    setup = await initialize(rest, token, id, commands);
  } else {
    // A refused earlier day save may have left an owned log with just its header.
    // Append the complete recovery in one request; never clear or recreate that log.
    // A competing writer can add records after the empty check. Their records remain,
    // and same-day siblings become explicit conflicts in the checked read-back.
    const found = await inspect(rest, token, id);
    if (found.status !== "ok") return { status: "damaged", message: "Google could not confirm the empty expense store. No recovery records were submitted." };
    const tab = found.tabs.find((item) => item.markers.includes(ROLE));
    if (tab === undefined) return { status: "damaged", message: "The checked expense record tab is missing. No recovery records were submitted." };
    const answer = await callRest(rest, token, { method: "POST", url: `${SHEETS}/${encodeURIComponent(id)}/values/${encodeURIComponent(`'${tab.title.replaceAll("'", "''")}'!A:C`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, body: { values: commands.map((command) => { const payload = canonicalJson(command); return ["1", payload, sha256Hex(payload)]; }) } });
    setup = answer.ok ? "confirmed" : wroteNothing(answer.failure) ? "not-written" : "unknown";
  }
  // A lost response is reconciled by reading, never by submitting recovery again.
  const read = await readExpenses(rest, token, id, true);
  if (setup === "unknown" && read.status !== "ok") return { status: "unavailable", message: "The recovery response was lost and its records are not confirmed yet. Keep the backup and check the original workbook before any retry." };
  if (setup === "not-written" && read.status !== "ok") return { status: "damaged", message: "Google did not accept expense recovery. No recovery records were submitted; the backup is unchanged." };
  if (read.status !== "ok") return read;
  if (!containsExpenseCommands(read.commands, history.commands)) return setup === "not-written"
    ? { status: "damaged", message: "Expense recovery was not submitted. Existing records were preserved; keep the backup and reconnect before trying again." }
    : { status: "unavailable", message: "Expense recovery outcome could not be confirmed. Preserve your backup and check before retrying." };
  await refreshExpenseView(rest, token, id, read.days, read.conflicts);
  return read;
}
