import { describe, expect, it } from "vitest";
import {
  ADD_ADMISSION_LIMIT,
  MAX_PHYSICAL_ROWS,
  READ_SAFE_LIMIT,
  type CheckpointCommand,
  activeCheckpoints,
  admitCheckpoint,
  chartMarkers,
  isSafeNote,
  parseCheckpointCommand,
  parseCheckpointHistory,
} from "./checkpoints";
import { type IsoDate, parseIsoDate } from "../values/iso-date";
import { type EuroCents, toEuroCents } from "../values/money";

// Synthetic figures only.

function date(text: string): IsoDate {
  const result = parseIsoDate(text);
  if (result === null) throw new Error("bad date");
  return result;
}
function euros(value: number): EuroCents {
  const result = toEuroCents(Math.round(value * 100));
  if (result === null) throw new Error("bad amount");
  return result;
}
const id = (name: string): string => `${name}-00000000`.slice(0, 12);
function add(name: string, on: string, value: number, note = ""): CheckpointCommand {
  return { id: id(name), kind: "add", date: date(on), cents: euros(value), note };
}
function voidOf(name: string, target: string): CheckpointCommand {
  return { id: id(name), kind: "void", target: id(target) };
}
const TODAY = date("2026-11-16");

describe("parseCheckpointCommand", () => {
  it("accepts a well-formed add and void", () => {
    expect(parseCheckpointCommand(add("a1", "2026-11-14", 1234.5, "after bonus"))).not.toBeNull();
    expect(parseCheckpointCommand(voidOf("v1", "a1"))).not.toBeNull();
  });
  it("refuses a bad date, a negative or fractional amount, an unsafe note, extra keys and short ids", () => {
    const good = add("a1", "2026-11-14", 10) as unknown as Record<string, unknown>;
    expect(parseCheckpointCommand({ ...good, date: "2026-02-30" })).toBeNull();
    expect(parseCheckpointCommand({ ...good, cents: -1 })).toBeNull();
    expect(parseCheckpointCommand({ ...good, cents: 10.5 })).toBeNull();
    expect(parseCheckpointCommand({ ...good, note: "=SUM(A1)" })).toBeNull();
    expect(parseCheckpointCommand({ ...good, note: "x".repeat(121) })).toBeNull();
    expect(parseCheckpointCommand({ ...good, extra: true })).toBeNull();
    expect(parseCheckpointCommand({ ...good, id: "short" })).toBeNull();
    expect(parseCheckpointCommand({ id: id("v1"), kind: "void" })).toBeNull();
  });
  it("allows zero and an empty note", () => {
    expect(parseCheckpointCommand(add("a1", "2026-11-14", 0))).not.toBeNull();
    expect(isSafeNote("")).toBe(true);
  });
});

describe("parseCheckpointHistory (P2)", () => {
  it("counts an identical repeat of one id once", () => {
    const first = add("a1", "2026-11-14", 100);
    expect(parseCheckpointHistory([first, first, add("a2", "2026-11-15", 120)])?.commands).toHaveLength(2);
  });
  it("is damaged when one id carries two different payloads", () => {
    expect(parseCheckpointHistory([add("a1", "2026-11-14", 100), add("a1", "2026-11-14", 101)])).toBeNull();
  });
  it("ignores a void of an unknown target rather than damaging the log", () => {
    const history = parseCheckpointHistory([add("a1", "2026-11-14", 100), voidOf("v1", "zz")]);
    expect(history).not.toBeNull();
    expect(activeCheckpoints(history?.commands ?? [])).toHaveLength(1);
  });
  it("refuses anything that is not a list of commands", () => {
    expect(parseCheckpointHistory({})).toBeNull();
    expect(parseCheckpointHistory([{ nope: true }])).toBeNull();
  });
  it("is readable up to the read-safe limit and damaged beyond it", () => {
    const many = (count: number): unknown[] =>
      Array.from({ length: count }, (_, index) => ({
        id: `cmd-${String(index).padStart(8, "0")}`,
        kind: "add",
        date: "2026-11-14",
        cents: 100,
        note: "",
      }));
    expect(parseCheckpointHistory(many(READ_SAFE_LIMIT))).not.toBeNull();
    expect(parseCheckpointHistory(many(READ_SAFE_LIMIT + 1))).toBeNull();
  });
});

describe("read-safe limit counts distinct commands (CP-007, B5b)", () => {
  it("is not damaged by many identical physical rows of one command", () => {
    const one = { id: "dup-00000001", kind: "add", date: "2026-11-14", cents: 100, note: "" };
    const history = parseCheckpointHistory(Array.from({ length: READ_SAFE_LIMIT + 1 }, () => one));
    expect(history?.commands).toHaveLength(1);
  });
  it("still refuses an absurd number of physical rows", () => {
    const one = { id: "dup-00000001", kind: "add", date: "2026-11-14", cents: 100, note: "" };
    expect(parseCheckpointHistory(Array.from({ length: MAX_PHYSICAL_ROWS + 1 }, () => one))).toBeNull();
  });
});

describe("projection (P1)", () => {
  it("excludes voided checkpoints and keeps log order", () => {
    const commands = [add("a1", "2026-11-10", 100), add("a2", "2026-11-12", 120), voidOf("v1", "a1")];
    expect(activeCheckpoints(commands).map((entry) => entry.id)).toEqual([id("a2")]);
  });
  it("shows one marker per date: the latest active in log order, with the count", () => {
    const active = activeCheckpoints([
      add("a1", "2026-11-14", 100),
      add("a2", "2026-11-14", 130),
      add("a3", "2026-11-10", 90),
    ]);
    const markers = chartMarkers(active);
    expect(markers.map((marker) => [marker.date, marker.cents, marker.count])).toEqual([
      [date("2026-11-10"), euros(90), 1],
      [date("2026-11-14"), euros(130), 2],
    ]);
  });
  it("shows the earlier checkpoint again when the latest of a date is voided", () => {
    const active = activeCheckpoints([add("a1", "2026-11-14", 100), add("a2", "2026-11-14", 130), voidOf("v1", "a2")]);
    expect(chartMarkers(active).map((marker) => [marker.cents, marker.count])).toEqual([[euros(100), 1]]);
  });
  it("keeps identical amounts on one date as one marker that lists both", () => {
    const active = activeCheckpoints([add("a1", "2026-11-14", 100), add("a2", "2026-11-14", 100)]);
    expect(chartMarkers(active)).toHaveLength(1);
    expect(chartMarkers(active)[0]?.count).toBe(2);
  });
});

describe("admitCheckpoint (P3)", () => {
  it("admits a valid add and refuses a future date", () => {
    expect(admitCheckpoint([], add("a1", "2026-11-16", 100), TODAY).status).toBe("admit");
    expect(admitCheckpoint([], add("a1", "2026-11-17", 100), TODAY).status).toBe("refuse");
  });
  it("treats an identical resubmission as a no-op and a different payload under the same id as a refusal", () => {
    const first = add("a1", "2026-11-14", 100);
    expect(admitCheckpoint([first], first, TODAY).status).toBe("no-op");
    expect(admitCheckpoint([first], add("a1", "2026-11-14", 101), TODAY).status).toBe("refuse");
  });
  it("stops admitting adds at the limit but still admits a void of any active add", () => {
    const full = Array.from({ length: ADD_ADMISSION_LIMIT }, (_, index): CheckpointCommand => ({
      id: `cmd-${String(index).padStart(8, "0")}`,
      kind: "add",
      date: date("2026-11-14"),
      cents: euros(1),
      note: "",
    }));
    expect(admitCheckpoint(full, add("z1", "2026-11-14", 5), TODAY).status).toBe("refuse");
    expect(admitCheckpoint(full, { id: "void-0000000", kind: "void", target: "cmd-00000007" }, TODAY).status).toBe(
      "admit",
    );
  });
  it("voids an active add, treats voiding an already-voided add as a no-op, and refuses an unknown target", () => {
    const base = [add("a1", "2026-11-14", 100)];
    expect(admitCheckpoint(base, voidOf("v1", "a1"), TODAY).status).toBe("admit");
    expect(admitCheckpoint([...base, voidOf("v1", "a1")], voidOf("v2", "a1"), TODAY).status).toBe("no-op");
    expect(admitCheckpoint(base, voidOf("v3", "nope"), TODAY).status).toBe("refuse");
    expect(admitCheckpoint([...base, voidOf("v1", "a1")], voidOf("v3", "v1"), TODAY).status).toBe("refuse");
  });
  it("lets every remaining active checkpoint be voided after concurrent add overflow", () => {
    const overflow = Array.from({ length: ADD_ADMISSION_LIMIT + 1 }, (_, index): CheckpointCommand => ({
      id: `cmd-${String(index).padStart(8, "0")}`,
      kind: "add",
      date: date("2026-11-14"),
      cents: euros(1),
      note: "",
    }));
    expect(parseCheckpointHistory(overflow)).not.toBeNull();
    let log = [...overflow];
    for (const entry of overflow) {
      const next: CheckpointCommand = { id: `v-${entry.id}`, kind: "void", target: entry.id };
      expect(admitCheckpoint(log, next, TODAY).status).toBe("admit");
      log = [...log, next];
    }
    expect(activeCheckpoints(log)).toHaveLength(0);
    expect(parseCheckpointHistory(log)).not.toBeNull();
  });
});
