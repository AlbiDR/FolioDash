// Local browser harness: all records, workbook IDs and provider responses are synthetic.
import { h, render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { FakeGoogle } from "./fake-google";
import { createCheckpointLock, createCheckpointStore } from "../../src/adapters/browser/checkpoint-store";
import { CHECKPOINT_LOG_TITLE } from "../../src/adapters/google/direct-checkpoints";
import { createWorkbook } from "../../src/adapters/google/google-workbook";
import type { RestClient } from "../../src/adapters/google/rest";
import type { Workbook } from "../../src/applications/session-model";
import { canonicalJson } from "../../src/core/canonical-json";
import type { CheckpointCommand } from "../../src/core/checkpoints";
import { type IsoDate, parseIsoDate } from "../../src/core/iso-date";
import { sha256Hex } from "../../src/core/sha256";
import { CheckpointSession } from "../../src/interfaces/web/app/checkpoint-session";
import { CheckpointsView } from "../../src/interfaces/web/features/checkpoints/checkpoints-view";
import { PrivacyProvider } from "../../src/interfaces/web/presentation/privacy/privacy";

const PREFIX = "foliodash.synthetic-acceptance.";
const parsedToday = parseIsoDate("2026-11-16");
if (parsedToday === null) throw new Error("Invalid synthetic date");
const today: IsoDate = parsedToday;

const first = new FakeGoogle();
const second = new FakeGoogle();
const created = await createWorkbook(first.client, first.token);
if (!created.ok) throw new Error("Synthetic workbook setup failed");
const otherCreated = await createWorkbook(second.client, second.token);
if (!otherCreated.ok) throw new Error("Synthetic replacement setup failed");
const firstWorkbook: Workbook = created.value;
// Both fakes number their first workbook the same, so the app is shown a different id for the second.
const replacement: Workbook = { id: "synthetic-replacement-workbook", url: otherCreated.value.url };
let connected: Workbook = firstWorkbook;
let ids = 0;
let appends = 0;
let hidden = false;

const rest: RestClient = (call) => {
  if (call.url.includes(":append")) appends++;
  return connected === firstWorkbook
    ? first.client(call)
    : second.client({ ...call, url: call.url.replaceAll(replacement.id, otherCreated.value.id) });
};

function makeSession(workbookId: string | null): CheckpointSession {
  return new CheckpointSession({
    rest,
    store: createCheckpointStore(() => window.localStorage, PREFIX),
    lock: createCheckpointLock(`${PREFIX}checkpoints`, navigator.locks),
    newId: () => `synthetic-checkpoint-${String(++ids).padStart(4, "0")}`,
    access: () =>
      Promise.resolve({
        ok: true as const,
        token: connected === firstWorkbook ? first.token : second.token,
        workbook: connected,
      }),
    workbookId,
    today: () => today,
  });
}
let session = makeSession(firstWorkbook.id);
let generation = 0;

function Harness(props: { readonly current: CheckpointSession }) {
  const [, tick] = useState(0);
  // A page reload builds a new session, so the screen follows whichever one it is given. Anything that
  // changed between the first paint and the subscription is picked up by drawing once more.
  useEffect(() => {
    const stop = props.current.subscribe(() => {
      tick((value) => value + 1);
    });
    tick((value) => value + 1);
    return stop;
  }, [props.current]);
  const state = props.current.state;
  const view = h(CheckpointsView, {
    key: state.generation,
    signedOut: false,
    state: {
      ready: state.ready,
      active: state.active,
      pending: state.pending,
      unreadable: state.receiptsUnreadable,
      message: state.message,
      preserved: state.preserved.map((entry) => ({
        workbookId: entry.workbookId,
        active: entry.active,
        pending: entry.pending,
        unreadable: entry.unreadable,
      })),
    },
    today,
    onAdd: (request) => session.add(request),
    onVoid: (id) => session.void(id),
    onCheck: () => session.checkPending(),
    preservedText: (id, masked) => session.preservedText(id, masked),
  });
  return h(PrivacyProvider, { hidden, children: view });
}

function mount(): void {
  const root = document.getElementById("root");
  if (root === null) throw new Error("Synthetic mount missing");
  generation++;
  render(h(Harness, { key: generation, current: session }), root);
}

function rawAppend(google: FakeGoogle, workbookId: string, command: CheckpointCommand): void {
  const text = canonicalJson(command);
  google.tab(workbookId, CHECKPOINT_LOG_TITLE)?.rows.push(["1", text, sha256Hex(text)]);
}

async function start(): Promise<void> {
  await session.refresh();
  mount();
  const pendingKey = `${PREFIX}checkpoints.pending.v1:${firstWorkbook.id}`;
  Object.assign(window, {
    syntheticCheckpoints: {
      appends: () => appends,
      state: () =>
        JSON.stringify({
          ready: session.state.ready,
          pending: session.state.pending.length,
          unreadable: session.state.receiptsUnreadable,
          message: session.state.message,
          active: session.state.active.length,
          commands: session.state.commands.length,
        }),
      remoteCommands: () =>
        first.tab(firstWorkbook.id, CHECKPOINT_LOG_TITLE)?.rows.length === undefined
          ? 0
          : (first.tab(firstWorkbook.id, CHECKPOINT_LOG_TITLE)?.rows.length ?? 1) - 1,
      receipt: () => window.localStorage.getItem(pendingKey) !== null,
      /** The next append is lost on the way and never applied. */
      loseNextAppend: () => {
        first.faults.push({ match: /:append/u, network: true });
      },
      /** The next append is refused before anything is written. */
      refuseNextAppend: () => {
        first.faults.push({ match: /:append/u, status: 403 });
      },
      /** The command a lost answer left behind finally arrives. */
      deliverPending: () => {
        const raw = window.localStorage.getItem(pendingKey);
        if (raw === null) throw new Error("No receipt to deliver");
        const receipts = (JSON.parse(raw) as { receipts: { command: CheckpointCommand }[] }).receipts;
        for (const entry of receipts) rawAppend(first, firstWorkbook.id, entry.command);
      },
      /** Forget this device (as another window or the person may), while a draft is on screen. */
      forgetDevice: () => {
        session.forget();
      },
      corruptReceipt: () => {
        window.localStorage.setItem(pendingKey, "damaged");
      },
      /** A new page load: the session is rebuilt from what this device kept. */
      reload: async () => {
        session = makeSession(connected.id);
        mount();
        await session.refresh();
      },
      deleteLog: () => {
        first.workbooks.get(firstWorkbook.id)?.delete(CHECKPOINT_LOG_TITLE);
      },
      refresh: () => session.refresh(),
      /** Recovery: the connected workbook is now a different one. */
      switchWorkbook: async () => {
        connected = replacement;
        session = makeSession(connected.id);
        mount();
        await session.refresh();
      },
      setHidden: (value: boolean) => {
        hidden = value;
        mount();
      },
    },
  });
}

start().catch((error: unknown) => {
  document.body.textContent = `Synthetic setup error: ${error instanceof Error ? error.message : "unknown"}`;
});
