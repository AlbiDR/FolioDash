// Local browser harness: all records, workbook IDs and provider responses are synthetic.
import { h, render } from "preact";
import { FakeGoogle } from "./fake-google";
import { createLedgerCache } from "../../src/adapters/browser/storage/ledger-cache";
import { createRevisionPendingStore } from "../../src/adapters/browser/storage/revision-pending";
import { presentStatement } from "../../src/adapters/fideuram/fideuram-presentation";
import { parseIsoDate } from "../../src/core/values/iso-date";
import { toEuroCents, ZERO_CENTS } from "../../src/core/values/money";
import { Session } from "../../src/interfaces/web/app/session/session";
import { interpretStatement } from "../../src/interfaces/web/app/session/interpret-statement";
import { BackfillEntry } from "../../src/interfaces/web/features/import/backfill-entry";
import { PrivacyProvider } from "../../src/interfaces/web/presentation/privacy/privacy";

const google = new FakeGoogle();
let sequence = 0;
const session = new Session({
  clientId: "synthetic-client",
  interpret: interpretStatement,
  present: presentStatement,
  signIn: () => Promise.resolve({ ok: true, accessToken: google.token, expiresInSeconds: 3600 }),
  rest: google.client,
  cache: createLedgerCache(() => window.localStorage, "synthetic-browser-copy"),
  revisionPending: createRevisionPendingStore(() => window.localStorage, "synthetic-browser-pending."),
  now: () => 1_700_000_000_000,
  newId: () => `synthetic-${String(++sequence)}`,
});

async function start(): Promise<void> {
  await session.connect();
  const value = toEuroCents(100_000);
  const date = parseIsoDate("2026-01-31");
  if (value === null || date === null) throw new Error("Invalid synthetic setup");
  const isin = "US0378331005";
  const saved = await session.save.record(
    {
      date,
      statement: { funds: [{ isin, name: "Synthetic Fund A", marketValue: value }], fundsSubtotal: value },
      commands: [
        { isin, action: "Start", moneyIn: ZERO_CENTS, moneyOut: ZERO_CENTS, openingNetInvested: value, comment: "" },
      ],
    },
    session.save.newCommandId(),
    session.state.ledger.revision,
  );
  if (saved.status !== "recorded") throw new Error("Synthetic initial save failed");
  await session.idle();
  const workbook = session.state.workbook;
  if (workbook === null) throw new Error("Synthetic workbook missing");
  const original = session.state.ledger;
  const save = session.save;
  const backfill = save.backfill?.bind(save);
  const recovery = save.recoverRevision?.bind(save);
  if (backfill === undefined || recovery === undefined) throw new Error("Synthetic operations missing");
  const wrapped = {
    ...save,
    backfill: async (...args: Parameters<typeof backfill>) => {
      await session.idle();
      google.faults.push({ match: /:batchUpdate$/u, network: true, applyFirst: true });
      return backfill(...args);
    },
    recoverRevision: async (...args: Parameters<typeof recovery>) => {
      await session.idle();
      google.faults.push({ match: /:batchUpdate$/u, network: true, applyFirst: true });
      return recovery(...args);
    },
  };
  const root = document.getElementById("root");
  if (root === null) throw new Error("Synthetic mount missing");
  render(
    h(PrivacyProvider, {
      hidden: false,
      children: h(BackfillEntry, {
        ledger: original,
        workbookId: workbook.id,
        save: wrapped,
        prepare: () => Promise.resolve({ status: "unreadable-file" as const, message: "Synthetic manual test" }),
        onRecord: () => undefined,
        onLock: () => undefined,
      }),
    }),
    root,
  );
  Object.assign(window, {
    syntheticBackfill: {
      dates: () => session.state.ledger.snapshots.map((snapshot) => snapshot.date),
      pending: () => session.state.pendingRevision ?? null,
      originalRevision: original.revision,
    },
  });
}
void start().catch((error: unknown) => {
  const root = document.getElementById("root");
  if (root !== null) root.textContent = `Synthetic setup error: ${error instanceof Error ? error.message : "unknown"}`;
});
