import { describe, expect, it } from "vitest";
import { FakeGoogle } from "../../../tests/fixtures/fake-google";
import { canonicalJson } from "../../core/canonical-json";
import { ADD_ADMISSION_LIMIT } from "../../core/checkpoints";
import { type CheckpointCommand } from "../../core/checkpoints";
import { type IsoDate, parseIsoDate } from "../../core/iso-date";
import { toEuroCents } from "../../core/money";
import { sha256Hex } from "../../core/sha256";
import { createWorkbook } from "./google-workbook";
import {
  appendCheckpoint,
  CHECKPOINT_LOG_TITLE,
  checkCheckpoint,
  preflightCheckpoint,
  readCheckpoints,
} from "./direct-checkpoints";
import { readExpenses } from "./direct-expenses";
import { LEDGER_TAB } from "./sheets-layout";

// Synthetic data only.

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("Missing test fixture value");
  return value;
}
const date = (text: string): IsoDate => required(parseIsoDate(text));
const TODAY = date("2026-11-16");
const add = (name: string, on = "2026-11-14", euros = 1000): CheckpointCommand => ({
  id: `${name}-0000000`.slice(0, 12),
  kind: "add",
  date: date(on),
  cents: required(toEuroCents(euros * 100)),
  note: "",
});
const voidOf = (name: string, target: string): CheckpointCommand => ({
  id: `${name}-0000000`.slice(0, 12),
  kind: "void",
  target: `${target}-0000000`.slice(0, 12),
});

async function setup(): Promise<{ google: FakeGoogle; id: string }> {
  const google = new FakeGoogle();
  const workbook = await createWorkbook(google.client, google.token);
  if (!workbook.ok) throw new Error("Fixture workbook creation failed");
  return { google, id: workbook.value.id };
}
function appendRaw(google: FakeGoogle, id: string, entry: CheckpointCommand): void {
  const text = canonicalJson(entry);
  required(google.tab(id, CHECKPOINT_LOG_TITLE)).rows.push(["1", text, sha256Hex(text)]);
}

describe("direct checkpoint records", () => {
  it("C1 saves a first checkpoint, creating the hidden tab and anchor, and reads it back", async () => {
    const { google, id } = await setup();
    expect((await readCheckpoints(google.client, google.token, id)).status).toBe("absent");
    const outcome = await appendCheckpoint(google.client, google.token, id, add("a1"), TODAY);
    expect(outcome.status).toBe("saved");
    const read = await readCheckpoints(google.client, google.token, id, true);
    expect(read.status === "ok" && read.commands.map((entry) => entry.id)).toEqual([add("a1").id]);
    // The fake does not model a tab's hidden flag, so the request is checked instead.
    expect(JSON.stringify(google.requests)).toContain('"hidden":true');
    expect(
      required(google.tab(id, LEDGER_TAB)).developerMetadata.some(
        (entry) => entry["metadataKey"] === "foliodash.checkpoints",
      ),
    ).toBe(true);
  });

  it("C2 keeps two checkpoints on one date", async () => {
    const { google, id } = await setup();
    await appendCheckpoint(google.client, google.token, id, add("a1"), TODAY);
    await appendCheckpoint(google.client, google.token, id, add("a2"), TODAY, true);
    const read = await readCheckpoints(google.client, google.token, id, true);
    expect(read.status === "ok" && read.commands).toHaveLength(2);
  });

  it("C5 reports a deleted records tab as damaged on a device with no copy, and never initialises it again (C5b)", async () => {
    const { google, id } = await setup();
    await appendCheckpoint(google.client, google.token, id, add("a1"), TODAY);
    google.workbooks.get(id)?.delete(CHECKPOINT_LOG_TITLE);
    const fresh = await readCheckpoints(google.client, google.token, id, false);
    expect(fresh.status).toBe("damaged");
    const retry = await appendCheckpoint(google.client, google.token, id, add("a2"), TODAY);
    expect(retry.status).toBe("not-submitted");
    expect(google.tab(id, CHECKPOINT_LOG_TITLE)).toBeUndefined();
  });

  it("C5 reports an altered row as damaged", async () => {
    const { google, id } = await setup();
    await appendCheckpoint(google.client, google.token, id, add("a1"), TODAY);
    required(google.tab(id, CHECKPOINT_LOG_TITLE)).rows.push(["1", '{"tampered":true}', "bad-checksum"]);
    expect((await readCheckpoints(google.client, google.token, id, true)).status).toBe("damaged");
  });

  it("C13 never trips the expense reader, and the expense reader never trips it", async () => {
    const { google, id } = await setup();
    await appendCheckpoint(google.client, google.token, id, add("a1"), TODAY);
    expect((await readExpenses(google.client, google.token, id, false)).status).toBe("absent");
    expect((await readCheckpoints(google.client, google.token, id, true)).status).toBe("ok");
  });

  it("C14 confirms setup by reading before any append when the setup answer is lost", async () => {
    const { google, id } = await setup();
    google.faults.push({ match: /:batchUpdate/u, network: true, applyFirst: true });
    const outcome = await appendCheckpoint(google.client, google.token, id, add("a1"), TODAY);
    expect(["saved", "not-submitted"]).toContain(outcome.status);
    const read = await readCheckpoints(google.client, google.token, id, outcome.status === "saved");
    if (outcome.status === "saved") expect(read.status === "ok" && read.commands).toHaveLength(1);
  });

  it("C7a a retried append after a lost answer leaves one logical checkpoint", async () => {
    const { google, id } = await setup();
    await appendCheckpoint(google.client, google.token, id, add("a1"), TODAY);
    google.faults.push({ match: /:append/u, network: true, applyFirst: true });
    const first = await appendCheckpoint(google.client, google.token, id, add("a2"), TODAY, true);
    expect(["saved", "unknown"]).toContain(first.status);
    const again = await appendCheckpoint(google.client, google.token, id, add("a2"), TODAY, true);
    expect(again.status).toBe("saved");
    const read = await readCheckpoints(google.client, google.token, id, true);
    expect(read.status === "ok" && read.commands.filter((entry) => entry.id === add("a2").id)).toHaveLength(1);
  });

  it("C7b a command that is not visible after an ambiguous failure stays unknown", async () => {
    const { google, id } = await setup();
    await appendCheckpoint(google.client, google.token, id, add("a1"), TODAY);
    google.faults.push({ match: /:append/u, network: true });
    const outcome = await appendCheckpoint(google.client, google.token, id, add("a2"), TODAY, true);
    expect(outcome.status).toBe("unknown");
    expect((await checkCheckpoint(google.client, google.token, id, add("a2"))).status).toBe("unknown");
  });

  it("C7d refuses an id that already belongs to a different checkpoint", async () => {
    const { google, id } = await setup();
    await appendCheckpoint(google.client, google.token, id, add("a1"), TODAY);
    const outcome = await appendCheckpoint(google.client, google.token, id, add("a1", "2026-11-14", 2000), TODAY, true);
    expect(outcome.status).toBe("refused");
  });

  it("B9b a refusal before any write is reported as not submitted", async () => {
    const { google, id } = await setup();
    await appendCheckpoint(google.client, google.token, id, add("a1"), TODAY);
    google.faults.push({ match: /:append/u, status: 403 });
    const outcome = await appendCheckpoint(google.client, google.token, id, add("a2"), TODAY, true);
    expect(outcome.status).toBe("not-submitted");
    const read = await readCheckpoints(google.client, google.token, id, true);
    expect(read.status === "ok" && read.commands).toHaveLength(1);
  });

  it("C8 voids a checkpoint; voiding it again is a no-op that writes nothing (B9c)", async () => {
    const { google, id } = await setup();
    await appendCheckpoint(google.client, google.token, id, add("a1"), TODAY);
    expect((await appendCheckpoint(google.client, google.token, id, voidOf("v1", "a1"), TODAY, true)).status).toBe(
      "saved",
    );
    const rows = required(google.tab(id, CHECKPOINT_LOG_TITLE)).rows.length;
    expect((await preflightCheckpoint(google.client, google.token, id, voidOf("v2", "a1"), TODAY, true)).status).toBe(
      "no-op",
    );
    expect((await appendCheckpoint(google.client, google.token, id, voidOf("v2", "a1"), TODAY, true)).status).toBe(
      "no-op",
    );
    expect(required(google.tab(id, CHECKPOINT_LOG_TITLE)).rows.length).toBe(rows);
  });

  it("refuses a void of a checkpoint that is not in the log", async () => {
    const { google, id } = await setup();
    await appendCheckpoint(google.client, google.token, id, add("a1"), TODAY);
    expect((await appendCheckpoint(google.client, google.token, id, voidOf("v1", "zz"), TODAY, true)).status).toBe(
      "refused",
    );
  });

  it("C10 two devices adding concurrently both end up in a valid log", async () => {
    const { google, id } = await setup();
    await appendCheckpoint(google.client, google.token, id, add("a0"), TODAY);
    const reads = google.calls.filter((call) => call.startsWith("GET") && call.includes("/values/")).length;
    google.afterRead = {
      count: reads + 1,
      run: () => {
        appendRaw(google, id, add("other"));
      },
    };
    const outcome = await appendCheckpoint(google.client, google.token, id, add("mine"), TODAY, true);
    expect(["saved", "unknown"]).toContain(outcome.status);
    const read = await readCheckpoints(google.client, google.token, id, true);
    expect(read.status === "ok" && read.commands.map((entry) => entry.id).sort()).toEqual(
      [add("a0").id, add("mine").id, add("other").id].sort(),
    );
  });

  it("B9a a competing void that lands before the append turns the later void into a no-op", async () => {
    const { google, id } = await setup();
    await appendCheckpoint(google.client, google.token, id, add("a1"), TODAY);
    const pre = await preflightCheckpoint(google.client, google.token, id, voidOf("mine", "a1"), TODAY, true);
    expect(pre.status).toBe("admit");
    appendRaw(google, id, voidOf("rival", "a1"));
    const outcome = await appendCheckpoint(google.client, google.token, id, voidOf("mine", "a1"), TODAY, true);
    expect(outcome.status).toBe("no-op");
    expect(outcome.status === "no-op" && outcome.commands.some((entry) => entry.kind === "void")).toBe(true);
  });

  it("is unavailable, not damaged, when Google cannot be read", async () => {
    const { google, id } = await setup();
    google.faults.push({ match: /spreadsheets/u, status: 503 });
    expect((await readCheckpoints(google.client, google.token, id)).status).toBe("unavailable");
  });

  it("B5a two writers at the add limit both end up readable", async () => {
    const { google, id } = await setup();
    await appendCheckpoint(google.client, google.token, id, add("a0"), TODAY);
    const tab = required(google.tab(id, CHECKPOINT_LOG_TITLE));
    for (let index = 0; index < ADD_ADMISSION_LIMIT - 2; index++) {
      const text = canonicalJson({
        id: `bulk-${String(index).padStart(8, "0")}`,
        kind: "add",
        date: "2026-11-14",
        cents: 100,
        note: "",
      });
      tab.rows.push(["1", text, sha256Hex(text)]);
    }
    appendRaw(google, id, add("twoA"));
    appendRaw(google, id, add("twoB"));
    const read = await readCheckpoints(google.client, google.token, id, true);
    expect(read.status === "ok" && read.commands.length).toBe(ADD_ADMISSION_LIMIT + 1);
    expect((await appendCheckpoint(google.client, google.token, id, add("z9"), TODAY, true)).status).toBe("refused");
    expect((await appendCheckpoint(google.client, google.token, id, voidOf("vtwoA", "twoA"), TODAY, true)).status).toBe(
      "saved",
    );
  });
});
