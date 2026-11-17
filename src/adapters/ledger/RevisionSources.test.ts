import { describe, expect, it } from "vitest";
import { twoSavedMonths } from "../../../tests/fixtures/SavedMonths";
import { canonicalJson } from "../../core/CanonicalJson";
import { sha256Hex } from "../../core/Sha256";

const receipt = (revision: string) => ({ commandId: revision, revision, requestHash: "synthetic" });

describe("revision-specific bank sources", () => {
  it("replaces the effective sources while retaining earlier committed evidence", () => {
    const { store, sheet, ledger, sources } = twoSavedMonths();
    const before = [...sheet.rows];
    const first = sources[0];
    if (first === undefined) throw new Error("missing fixture");
    const corrected = { ...first, commandId: "reviewed-boundary" };
    store.publishWithSources({ ...ledger, revision: "backfill" }, receipt("backfill"), [corrected], ledger.revision);
    expect(sheet.rows.slice(0, before.length)).toEqual(before);
    expect(store.load()).toMatchObject({ status: "ok", state: { revision: "backfill" } });
    expect(store.loadSources()).toEqual({ status: "ok", sources: [corrected] });
    expect(store.recoveryTarget()).toBe(ledger.revision);
    expect(store.loadRevision(ledger.revision)).toEqual({ status: "ok", state: ledger, sources });
    expect(store.loadRevision("backfill")).toEqual({
      status: "ok",
      state: { ...ledger, revision: "backfill" },
      sources: [corrected],
      recoveryTarget: ledger.revision,
    });
    store.publish({ ...ledger, revision: "later" }, receipt("later"));
    expect(store.loadSources()).toEqual({ status: "ok", sources: [corrected] });
    expect(store.recoveryTarget()).toBe(ledger.revision);
    expect(JSON.parse([...sheet.rows].reverse().find((row) => row.type === "META")?.payload ?? "{}")).toMatchObject({
      schema: 2,
    });
  });

  it("supports an empty effective set and refuses duplicate dates before writing", () => {
    const { store, sheet, ledger, sources } = twoSavedMonths();
    const first = sources[0];
    if (first === undefined) throw new Error("missing fixture");
    const before = [...sheet.rows];
    expect(() => {
      store.publishWithSources({ ...ledger, revision: "bad" }, receipt("bad"), [first, first]);
    }).toThrow();
    expect(() => {
      store.publishWithSources({ ...ledger, revision: "bad" }, receipt("bad"), [
        { ...first, date: "2024-01-31" as typeof first.date },
      ]);
    }).toThrow();
    expect(sheet.rows).toEqual(before);
    store.publishWithSources({ ...ledger, revision: "empty" }, receipt("empty"), []);
    expect(store.loadSources()).toEqual({ status: "ok", sources: [] });
    expect(store.loadRevision("missing").status).toBe("damaged");
  });

  it("rejects a legacy commit appended after a format upgrade", () => {
    const { store, sheet, ledger, sources } = twoSavedMonths();
    store.publishWithSources({ ...ledger, revision: "upgraded" }, receipt("upgraded"), sources);
    const start = sheet.rows.length;
    store.publish({ ...ledger, revision: "stale-writer" }, receipt("stale-writer"));
    const header = sheet.rows[start];
    const commit = sheet.rows.at(-1);
    if (header === undefined || commit === undefined) throw new Error("missing rows");
    const payload = canonicalJson({ schema: 1, funds: ledger.funds });
    sheet.rows[start] = { ...header, payload, checksum: sha256Hex(payload) };
    const block = sheet.rows.slice(start, -1);
    sheet.rows[sheet.rows.length - 1] = {
      ...commit,
      checksum: sha256Hex(canonicalJson(block.map((row) => [row.type, row.payload]))),
    };
    const loaded = store.load();
    expect(loaded.status).toBe("damaged");
    if (loaded.status !== "damaged") throw new Error("expected damaged ledger");
    expect(loaded.message).toContain("older version");
  });

  it("reuses committed bank sources instead of copying their contents on every later save", () => {
    const { store, sheet, ledger, sources } = twoSavedMonths();
    store.publishWithSources({ ...ledger, revision: "upgrade" }, receipt("upgrade"), sources, ledger.revision);
    const afterUpgrade = sheet.rows.length;
    for (let index = 0; index < 20; index++) {
      const revision = `successor-${String(index)}`;
      store.publish({ ...ledger, revision }, receipt(revision));
    }
    const appended = sheet.rows.slice(afterUpgrade);
    expect(appended.filter((row) => row.type === "SOURCE")).toHaveLength(40);
    expect(appended.filter((row) => row.type === "SOURCE").every((row) => row.payload.length < 140)).toBe(true);
    expect(store.loadSources()).toEqual({ status: "ok", sources });
    expect(store.loadRevision(ledger.revision)).toEqual({ status: "ok", state: ledger, sources });
  });

  it("rejects an invalid source reference even when the enclosing commit checksum is recomputed", () => {
    const { store, sheet, ledger, sources } = twoSavedMonths();
    const start = sheet.rows.length;
    store.publishWithSources({ ...ledger, revision: "upgrade" }, receipt("upgrade"), sources, ledger.revision);
    const index = sheet.rows.findIndex((row, rowIndex) => rowIndex >= start && row.type === "SOURCE");
    const row = sheet.rows[index];
    const commit = sheet.rows.at(-1);
    if (row === undefined || commit === undefined) throw new Error("missing rows");
    const payload = canonicalJson({ r: 0, h: "0".repeat(64) });
    sheet.rows[index] = { ...row, payload, checksum: sha256Hex(payload) };
    const block = sheet.rows.slice(start, -1);
    sheet.rows[sheet.rows.length - 1] = {
      ...commit,
      checksum: sha256Hex(canonicalJson(block.map((item) => [item.type, item.payload]))),
    };
    expect(store.load().status).toBe("damaged");
    expect(store.loadSources().status).toBe("damaged");
  });
});
