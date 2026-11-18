import { describe, expect, it } from "vitest";
import type { SessionDeps } from "../stack/session-policy";
import {
  date,
  statement,
  start,
  keep,
  january,
  february,
  world,
  saved,
} from "../../../../../../tests/fixtures/session/session-test-support";

describe("earlier history and recovery through the session", () => {
  it("retains the earlier recovery option when a second insertion is undone", async () => {
    const { make } = world();
    const session = make();
    await session.connect();
    await saved(session, january);
    const januaryRevision = session.state.ledger.revision;
    const workbookId = session.state.workbook?.id ?? "";
    const insert = session.save.backfill?.bind(session.save);
    const recover = session.save.recoverRevision?.bind(session.save);
    if (insert === undefined || recover === undefined) throw new Error("missing capability");
    expect(
      (
        await insert(
          [{ date: date("2025-12-31"), statement: statement(1000), commands: [start] }],
          [keep],
          session.save.newCommandId(),
          januaryRevision,
          workbookId,
        )
      ).status,
    ).toBe("recorded");
    const decemberRevision = session.state.ledger.revision;
    expect(
      (
        await insert(
          [{ date: date("2025-11-30"), statement: statement(1000), commands: [start] }],
          [keep],
          session.save.newCommandId(),
          decemberRevision,
          workbookId,
        )
      ).status,
    ).toBe("recorded");
    expect(
      (await recover(decemberRevision, session.save.newCommandId(), session.state.ledger.revision, workbookId)).status,
    ).toBe("recorded");
    expect(session.state.recoveryTarget).toBe(januaryRevision);
    expect(
      (await recover(januaryRevision, session.save.newCommandId(), session.state.ledger.revision, workbookId)).status,
    ).toBe("recorded");
    expect(session.state.ledger.snapshots.map((snapshot) => snapshot.date)).toEqual(["2026-01-31"]);
    await session.idle();
  });

  it("does not submit a review bound to a different workbook", async () => {
    const { google, make } = world();
    const session = make();
    await session.connect();
    await saved(session, january);
    await session.idle();
    const insert = session.save.backfill?.bind(session.save);
    if (insert === undefined) throw new Error("missing capability");
    const requestsBefore = google.requests.length;
    const result = await insert(
      [{ date: date("2025-12-31"), statement: statement(1000), commands: [start] }],
      [keep],
      session.save.newCommandId(),
      session.state.ledger.revision,
      "another-workbook",
    );
    expect(result.status).toBe("stale");
    expect((await session.save.check("some-command", "another-workbook")).status).toBe("cannot-tell");
    expect(google.requests.length).toBe(requestsBefore);
  });

  it("reads back the inserted history and restores the prior revision", async () => {
    const { make } = world();
    const session = make();
    await session.connect();
    expect((await saved(session, january)).status).toBe("recorded");
    const original = session.state.ledger;
    const operation = session.save.backfill?.bind(session.save);
    const recovery = session.save.recoverRevision?.bind(session.save);
    if (operation === undefined || recovery === undefined) throw new Error("missing capability");
    const earlier = [{ date: date("2025-12-31"), statement: statement(1000), commands: [start] }];
    const inserted = await operation(
      earlier,
      [keep],
      session.save.newCommandId(),
      original.revision,
      session.state.workbook?.id ?? "",
    );
    expect(inserted.status).toBe("recorded");
    expect(session.state.ledger.snapshots.map((snapshot) => snapshot.date)).toEqual(["2025-12-31", "2026-01-31"]);
    expect(session.state.recoveryTarget).toBe(original.revision);
    expect((await saved(session, february)).status).toBe("recorded");
    const reloaded = make();
    await reloaded.connect();
    expect(reloaded.state.recoveryTarget).toBe(original.revision);
    const restored = await recovery(
      original.revision,
      session.save.newCommandId(),
      session.state.ledger.revision,
      session.state.workbook?.id ?? "",
    );
    expect(restored.status).toBe("recorded");
    expect(session.state.ledger.snapshots).toEqual(original.snapshots);
    expect(session.state.recoveryTarget).toBeNull();
    await reloaded.idle();
    await session.idle();
  });

  it("retains an uncertain revision receipt across reload and blocks other portfolio writes", async () => {
    const { google, make } = world();
    const session = make();
    await session.connect();
    expect((await saved(session, january)).status).toBe("recorded");
    await session.idle();
    const insert = session.save.backfill?.bind(session.save);
    if (insert === undefined) throw new Error("missing capability");
    const commandId = session.save.newCommandId();
    google.faults.push({ match: /:batchUpdate$/u, network: true, applyFirst: true });
    expect(
      (
        await insert(
          [{ date: date("2025-12-31"), statement: statement(1000), commands: [start] }],
          [keep],
          commandId,
          session.state.ledger.revision,
          session.state.workbook?.id ?? "",
        )
      ).status,
    ).toBe("unknown");
    const reloaded = make();
    expect(reloaded.state.pendingRevision).toBe(commandId);
    await reloaded.connect();
    expect(reloaded.state.pendingRevision).toBe(commandId);
    expect((await saved(reloaded, february)).status).toBe("not-saved");
    expect((await reloaded.save.check(commandId)).status).toBe("recorded");
    expect(reloaded.state.pendingRevision).toBeNull();
    expect((await saved(reloaded, february)).status).toBe("recorded");
    await reloaded.idle();
    await session.idle();
  });

  it("fences a delayed request before declaring it unrecorded and permits a later save", async () => {
    const { google, make } = world();
    let intercept = false;
    const delayed: { request?: Parameters<SessionDeps["rest"]>[0] } = {};
    const session = make({
      rest: async (request) => {
        if (intercept && request.body?.includes('"appendCells"')) {
          intercept = false;
          delayed.request = request;
          throw new Error("lost response");
        }
        return google.client(request);
      },
    });
    await session.connect();
    await saved(session, january);
    await session.idle();
    const insert = session.save.backfill?.bind(session.save);
    if (insert === undefined) throw new Error("missing capability");
    const id = session.save.newCommandId();
    intercept = true;
    expect(
      (
        await insert(
          [{ date: date("2025-12-31"), statement: statement(1000), commands: [start] }],
          [keep],
          id,
          session.state.ledger.revision,
          session.state.workbook?.id ?? "",
        )
      ).status,
    ).toBe("unknown");
    expect((await session.save.check(id)).status).toBe("not-recorded");
    expect(session.state.pendingRevision).toBeNull();
    if (delayed.request === undefined) throw new Error("the delayed request was not captured");
    expect((await google.client(delayed.request)).status).toBe(400);
    expect((await saved(session, february)).status).toBe("recorded");
  });

  it("reconciles a lost fence response using its recorded receipt", async () => {
    const { google, make } = world();
    const session = make();
    await session.connect();
    await saved(session, january);
    await session.idle();
    const insert = session.save.backfill?.bind(session.save);
    if (insert === undefined) throw new Error("missing capability");
    const id = session.save.newCommandId();
    google.faults.push({ match: /:batchUpdate$/u, network: true });
    expect(
      (
        await insert(
          [{ date: date("2025-12-31"), statement: statement(1000), commands: [start] }],
          [keep],
          id,
          session.state.ledger.revision,
          session.state.workbook?.id ?? "",
        )
      ).status,
    ).toBe("unknown");
    google.faults.push({ match: /:batchUpdate$/u, network: true, applyFirst: true });
    expect((await session.save.check(id)).status).toBe("cannot-tell");
    expect(session.state.pendingRevision).toBe(id);
    expect((await session.save.check(id)).status).toBe("not-recorded");
    expect(session.state.pendingRevision).toBeNull();
    expect((await saved(session, february)).status).toBe("recorded");
  });
});
