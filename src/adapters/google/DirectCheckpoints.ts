import { canonicalJson } from "../../core/CanonicalJson";
import { type CheckpointCommand, admitCheckpoint, parseCheckpointHistory } from "../../core/Checkpoints";
import type { IsoDate } from "../../core/IsoDate";
import { sha256Hex } from "../../core/Sha256";
import { callRest, wroteNothing, type RestClient } from "./Rest";
import { LEDGER_TAB } from "./SheetsLayout";

/**
 * Value-only checkpoints kept in their own hidden tab of the person's spreadsheet.
 * The ledger and the work expenses never read this, and this never reads them.
 * Like the expense log it is append-only, one command per row with a checksum,
 * tagged by developer metadata under its own key, and anchored on the ledger tab
 * so a deleted records tab is reported, never silently replaced by an empty log.
 */

const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";
export const CHECKPOINT_LOG_TITLE = "_FolioDash checkpoints";
export const CHECKPOINT_METADATA_KEY = "foliodash.checkpoints";
const KEY = CHECKPOINT_METADATA_KEY;
const ROLE = "records-v1";
const ANCHOR = "enabled-v1";
const HEADER = ["schema", "payload", "checksum"];

export type CheckpointRead =
  | { readonly status: "ok"; readonly commands: readonly CheckpointCommand[] }
  | { readonly status: "absent" }
  | { readonly status: "damaged" | "unavailable"; readonly message: string };

/**
 * What an attempt to add a command came to. Only `saved` means the command is in Google.
 * `no-op`, `refused` and `not-submitted` are known to have appended nothing and carry the
 * latest authoritative log when it could be read. `unknown` may have appended: never retried blindly.
 */
export type CheckpointOutcome =
  | { readonly status: "saved"; readonly commands: readonly CheckpointCommand[] }
  | { readonly status: "no-op"; readonly commands: readonly CheckpointCommand[] }
  | { readonly status: "refused"; readonly message: string; readonly commands?: readonly CheckpointCommand[] }
  /** A command with this id is in Google with different content: an integrity failure, never proof nothing was sent. */
  | { readonly status: "conflict"; readonly message: string; readonly commands: readonly CheckpointCommand[] }
  | { readonly status: "not-submitted"; readonly message: string; readonly commands?: readonly CheckpointCommand[] }
  | { readonly status: "unknown"; readonly message: string };

export type CheckpointPreflight =
  | { readonly status: "admit"; readonly commands: readonly CheckpointCommand[]; readonly absent: boolean }
  | { readonly status: "no-op"; readonly commands: readonly CheckpointCommand[] }
  | { readonly status: "refused"; readonly message: string; readonly commands?: readonly CheckpointCommand[] }
  | { readonly status: "unavailable"; readonly message: string };

/** Every command the device already knows must still be in Google's log, with the same content. */
export function includesKnown(remote: readonly CheckpointCommand[], known: readonly CheckpointCommand[]): boolean {
  const byId = new Map(remote.map((command) => [command.id, canonicalJson(command)]));
  return known.every((command) => byId.get(command.id) === canonicalJson(command));
}
const MISSING_KNOWN = "Google is missing checkpoints already saved on this device. Nothing was sent. Your copy was kept; review the workbook before saving another checkpoint.";

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

interface Tab { readonly id: number; readonly title: string; readonly markers: readonly string[] }
async function inspect(rest: RestClient, token: string, id: string): Promise<{ readonly status: "ok"; readonly tabs: readonly Tab[] } | { readonly status: "unavailable"; readonly message: string }> {
  const answer = await callRest(rest, token, { method: "GET", url: `${SHEETS}/${encodeURIComponent(id)}?fields=${encodeURIComponent("sheets(properties(sheetId,title),developerMetadata)")}` });
  if (!answer.ok) return { status: "unavailable", message: "Your checkpoints could not be checked against Google. Nothing on this device was replaced." };
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

const damaged = (): CheckpointRead => ({ status: "damaged", message: "The checkpoint log failed its checks or its records tab is missing. Nothing was reset or recreated. Your device copy was kept." });

/**
 * Read-only discovery. The anchor on the ledger tab survives removal of the records tab, so a
 * deleted log is reported as damaged on every device and never initialised again by accident.
 */
export async function readCheckpoints(rest: RestClient, token: string, id: string, expectedInitialized = false): Promise<CheckpointRead> {
  const found = await inspect(rest, token, id);
  if (found.status !== "ok") return found;
  const records = found.tabs.filter((tab) => tab.markers.includes(ROLE));
  const anchors = found.tabs.filter((tab) => tab.markers.includes(ANCHOR));
  if (found.tabs.some((tab) => tab.markers.some((marker) => marker !== ROLE && marker !== ANCHOR))) return damaged();
  if (records.length === 0 && anchors.length === 0) return expectedInitialized ? damaged() : { status: "absent" };
  const tab = records[0];
  if (records.length !== 1 || anchors.length !== 1 || tab === undefined || tab.markers.length !== 1 || anchors[0]?.markers.length !== 1 || tab.id === anchors[0].id || anchors[0].title !== LEDGER_TAB) return damaged();
  const answer = await callRest(rest, token, { method: "GET", url: `${SHEETS}/${encodeURIComponent(id)}/values/${encodeURIComponent(`'${tab.title.replaceAll("'", "''")}'!A:C`)}?valueRenderOption=UNFORMATTED_VALUE` });
  if (!answer.ok) return { status: "unavailable", message: "Your checkpoints could not be read. Your saved copy was preserved." };
  const values = object(answer.value)?.["values"];
  if (!Array.isArray(values) || !Array.isArray(values[0]) || values[0].join("|") !== HEADER.join("|")) return damaged();
  const commands: unknown[] = [];
  for (const raw of values.slice(1) as unknown[]) {
    if (!Array.isArray(raw) || raw.length !== 3 || raw[0] !== "1" || typeof raw[1] !== "string" || raw[1].length > 2048 || raw[2] !== sha256Hex(raw[1])) return damaged();
    try { commands.push(JSON.parse(raw[1]) as unknown); } catch { return damaged(); }
  }
  const history = parseCheckpointHistory(commands);
  return history === null ? damaged() : { status: "ok", commands: history.commands };
}

/** Adds ownership, the durable anchor and the header in one atomic batch, only when someone saves a first checkpoint. */
async function initialize(rest: RestClient, token: string, id: string): Promise<"confirmed" | "not-written" | "unknown"> {
  const found = await inspect(rest, token, id);
  if (found.status !== "ok") return "not-written";
  if (found.tabs.some((tab) => tab.markers.length > 0)) return "not-written";
  const ledger = found.tabs.find((tab) => tab.title === LEDGER_TAB);
  if (ledger === undefined) return "not-written";
  const sheetId = Math.max(...found.tabs.map((tab) => tab.id), 0) + 1;
  const names = new Set(found.tabs.map((tab) => tab.title));
  let title = CHECKPOINT_LOG_TITLE;
  for (let suffix = 2; names.has(title); suffix++) title = `${CHECKPOINT_LOG_TITLE} (${String(suffix)})`;
  const metadata = (sheet: number, role: string): unknown => ({ createDeveloperMetadata: { developerMetadata: { metadataKey: KEY, metadataValue: role, location: { sheetId: sheet }, visibility: "DOCUMENT" } } });
  const result = await callRest(rest, token, { method: "POST", url: `${SHEETS}/${encodeURIComponent(id)}:batchUpdate`, body: { requests: [
    { addSheet: { properties: { sheetId, title, hidden: true, gridProperties: { rowCount: 2, columnCount: 3, frozenRowCount: 1 } } } },
    metadata(sheetId, ROLE), metadata(ledger.id, ANCHOR),
    { updateCells: { start: { sheetId, rowIndex: 0, columnIndex: 0 }, rows: [HEADER].map((row) => ({ values: row.map((text) => ({ userEnteredValue: { stringValue: text } })) })), fields: "userEnteredValue" } },
  ] } });
  return result.ok ? "confirmed" : wroteNothing(result.failure) ? "not-written" : "unknown";
}

/**
 * Reads the authoritative log and decides, without writing anything, whether a command
 * would change it. A void of something already voided is a no-op and needs no receipt.
 */
export async function preflightCheckpoint(rest: RestClient, token: string, id: string, command: CheckpointCommand, today: IsoDate, expectedInitialized = false, known: readonly CheckpointCommand[] = []): Promise<CheckpointPreflight> {
  const read = await readCheckpoints(rest, token, id, expectedInitialized);
  if (read.status === "damaged" || read.status === "unavailable") return { status: "unavailable", message: read.message };
  const commands = read.status === "ok" ? read.commands : [];
  if (!includesKnown(commands, known)) return { status: "unavailable", message: MISSING_KNOWN };
  const admission = admitCheckpoint(commands, command, today);
  if (admission.status === "refuse") return { status: "refused", message: admission.message, commands };
  if (admission.status === "no-op") return { status: "no-op", commands };
  return { status: "admit", commands, absent: read.status === "absent" };
}

/** Reads the original command without re-appending. A missing command after a lost answer stays unknown. */
export async function checkCheckpoint(rest: RestClient, token: string, id: string, command: CheckpointCommand, expectedInitialized = true): Promise<CheckpointOutcome> {
  const read = await readCheckpoints(rest, token, id, expectedInitialized);
  if (read.status !== "ok") return { status: "unknown", message: "The save outcome could not be checked yet. Keep this page open and check again before another save." };
  const prior = read.commands.find((entry) => entry.id === command.id);
  if (prior === undefined) return { status: "unknown", message: "That checkpoint is not visible in Google yet. Check again; do not submit it as a new one." };
  if (canonicalJson(prior) !== canonicalJson(command)) return { status: "conflict", message: "A checkpoint with this save identifier is in Google with different content. The original save cannot be confirmed. Nothing further was written; review the workbook.", commands: read.commands };
  return { status: "saved", commands: read.commands };
}

/**
 * Appends one command. The authoritative log is read and the command admitted again here, so a
 * change since the caller's preflight (a competing void, say) becomes a no-op instead of a write.
 */
export async function appendCheckpoint(rest: RestClient, token: string, id: string, command: CheckpointCommand, today: IsoDate, expectedInitialized = false, known: readonly CheckpointCommand[] = [], alive: () => boolean = () => true): Promise<CheckpointOutcome> {
  const cancelled: CheckpointOutcome = { status: "not-submitted", message: "The account or device state changed, so nothing was sent." };
  let read = await readCheckpoints(rest, token, id, expectedInitialized);
  if (!alive()) return cancelled;
  if (read.status === "absent") {
    if (command.kind === "void") return { status: "refused", message: "That checkpoint is not in this log.", commands: [] };
    if (!alive()) return cancelled;
    await initialize(rest, token, id);
    read = await readCheckpoints(rest, token, id);
    // No append has been attempted yet, even if the setup answer was lost.
    if (read.status !== "ok") return { status: "not-submitted", message: "Checkpoint setup could not be confirmed. Nothing was submitted; check the Google connection before trying again." };
  }
  if (read.status !== "ok") return { status: "not-submitted", message: read.message };
  // The log read immediately before the append must still hold everything this device knows.
  if (!includesKnown(read.commands, known)) return { status: "not-submitted", message: MISSING_KNOWN };
  const admission = admitCheckpoint(read.commands, command, today);
  if (admission.status === "refuse") return { status: "refused", message: admission.message, commands: read.commands };
  if (admission.status === "no-op") {
    // An identical id already in the log is a confirmed save; anything else changes nothing.
    return read.commands.some((entry) => entry.id === command.id) ? { status: "saved", commands: read.commands } : { status: "no-op", commands: read.commands };
  }
  const found = await inspect(rest, token, id);
  if (found.status !== "ok") return { status: "not-submitted", message: found.message, commands: read.commands };
  // The last look before the write: if Forget or an account change happened during the reads, nothing is submitted.
  if (!alive()) return cancelled;
  const tab = found.tabs.find((entry) => entry.markers.includes(ROLE));
  if (tab === undefined) return { status: "not-submitted", message: "The checkpoint tab is missing. Nothing was written.", commands: read.commands };
  const payload = canonicalJson(command);
  const append = await callRest(rest, token, { method: "POST", url: `${SHEETS}/${encodeURIComponent(id)}/values/${encodeURIComponent(`'${tab.title.replaceAll("'", "''")}'!A:C`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, body: { values: [["1", payload, sha256Hex(payload)]] } });
  if (!append.ok && wroteNothing(append.failure)) return { status: "not-submitted", message: "Google refused this save. Your draft is intact; reconnect before trying again.", commands: read.commands };
  return checkCheckpoint(rest, token, id, command, true);
}
