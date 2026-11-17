import { canonicalJson } from "./CanonicalJson";
import { type IsoDate, parseIsoDate } from "./IsoDate";
import { type EuroCents, toEuroCents } from "./Money";

/**
 * A checkpoint is a dated observation of the portfolio's total value and nothing
 * else: no cash, no gain, no percentage. The log is append-only: an observation
 * is corrected by voiding it and adding another. Nothing here reads the ledger,
 * and the ledger never reads this.
 */

export const MAX_NOTE_LENGTH = 120;
/**
 * No more than this many `add` commands are admitted into a log. It is sized so a whole log, withdrawals
 * included and with every note at its longest and fully escaped, still fits the device copy (CheckpointStore).
 */
export const ADD_ADMISSION_LIMIT = 1_500;
/** A log is readable up to this many physical commands; it absorbs concurrent overflow and duplicate rows. */
export const READ_SAFE_LIMIT = 4_500;
/** A separate guard on how many physical rows are examined at all, so a huge sheet cannot exhaust the device. */
export const MAX_PHYSICAL_ROWS = 200_000;
/** One hundred billion euro, far beyond any real portfolio and far inside exact integer range. */
export const MAX_CHECKPOINT_CENTS = 10_000_000_000_000;

export interface AddCheckpointCommand {
  readonly id: string;
  readonly kind: "add";
  readonly date: IsoDate;
  readonly cents: EuroCents;
  readonly note: string;
}
export interface VoidCheckpointCommand {
  readonly id: string;
  readonly kind: "void";
  /** The id of the `add` being withdrawn. */
  readonly target: string;
}
export type CheckpointCommand = AddCheckpointCommand | VoidCheckpointCommand;

export interface Checkpoint {
  readonly id: string;
  readonly date: IsoDate;
  readonly cents: EuroCents;
  readonly note: string;
}

/** One marker per date on the chart: the latest active checkpoint of that date, and how many there are. */
export interface CheckpointMarker extends Checkpoint {
  readonly count: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 100;
}

/** A note is plain text: bounded and never starting with a formula character. */
export function isSafeNote(note: string): boolean {
  return note.length <= MAX_NOTE_LENGTH && !/^[=+@-]/u.test(note);
}

/** Strict shape check. Anything else, including extra keys, is not a command. */
export function parseCheckpointCommand(value: unknown): CheckpointCommand | null {
  if (!isRecord(value) || !isId(value["id"])) return null;
  const keys = Object.keys(value).sort().join();
  if (value["kind"] === "add") {
    if (keys !== "cents,date,id,kind,note") return null;
    const date = typeof value["date"] === "string" ? parseIsoDate(value["date"]) : null;
    const cents = typeof value["cents"] === "number" ? toEuroCents(value["cents"]) : null;
    const note = value["note"];
    if (
      date === null ||
      date !== value["date"] ||
      cents === null ||
      cents < 0 ||
      cents > MAX_CHECKPOINT_CENTS ||
      typeof note !== "string" ||
      !isSafeNote(note)
    )
      return null;
    return { id: value["id"], kind: "add", date, cents, note };
  }
  if (value["kind"] === "void") {
    if (keys !== "id,kind,target" || !isId(value["target"])) return null;
    return { id: value["id"], kind: "void", target: value["target"] };
  }
  return null;
}

export interface CheckpointHistory {
  /** Every distinct command, in log order. Identical repeats of one id are collapsed. */
  readonly commands: readonly CheckpointCommand[];
}

/**
 * Validates a whole log read from outside. The same id with an identical payload
 * counts once (a retried append cannot duplicate); the same id with a different
 * payload makes the log damaged. A void of an unknown target is ignored, not
 * damaging. The read-safe limit applies to distinct commands, after identical repeats are collapsed;
 * a separate, larger bound guards how many physical rows are examined.
 */
export function parseCheckpointHistory(value: unknown): CheckpointHistory | null {
  if (!Array.isArray(value) || value.length > MAX_PHYSICAL_ROWS) return null;
  const seen = new Map<string, string>();
  const commands: CheckpointCommand[] = [];
  for (const raw of value as unknown[]) {
    const command = parseCheckpointCommand(raw);
    if (command === null) return null;
    const text = canonicalJson(command);
    const prior = seen.get(command.id);
    if (prior !== undefined) {
      if (prior !== text) return null;
      continue;
    }
    seen.set(command.id, text);
    commands.push(command);
    if (commands.length > READ_SAFE_LIMIT) return null;
  }
  return { commands };
}

/** Active checkpoints in log order: an `add` that no `void` withdraws. */
export function activeCheckpoints(commands: readonly CheckpointCommand[]): Checkpoint[] {
  const withdrawn = new Set<string>();
  for (const command of commands) if (command.kind === "void") withdrawn.add(command.target);
  return commands.flatMap((command): Checkpoint[] =>
    command.kind === "add" && !withdrawn.has(command.id)
      ? [{ id: command.id, date: command.date, cents: command.cents, note: command.note }]
      : [],
  );
}

/** One marker per date, the latest active checkpoint of that date in log order, oldest date first. */
export function chartMarkers(active: readonly Checkpoint[]): CheckpointMarker[] {
  const byDate = new Map<IsoDate, { latest: Checkpoint; count: number }>();
  for (const checkpoint of active) {
    const entry = byDate.get(checkpoint.date);
    byDate.set(checkpoint.date, { latest: checkpoint, count: (entry?.count ?? 0) + 1 });
  }
  return [...byDate.values()]
    .sort((left, right) => (left.latest.date < right.latest.date ? -1 : 1))
    .map(({ latest, count }) => ({ ...latest, count }));
}

export type Admission =
  | { readonly status: "admit" }
  /** The command changes nothing (it voids something already voided), so it is not written. */
  | { readonly status: "no-op" }
  | { readonly status: "refuse"; readonly message: string };

/**
 * Decides whether a command may be appended to this log. Pure. `today` is the
 * user's local date: a checkpoint cannot be recorded for a day that has not come.
 */
export function admitCheckpoint(
  commands: readonly CheckpointCommand[],
  command: CheckpointCommand,
  today: IsoDate,
): Admission {
  if (parseCheckpointCommand(command) === null)
    return { status: "refuse", message: "Enter a valid date, an amount and a short plain note." };
  const prior = commands.find((entry) => entry.id === command.id);
  if (prior !== undefined) {
    return canonicalJson(prior) === canonicalJson(command)
      ? { status: "no-op" }
      : { status: "refuse", message: "That save identifier already belongs to a different checkpoint." };
  }
  if (command.kind === "add") {
    if (command.date > today)
      return { status: "refuse", message: "A checkpoint can be recorded only when its day has come." };
    if (commands.filter((entry) => entry.kind === "add").length >= ADD_ADMISSION_LIMIT)
      return {
        status: "refuse",
        message: "This log holds as many checkpoints as it accepts. Void one you no longer need first.",
      };
    return { status: "admit" };
  }
  const target = commands.find((entry) => entry.id === command.target);
  if (target === undefined || target.kind !== "add")
    return { status: "refuse", message: "That checkpoint is not in this log." };
  const alreadyVoided = commands.some((entry) => entry.kind === "void" && entry.target === command.target);
  return alreadyVoided ? { status: "no-op" } : { status: "admit" };
}
