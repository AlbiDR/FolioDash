import { describe, expect, it } from "vitest";
import { type LedgerRow, type RowSheet, RowLedgerStore } from "../../adapters/ledger/RowLedgerStore";
import type { ServiceEnvironment } from "../../applications/LedgerService";
import { parseIsin } from "../../core/Isin";
import { createService } from "./service";

class MemorySheet implements RowSheet {
  rows: LedgerRow[] = [];
  readRows(): readonly LedgerRow[] { return [...this.rows]; }
  appendRows(rows: readonly LedgerRow[]): void { this.rows.push(...rows); }
  flush(): void { /* nothing to flush */ }
}

function isin(code: string): string {
  for (let digit = 0; digit < 10; digit++) {
    const candidate = parseIsin(`XS${code.padEnd(9, "0")}${String(digit)}`);
    if (candidate !== null) return candidate;
  }
  throw new Error("no check digit");
}

const A = isin("FUNDA");
const WORKBOOK = "workbook-id-0001";

function serviceWith(sheet: MemorySheet) {
  let counter = 0;
  const environment: ServiceEnvironment = {
    store: new RowLedgerStore(sheet),
    withLock: (action) => action(),
    newRevision: () => `rev-${String(++counter)}`,
  };
  const opened: string[] = [];
  const service = createService((id) => {
    opened.push(id);
    return environment;
  });
  return { service, opened };
}

function request(): Record<string, unknown> {
  return {
    commandId: "command-0001",
    expectedRevision: "",
    date: "2026-01-15",
    statement: { funds: [{ isin: A, name: "Fund A", marketValue: 100000 }], fundsSubtotal: 100000 },
    commands: [{ isin: A, action: "Start", moneyIn: 0, moneyOut: 0, comment: "", openingNetInvested: 90000 }],
  };
}

describe("the service operations", () => {
  it("commit, read and outcome work end to end on plain JSON", () => {
    const { service } = serviceWith(new MemorySheet());
    expect(service.commit(WORKBOOK, request())).toEqual({ ok: true, value: { status: "committed", revision: "rev-1" } });
    const read = service.read(WORKBOOK);
    expect(read.ok && read.value.status === "ok" && read.value.state.snapshots).toHaveLength(1);
    const outcome = service.outcome(WORKBOOK, "command-0001");
    expect(outcome.ok && outcome.value.status).toBe("committed");
    expect(service.check(WORKBOOK).ok).toBe(true);
  });

  it("refuses a malformed request before touching the workbook", () => {
    const { service, opened } = serviceWith(new MemorySheet());
    const bad = { ...request(), date: "tomorrow" };
    expect(service.commit(WORKBOOK, bad)).toMatchObject({ ok: false, error: "invalid-request" });
    expect(opened).toEqual([]);
  });

  it("refuses a missing or malformed workbook id without opening anything", () => {
    const { service, opened } = serviceWith(new MemorySheet());
    for (const id of [undefined, 5, "", "short", "x".repeat(101)]) {
      expect(service.read(id)).toMatchObject({ ok: false, error: "invalid-request" });
    }
    expect(opened).toEqual([]);
  });

  it("answers with no detail when the workbook cannot be opened", () => {
    const service = createService(() => {
      throw new Error("secret spreadsheet title and id leaked in an error");
    });
    const result = service.read(WORKBOOK);
    expect(result).toEqual({ ok: false, error: "unavailable", message: "The workbook could not be opened or read with your access." });
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("refuses a malformed command id for the outcome lookup", () => {
    const { service } = serviceWith(new MemorySheet());
    expect(service.outcome(WORKBOOK, "x")).toMatchObject({ ok: false, error: "invalid-request" });
  });

  it("passes a stale review and a damaged ledger through as typed outcomes", () => {
    const sheet = new MemorySheet();
    const { service } = serviceWith(sheet);
    service.commit(WORKBOOK, request());
    expect(service.commit(WORKBOOK, { ...request(), commandId: "command-0002", date: "2026-02-10" })).toEqual({
      ok: true,
      value: { status: "stale", currentRevision: "rev-1" },
    });
    sheet.rows = sheet.rows.map((entry) => (entry.type === "SNAPSHOT" ? { ...entry, payload: "{}" } : entry));
    expect(service.read(WORKBOOK)).toMatchObject({ ok: true, value: { status: "damaged" } });
  });
});
