import { describe, expect, it } from "vitest";
import { FakeGoogle } from "../../../../tests/fixtures/fake-google";
import { date, interpret } from "../../../../tests/fixtures/saved-months";
import { createCheckpointLock, createCheckpointStore } from "../../../adapters/browser/checkpoint-store";
import { createExpenseCache } from "../../../adapters/browser/expense-cache";
import { createLedgerCache, type KeyValueStore } from "../../../adapters/browser/ledger-cache";
import { presentStatement } from "../../../adapters/fideuram/fideuram-presentation";
import { CHECKPOINT_LOG_TITLE } from "../../../adapters/google/direct-checkpoints";
import { toEuroCents } from "../../../core/money";
import { Session } from "./session";

// Synthetic data only. The session clock reads 2026-11-05.
function world() {
  const google = new FakeGoogle();
  const values = new Map<string, string>();
  const storage: KeyValueStore = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
  const locks = {
    held: false,
    request: async <T>(
      _name: string,
      _options: { ifAvailable: true; mode: "exclusive" },
      callback: (lock: object | null) => Promise<T>,
    ): Promise<T> => {
      if (locks.held) return callback(null);
      locks.held = true;
      try {
        return await callback({});
      } finally {
        locks.held = false;
      }
    },
  };
  let id = 0;
  const make = () =>
    new Session({
      clientId: "synthetic-client",
      interpret,
      present: presentStatement,
      signIn: () => Promise.resolve({ ok: true, accessToken: google.token, expiresInSeconds: 3600 }),
      rest: google.client,
      cache: createLedgerCache(() => storage),
      expenseCache: createExpenseCache(() => storage),
      checkpointStore: createCheckpointStore(() => storage, "foliodash."),
      checkpointLock: createCheckpointLock("foliodash.checkpoints", locks),
      now: () => 1_793_875_200_000,
      newId: () => `session-checkpoint-${String(++id).padStart(4, "0")}`,
    });
  const request = {
    date: date("2026-11-01"),
    cents: toEuroCents(123_456) as NonNullable<ReturnType<typeof toEuroCents>>,
    note: "",
  };
  return { google, make, values, request };
}

describe("checkpoints sharing a session with the portfolio and expenses", () => {
  it("saves a checkpoint without any statement and rebuilds it on another session", async () => {
    const { make, request } = world();
    const session = make();
    await session.connect();
    await session.checkpoints.refresh();
    expect((await session.checkpoints.add(request)).status).toBe("saved");
    expect(session.state.ledger.snapshots).toHaveLength(0);
    const another = make();
    await another.connect();
    expect(another.checkpoints.state.active).toHaveLength(1);
    await session.idle();
    await another.idle();
  });

  it("C4 leaves the ledger tab and the expense log untouched", async () => {
    const { make, google, request } = world();
    const session = make();
    await session.connect();
    await session.checkpoints.refresh();
    const ledgerBefore = JSON.stringify(google.tab(session.state.workbook?.id ?? "", "_FolioDash ledger")?.rows);
    await session.checkpoints.add(request);
    expect(JSON.stringify(google.tab(session.state.workbook?.id ?? "", "_FolioDash ledger")?.rows)).toBe(ledgerBefore);
    expect(google.tab(session.state.workbook?.id ?? "", "_FolioDash expenses")).toBeUndefined();
    expect(google.tab(session.state.workbook?.id ?? "", CHECKPOINT_LOG_TITLE)).toBeDefined();
    await session.idle();
  });

  it("shows the saved copy at once on a new session and removes it only when this device is forgotten", async () => {
    const { make, request } = world();
    const session = make();
    await session.connect();
    await session.checkpoints.refresh();
    await session.checkpoints.add(request);
    await session.idle();
    const reopened = make();
    expect(reopened.checkpoints.state.active).toHaveLength(1);
    reopened.forget();
    expect(reopened.checkpoints.state.active).toEqual([]);
    expect(make().checkpoints.state.active).toEqual([]);
  });

  it("a session built without a store or lock reads but never saves", async () => {
    const google = new FakeGoogle();
    const values = new Map<string, string>();
    const storage: KeyValueStore = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
      removeItem: (key) => {
        values.delete(key);
      },
    };
    const bare = new Session({
      clientId: "synthetic-client",
      interpret,
      present: presentStatement,
      signIn: () => Promise.resolve({ ok: true, accessToken: google.token, expiresInSeconds: 3600 }),
      rest: google.client,
      cache: createLedgerCache(() => storage),
      now: () => 1_793_875_200_000,
      newId: () => "bare-0000000001",
    });
    await bare.connect();
    await bare.checkpoints.refresh();
    const result = await bare.checkpoints.add({
      date: date("2026-11-01"),
      cents: toEuroCents(100) as NonNullable<ReturnType<typeof toEuroCents>>,
      note: "",
    });
    expect(result.status).toBe("not-saved");
    await bare.idle();
  });
});
