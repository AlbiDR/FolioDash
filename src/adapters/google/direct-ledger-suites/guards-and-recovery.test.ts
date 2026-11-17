import { describe, expect, it } from "vitest";
import type { RawSheet } from "../../../core/statements/raw-sheet";
import {
  type DirectDeps,
  attachDirect,
  backfillDirect,
  commitDirect,
  outcomeDirect,
  readAllDirect,
  readDirect,
  recoverRevisionDirect,
} from "../direct-ledger";
import {
  date,
  statement,
  start,
  keep,
  first,
  second,
  setup,
  readyWorkbook,
} from "../../../../tests/fixtures/google-adapters/direct-ledger-support";

describe("attachDirect: statements for months saved earlier", () => {
  it("attaches in one request, leaves the figures as they were, and a repeat writes nothing", async () => {
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    const one = await commitDirect(deps, google.token, workbook.id, first());
    const revision = one.status === "committed" ? one.revision : "";
    const sheet: RawSheet = { date1904: false, rows: [[{ kind: "text", text: "Fondi" }]] };
    // The earlier save had no statement; this statement must reproduce the saved month, so it is the same funds and figures.
    const request = {
      commandId: "attach-0001",
      expectedRevision: revision,
      items: [
        {
          date: date("2026-01-31"),
          statement: statement(1000),
          commands: [start],
          source: { sheetName: "Il Mio Patrimonio", sheet },
        },
      ],
    };
    const appendsBefore = google.requests.filter((request) => request["appendCells"] !== undefined).length;
    expect((await attachDirect(deps, google.token, workbook.id, request)).status).toBe("committed");
    expect(google.requests.filter((request) => request["appendCells"] !== undefined)).toHaveLength(appendsBefore + 1);
    const all = await readAllDirect(google.client, google.token, workbook.id);
    expect(all.status === "ok" && [all.state.snapshots.length, all.sources.length]).toEqual([1, 1]);
    expect((await attachDirect(deps, google.token, workbook.id, request)).status).toBe("already-committed");
    expect(google.requests.filter((request) => request["appendCells"] !== undefined)).toHaveLength(appendsBefore + 1);
  });

  it("refuses a statement that does not reproduce the saved month, and writes nothing", async () => {
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    const one = await commitDirect(deps, google.token, workbook.id, first());
    const revision = one.status === "committed" ? one.revision : "";
    const sheet: RawSheet = { date1904: false, rows: [] };
    const request = {
      commandId: "attach-0002",
      expectedRevision: revision,
      items: [
        { date: date("2026-01-31"), statement: statement(999), commands: [start], source: { sheetName: "S", sheet } },
      ],
    };
    const appendsBefore = google.requests.filter((request) => request["appendCells"] !== undefined).length;
    expect((await attachDirect(deps, google.token, workbook.id, request)).status).toBe("rejected");
    expect(google.requests.filter((request) => request["appendCells"] !== undefined)).toHaveLength(appendsBefore);
  });
});

describe("atomic predecessor guard", () => {
  it.each([
    { command: "device-two", value: 1200, statuses: ["committed", "stale"], receipt: "not-found" },
    { command: "device-one", value: 1000, statuses: ["already-committed", "committed"], receipt: "committed" },
  ])(
    "coordinates two devices past the final read ($command), preserving one valid save",
    async ({ command, value, statuses, receipt }) => {
      const { google, deps } = setup();
      const workbook = await readyWorkbook(google);
      let release: (() => void) | undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let waiting = 0;
      const rest: DirectDeps["rest"] = async (request) => {
        if (request.body?.includes('"appendCells"')) {
          waiting++;
          if (waiting === 2) release?.();
          await gate;
        }
        return google.client(request);
      };
      const results = await Promise.all([
        commitDirect({ ...deps, rest }, google.token, workbook.id, first("", "device-one")),
        commitDirect({ ...deps, rest }, google.token, workbook.id, {
          ...first("", command),
          statement: statement(value),
        }),
      ]);
      expect(results.map((result) => result.status).sort()).toEqual(statuses);
      expect(google.namedRanges.get(workbook.id)?.size).toBe(1);
      const read = await readDirect(google.client, google.token, workbook.id);
      expect(read).toMatchObject({ status: "ok", ignoredTrailingRows: 0 });
      if (read.status !== "ok") throw new Error("ledger must stay readable");
      expect(read.state.snapshots).toHaveLength(1);
      expect((await outcomeDirect(google.client, google.token, workbook.id, "device-one")).status).toBe("committed");
      expect((await outcomeDirect(google.client, google.token, workbook.id, command)).status).toBe(receipt);
    },
  );

  it("does not mark an acknowledged save uncertain when a legitimate successor arrives before read-back", async () => {
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    let followed = false;
    const rest: DirectDeps["rest"] = async (request) => {
      const response = await google.client(request);
      if (!followed && request.body?.includes('"appendCells"')) {
        followed = true;
        expect((await commitDirect(deps, google.token, workbook.id, second("revision-0001"))).status).toBe("committed");
      }
      return response;
    };
    expect((await commitDirect({ ...deps, rest }, google.token, workbook.id, first())).status).toBe("committed");
    const read = await readDirect(google.client, google.token, workbook.id);
    expect(read.status === "ok" && read.state.snapshots).toHaveLength(2);
  });

  it("rolls back the predecessor marker if the append in its batch is invalid", async () => {
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    const rest: DirectDeps["rest"] = (request) => {
      if (!request.body?.includes('"appendCells"')) return google.client(request);
      const body = JSON.parse(request.body) as { requests: { appendCells?: { sheetId: number } }[] };
      const append = body.requests.find((item) => item.appendCells !== undefined)?.appendCells;
      if (append !== undefined) append.sheetId = -999;
      return google.client({ ...request, body: JSON.stringify(body) });
    };
    expect((await commitDirect({ ...deps, rest }, google.token, workbook.id, first())).status).toBe("unknown");
    expect(google.namedRanges.get(workbook.id)?.size ?? 0).toBe(0);
    expect(await outcomeDirect(google.client, google.token, workbook.id, "command-first-0001")).toEqual({
      status: "not-found",
    });
    expect((await commitDirect(deps, google.token, workbook.id, first())).status).toBe("committed");
  });
});

describe("recovery of an earlier revision", () => {
  it("restores the complete reviewed revision and sources without discarding later evidence", async () => {
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    const sheet: RawSheet = { date1904: false, rows: [[{ kind: "text", text: "synthetic" }]] };
    const initial = await commitDirect(deps, google.token, workbook.id, {
      ...first(),
      source: { sheetName: "Synthetic", sheet },
    });
    if (initial.status !== "committed") throw new Error("first save failed");
    const target = await readAllDirect(google.client, google.token, workbook.id);
    if (target.status !== "ok") throw new Error("first read failed");
    const later = await commitDirect(deps, google.token, workbook.id, second(initial.revision));
    if (later.status !== "committed") throw new Error("second save failed");
    const request = { commandId: "recover-first", expectedRevision: later.revision, targetRevision: initial.revision };
    expect(
      await recoverRevisionDirect(deps, google.token, workbook.id, { ...request, expectedRevision: initial.revision }),
    ).toMatchObject({ status: "stale" });
    const result = await recoverRevisionDirect(deps, google.token, workbook.id, request);
    expect(result.status).toBe("committed");
    const restored = await readAllDirect(google.client, google.token, workbook.id);
    if (restored.status !== "ok") throw new Error("recovery read failed");
    expect(restored.state.snapshots).toEqual(target.state.snapshots);
    expect(restored.sources).toEqual(target.sources);
    expect(await recoverRevisionDirect(deps, google.token, workbook.id, request)).toMatchObject({
      status: "already-committed",
    });
    expect(
      await recoverRevisionDirect(deps, google.token, workbook.id, { ...request, targetRevision: later.revision }),
    ).toMatchObject({ status: "rejected" });
  });

  it("reports a lost recovery response as unknown and resolves the same command without writing twice", async () => {
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    const initial = await commitDirect(deps, google.token, workbook.id, first());
    if (initial.status !== "committed") throw new Error("first save failed");
    const later = await commitDirect(deps, google.token, workbook.id, second(initial.revision));
    if (later.status !== "committed") throw new Error("second save failed");
    const request = { commandId: "recover-lost", expectedRevision: later.revision, targetRevision: initial.revision };
    google.faults.push({ match: /:batchUpdate$/u, network: true, applyFirst: true });
    expect(await recoverRevisionDirect(deps, google.token, workbook.id, request)).toMatchObject({ status: "unknown" });
    expect(await outcomeDirect(google.client, google.token, workbook.id, request.commandId)).toMatchObject({
      status: "committed",
    });
    expect(await recoverRevisionDirect(deps, google.token, workbook.id, request)).toMatchObject({
      status: "already-committed",
    });
  });
});

describe("guarded earlier history", () => {
  it("reports a preparation exception as not committed and sends no ledger append", async () => {
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    const sheet: RawSheet = { date1904: false, rows: [[{ kind: "text", text: "synthetic" }]] };
    const initial = await commitDirect(deps, google.token, workbook.id, {
      ...first(),
      source: { sheetName: "Synthetic", sheet },
    });
    if (initial.status !== "committed") throw new Error("first save failed");
    const before = google.requests.filter((request) => request["appendCells"] !== undefined).length;
    const result = await backfillDirect(
      deps,
      google.token,
      workbook.id,
      {
        commandId: "invalid-input",
        expectedRevision: initial.revision,
        earlier: [{ date: date("2025-12-31"), statement: statement(1000), commands: [start] }],
        boundary: [keep],
      },
      () => {
        throw new Error("parser failure");
      },
    );
    expect(result.status).toBe("not-committed");
    expect(google.requests.filter((request) => request["appendCells"] !== undefined)).toHaveLength(before);
  });
  it("commits one complete candidate and permits recovery of the prior revision", async () => {
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    const firstSave = await commitDirect(deps, google.token, workbook.id, first());
    if (firstSave.status !== "committed") throw new Error("first save failed");
    const before = await readAllDirect(google.client, google.token, workbook.id);
    if (before.status !== "ok") throw new Error("read failed");
    const request = {
      commandId: "insert-december",
      expectedRevision: firstSave.revision,
      earlier: [{ date: date("2025-12-31"), statement: statement(1000), commands: [start] }],
      boundary: [keep],
    };
    const interpret = () => ({ ok: false as const, message: "no bank sources" });
    const result = await backfillDirect(deps, google.token, workbook.id, request, interpret);
    expect(result.status).toBe("committed");
    if (result.status !== "committed") throw new Error("insertion failed");
    const after = await readAllDirect(google.client, google.token, workbook.id);
    if (after.status !== "ok") throw new Error("read failed");
    expect(after.state.snapshots.map((snapshot) => snapshot.date)).toEqual(["2025-12-31", "2026-01-31"]);
    expect(await backfillDirect(deps, google.token, workbook.id, request, interpret)).toMatchObject({
      status: "already-committed",
    });
    const recovered = await recoverRevisionDirect(deps, google.token, workbook.id, {
      commandId: "undo-insert",
      expectedRevision: result.revision,
      targetRevision: firstSave.revision,
    });
    expect(recovered.status).toBe("committed");
    const restored = await readAllDirect(google.client, google.token, workbook.id);
    if (restored.status !== "ok") throw new Error("recovery read failed");
    expect(restored.state.snapshots).toEqual(before.state.snapshots);
    expect(restored.sources).toEqual(before.sources);
  });

  it("prevents a simultaneous older guarded writer from appending on the same predecessor", async () => {
    const { google, deps } = setup();
    const workbook = await readyWorkbook(google);
    const initial = await commitDirect(deps, google.token, workbook.id, first());
    if (initial.status !== "committed") throw new Error("first save failed");
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let waiting = 0;
    const rest: DirectDeps["rest"] = async (request) => {
      if (request.body?.includes('"appendCells"')) {
        waiting++;
        if (waiting === 2) release?.();
        await gate;
      }
      return google.client(request);
    };
    const candidate = {
      commandId: "insert-race",
      expectedRevision: initial.revision,
      earlier: [{ date: date("2025-12-31"), statement: statement(1000), commands: [start] }],
      boundary: [keep],
    };
    const interpret = () => ({ ok: false as const, message: "no source" });
    const results = await Promise.all([
      backfillDirect({ ...deps, rest }, google.token, workbook.id, candidate, interpret),
      commitDirect({ ...deps, rest }, google.token, workbook.id, second(initial.revision, "legacy-race")),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual(["committed", "stale"]);
    const read = await readDirect(google.client, google.token, workbook.id);
    expect(read.status).toBe("ok");
    if (read.status === "ok") expect(read.state.snapshots).toHaveLength(2);
  });
});
