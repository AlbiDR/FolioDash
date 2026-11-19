import { describe, expect, it } from "vitest";
import { sha256Hex } from "../../core/integrity/sha256";
import { type LedgerRow, REVISION_SOURCES_SCHEMA, SCHEMA } from "./row-ledger-record";
import { DamagedLedger, decodeRows, recordsChecksum } from "./row-ledger-decode";

const REVISION = "revision-1";

// A row with a correct checksum for its own payload, unless the test overrides it.
function row(type: string, payload: string, checksum = sha256Hex(payload)): LedgerRow {
  return { type, payload, revision: REVISION, checksum } as LedgerRow;
}

const header = (extra: Record<string, unknown> = {}): string => JSON.stringify({ schema: SCHEMA, funds: [], ...extra });
const timeline = (): string => JSON.stringify([]);

// Closes the given records with a commit row whose count and checksum are correct, so that a test reaches the check it names.
function closed(records: readonly LedgerRow[], count = records.length): LedgerRow[] {
  const commit = row(
    "COMMIT",
    JSON.stringify({ count, commandId: "command-1", requestHash: "hash" }),
    recordsChecksum(records),
  );
  return [...records, commit];
}

function damage(rows: readonly LedgerRow[]): string {
  try {
    decodeRows(rows);
  } catch (error) {
    if (error instanceof DamagedLedger) return error.message;
    throw error;
  }
  throw new Error("expected the ledger to be reported as damaged");
}

describe("decoding a committed revision", () => {
  it("reads an empty ledger when there is no commit record", () => {
    expect(decodeRows([row("META", header())]).references).toEqual([]);
  });

  it("reports a commit record that is not in the expected form", () => {
    expect(damage([row("COMMIT", "5")])).toBe("A commit record is not in the expected form.");
  });

  it("reports a commit record that is not valid JSON", () => {
    expect(damage([row("COMMIT", "not json")])).toBe("A stored record is not valid JSON.");
  });

  it("reports a committed record whose checksum does not match its payload", () => {
    const records = [row("META", header(), "wrong"), row("TIMELINE", timeline())];
    expect(damage(closed(records))).toBe("A committed record failed its checksum.");
  });

  it("reports a committed revision with no header record first", () => {
    const records = [row("TIMELINE", timeline())];
    expect(damage(closed(records))).toBe("The committed revision has no header record.");
  });

  it("reports a committed revision holding a record type it should not", () => {
    const records = [row("META", header()), row("TIMELINE", timeline()), row("BOGUS", "{}")];
    expect(damage(closed(records))).toBe("The committed revision has an invalid structure.");
  });

  it("reports a committed revision with no timeline", () => {
    const records = [row("META", header()), row("SNAPSHOT", "{}")];
    expect(damage(closed(records))).toBe("The committed revision has an invalid structure.");
  });

  it("reports a commit whose count does not match the revision it closes", () => {
    const records = [row("META", header()), row("TIMELINE", timeline())];
    expect(damage(closed(records, 5))).toBe("The commit record does not match the revision it closes.");
  });

  it("reports a commit whose checksum does not match the revision it closes", () => {
    const records = [row("META", header()), row("TIMELINE", timeline())];
    const commit = row("COMMIT", JSON.stringify({ count: 2, commandId: "c", requestHash: "h" }), "not-the-checksum");
    expect(damage([...records, commit])).toBe("The commit record does not match the revision it closes.");
  });

  it("reports an unsupported format version", () => {
    const records = [row("META", header({ schema: 999 })), row("TIMELINE", timeline())];
    expect(damage(closed(records))).toBe("The ledger uses an unsupported format version.");
  });

  it("reports a header that is not in the expected form", () => {
    const records = [row("META", JSON.stringify({ schema: SCHEMA })), row("TIMELINE", timeline())];
    expect(damage(closed(records))).toBe("The ledger header is not in the expected form.");
  });

  it("reports a recovery reference that is not a non-empty string", () => {
    const records = [row("META", header({ recoveryTarget: 5 })), row("TIMELINE", timeline())];
    expect(damage(closed(records))).toBe("The recovery reference is invalid.");
  });

  it("reports a timeline that is not a list of index and checksum pairs", () => {
    const records = [row("META", header()), row("TIMELINE", JSON.stringify({ not: "a list" }))];
    expect(damage(closed(records))).toBe("The ledger timeline is not in the expected form.");
  });

  it("reads a revision that uses the current format version", () => {
    const records = [
      row("META", JSON.stringify({ schema: REVISION_SOURCES_SCHEMA, funds: [] })),
      row("TIMELINE", timeline()),
    ];
    expect(() => decodeRows(closed(records))).not.toThrow();
  });
});
