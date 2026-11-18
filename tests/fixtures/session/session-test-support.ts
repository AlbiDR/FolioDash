import { createRevisionPendingStore } from "../../../src/adapters/browser/storage/revision-pending";
import type { SignInResult } from "../../../src/applications/session/session-model";
import { FakeGoogle } from "../fake-google";
import type { FundCommand, StatementInput } from "../../../src/core/statements/import-plan";
import { type IsoDate, parseIsoDate } from "../../../src/core/values/iso-date";
import { parseIsin } from "../../../src/core/values/isin";
import { type EuroCents, ZERO_CENTS, toEuroCents } from "../../../src/core/values/money";
import type { RecordRequest } from "../../../src/applications/import/import-model";
import { presentStatement } from "../../../src/adapters/fideuram/fideuram-presentation";
import { interpretStatement } from "../../../src/interfaces/web/app/session/interpret-statement";
import { type KeyValueStore, createLedgerCache } from "../../../src/adapters/browser/storage/ledger-cache";
import { Session } from "../../../src/interfaces/web/app/session/session";
import type { SessionDeps } from "../../../src/interfaces/web/app/session/stack/session-policy";

export const cents = (value: number): EuroCents => toEuroCents(Math.round(value * 100)) ?? ZERO_CENTS;
export const date = (text: string): IsoDate => parseIsoDate(text) as IsoDate;
export const ISIN = (() => {
  for (let digit = 0; digit < 10; digit++) {
    const candidate = parseIsin(`XSFUNDA0000${String(digit)}`);
    if (candidate !== null) return candidate;
  }
  throw new Error("no check digit");
})();
export const statement = (value: number): StatementInput => ({
  funds: [{ isin: ISIN, name: "Synthetic Fund A", marketValue: cents(value) }],
  fundsSubtotal: cents(value),
});
export const start: FundCommand = {
  isin: ISIN,
  action: "Start",
  moneyIn: ZERO_CENTS,
  moneyOut: ZERO_CENTS,
  openingNetInvested: cents(1000),
  comment: "",
};
export const keep: FundCommand = { isin: ISIN, action: "Keep", moneyIn: ZERO_CENTS, moneyOut: ZERO_CENTS, comment: "" };
export const january: RecordRequest = { date: date("2026-01-31"), statement: statement(1000), commands: [start] };
export const february: RecordRequest = { date: date("2026-02-28"), statement: statement(1100), commands: [keep] };

export const memory = (): KeyValueStore & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
};

export function world(overrides: { google?: FakeGoogle; store?: ReturnType<typeof memory> } = {}) {
  const google = overrides.google ?? new FakeGoogle();
  const store = overrides.store ?? memory();
  const log = { signIns: 0, revoked: [] as string[], clock: 1_700_000_000_000, ids: 0 };
  const make = (extra: Partial<SessionDeps> = {}): Session =>
    new Session({
      clientId: "client",
      interpret: interpretStatement,
      present: presentStatement,
      signIn: (): Promise<SignInResult> => {
        log.signIns++;
        return Promise.resolve({ ok: true, accessToken: google.token, expiresInSeconds: 3600 });
      },
      revoke: (token) => log.revoked.push(token),
      rest: google.client,
      cache: createLedgerCache(() => store),
      revisionPending: createRevisionPendingStore(() => store),
      now: () => log.clock,
      newId: () => `id-${String(++log.ids).padStart(6, "0")}`,
      ...extra,
    });
  return { google, store, log, make };
}

export async function saved(session: Session, request: RecordRequest) {
  return session.save.record(request, session.save.newCommandId(), session.state.ledger.revision);
}
