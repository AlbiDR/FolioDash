// Local browser harness: all records, workbook IDs and provider responses are synthetic.
import { h, render } from "preact";
import { FakeGoogle } from "./FakeGoogle";
import { createLedgerCache } from "../../src/adapters/browser/LedgerCache";
import { createRevisionPendingStore } from "../../src/adapters/browser/RevisionPending";
import { presentStatement } from "../../src/adapters/fideuram/FideuramPresentation";
import { parseIsoDate } from "../../src/core/IsoDate";
import { toEuroCents, ZERO_CENTS } from "../../src/core/Money";
import { Session } from "../../src/interfaces/web/app/session";
import { interpretStatement } from "../../src/interfaces/web/app/interpretStatement";
import { useSession } from "../../src/interfaces/web/app/useSession";
import { AccountView } from "../../src/interfaces/web/features/account/AccountView";
import { PrivacyProvider } from "../../src/interfaces/web/presentation/privacy/privacy";

const google = new FakeGoogle();
let sequence = 0;
const session = new Session({
  clientId: "synthetic-client",
  interpret: interpretStatement,
  present: presentStatement,
  signIn: () => Promise.resolve({ ok: true, accessToken: google.token, expiresInSeconds: 3600 }),
  rest: google.client,
  cache: createLedgerCache(() => window.localStorage, "synthetic-account-copy"),
  revisionPending: createRevisionPendingStore(() => window.localStorage, "synthetic-account-pending."),
  now: () => 1_700_000_000_000,
  newId: () => `synthetic-${String(++sequence)}`,
});

function Harness() {
  const state = useSession(session);
  return h(PrivacyProvider, {
    hidden: false,
    children: h(AccountView, {
      state,
      now: 1_700_000_000_000,
      clientConfigured: true,
      build: "synthetic",
      expenseCommands: 0,
      revisionSave: session.save,
      actions: {
        connect: () => session.connect(),
        refresh: () => session.refresh(),
        reconnect: (options) => session.reconnect(options),
        restore: () => session.restoreFromDevice(),
        verify: () => session.verifyHistory(),
        tidy: () => session.tidySheet(),
        forget: () => {
          session.forget();
        },
        setClientId: () => true,
      },
    }),
  });
}

const root = document.getElementById("root");
if (root === null) throw new Error("Synthetic mount missing");
render(h(Harness, {}), root);
Object.assign(window, {
  syntheticAccount: {
    /** A manually entered statement saved through the real save path, so there is history to check and restore. */
    addStatement: async () => {
      const value = toEuroCents(100_000);
      const date = parseIsoDate("2026-01-31");
      if (value === null || date === null) throw new Error("Invalid synthetic setup");
      const isin = "US0378331005";
      const saved = await session.save.record(
        {
          date,
          statement: { funds: [{ isin, name: "Synthetic Fund A", marketValue: value }], fundsSubtotal: value },
          commands: [
            {
              isin,
              action: "Start",
              moneyIn: ZERO_CENTS,
              moneyOut: ZERO_CENTS,
              openingNetInvested: value,
              comment: "",
            },
          ],
        },
        session.save.newCommandId(),
        session.state.ledger.revision,
      );
      await session.idle();
      return saved.status;
    },
    statements: () => session.state.ledger.snapshots.length,
    mode: () => session.state.mode,
    sheet: () => session.state.sheet,
    refuseNextRead: () => {
      google.faults.push({ match: /^GET /u, status: 401 });
    },
    loseNextRead: () => {
      google.faults.push({ match: /^GET /u, network: true });
    },
    loseNextWrite: () => {
      google.faults.push({ match: /:batchUpdate$/u, network: true });
    },
    /** The Google workbook vanishes while this device keeps its copy. */
    deleteWorkbook: () => {
      const id = session.state.workbook?.id;
      if (id !== undefined) google.workbooks.delete(id);
    },
    /** What Google itself holds, independent of what this device remembers. */
    googleWorkbooks: () => google.workbooks.size,
    workbookExists: () => {
      const id = session.state.workbook?.id;
      return id !== undefined && google.workbooks.has(id);
    },
  },
});
