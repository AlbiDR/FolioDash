import { FakeGoogle } from "../fake-google";
import { createCheckpointLock, createCheckpointStore } from "../../../src/adapters/browser/storage/checkpoint-store";
import type { KeyValueStore } from "../../../src/adapters/browser/storage/ledger-cache";
import { CHECKPOINT_LOG_TITLE } from "../../../src/adapters/google/direct-checkpoints";
import { createWorkbook } from "../../../src/adapters/google/google-workbook";
import type { RestClient } from "../../../src/adapters/google/rest";
import type { Workbook } from "../../../src/applications/session/session-model";
import { canonicalJson } from "../../../src/core/integrity/canonical-json";
import type { CheckpointCommand } from "../../../src/core/portfolio/checkpoints";
import { type IsoDate, parseIsoDate } from "../../../src/core/values/iso-date";
import { toEuroCents } from "../../../src/core/values/money";
import { sha256Hex } from "../../../src/core/integrity/sha256";
import { CheckpointSession } from "../../../src/interfaces/web/app/session/checkpoint-session";

// Synthetic data only.
export function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("Missing test fixture value");
  return value;
}
export const date = (text: string): IsoDate => required(parseIsoDate(text));
export const TODAY = date("2026-11-16");
export const euros = (value: number) => required(toEuroCents(Math.round(value * 100)));
export const request = (on = "2026-11-14", value = 1000, note = "") => ({ date: date(on), cents: euros(value), note });

export interface Memory extends KeyValueStore {
  readonly data: Map<string, string>;
  failWritesTo: RegExp | null;
  failRemovalsOf: RegExp | null;
}
export function memory(): Memory {
  const data = new Map<string, string>();
  const kv: Memory = {
    data,
    failWritesTo: null,
    failRemovalsOf: null,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      if (kv.failWritesTo?.test(key) === true) throw new Error("QuotaExceededError");
      data.set(key, value);
    },
    removeItem: (key) => {
      if (kv.failRemovalsOf?.test(key) === true) throw new Error("blocked");
      data.delete(key);
    },
  };
  return kv;
}

/** A Web Locks stand-in: exclusive, and a second request while held is told so without waiting. */
export function locks() {
  const state = {
    held: false,
    request: async <T>(
      _name: string,
      _options: { ifAvailable: true; mode: "exclusive" },
      callback: (lock: object | null) => Promise<T>,
    ): Promise<T> => {
      if (state.held) return callback(null);
      state.held = true;
      try {
        return await callback({});
      } finally {
        state.held = false;
      }
    },
  };
  return state;
}

export async function world() {
  const google = new FakeGoogle();
  const created = await createWorkbook(google.client, google.token);
  if (!created.ok) throw new Error("Synthetic workbook setup failed");
  const workbook: Workbook = created.value;
  const kv = memory();
  const shared = locks();
  let ids = 0;
  const make = (
    options: {
      store?: KeyValueStore;
      prefix?: string;
      useLocks?: boolean;
      workbookId?: string | null;
      access?: () => Promise<{ ok: true; token: string; workbook: Workbook }>;
      rest?: RestClient;
    } = {},
  ) =>
    new CheckpointSession({
      rest: options.rest ?? google.client,
      store: createCheckpointStore(() => options.store ?? kv, options.prefix ?? "foliodash."),
      lock: createCheckpointLock("foliodash.checkpoints", options.useLocks === false ? undefined : shared),
      newId: () => `synthetic-${String(++ids).padStart(4, "0")}`,
      access: options.access ?? (() => Promise.resolve({ ok: true as const, token: google.token, workbook })),
      workbookId: options.workbookId === undefined ? workbook.id : options.workbookId,
      today: () => TODAY,
    });
  const appends = () => google.calls.filter((call) => call.includes(":append")).length;
  return { google, workbook, kv, shared, make, appends };
}

export async function ready() {
  const w = await world();
  const session = w.make();
  await session.refresh();
  return { ...w, session };
}

export function appendRaw(google: FakeGoogle, id: string, entry: CheckpointCommand): void {
  const text = canonicalJson(entry);
  required(google.tab(id, CHECKPOINT_LOG_TITLE)).rows.push(["1", text, sha256Hex(text)]);
}
