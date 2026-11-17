import { prepareManualStatement } from "../../../features/import/manual-statement";
import { describe, expect, it } from "vitest";
import { ISIN_A, ISIN_B } from "../../../../../../tests/fixtures/synthetic-fideuram-sheet";
import { LEDGER_TAB, VIEW_TAB } from "../../../../../adapters/google/sheets-layout";
import { parseIsin } from "../../../../../core/values/isin";
import { ZERO_CENTS } from "../../../../../core/values/money";
import type { RecordRequest } from "../../../../../applications/import/import-model";
import { createLedgerCache } from "../../../../../adapters/browser/storage/ledger-cache";
import {
  cents,
  date,
  january,
  february,
  memory,
  world,
  saved,
} from "../../../../../../tests/fixtures/session/session-test-support";

describe("starting from scratch", () => {
  it("connects a synthetic session without loading the normal workbook or device copy", async () => {
    const { google, make, store } = world();
    const normal = make();
    await normal.connect();
    await saved(normal, january);
    const normalCopy = store.data.get("foliodash.ledger.v1");
    const synthetic = make({
      workbookIdentity: {
        title: "FolioDash SYNTHETIC ACCEPTANCE",
        propertyKey: "foliodash-synthetic-acceptance",
        propertyValue: "ledger-v1",
      },
      cache: createLedgerCache(() => store, "foliodash.synthetic-acceptance.ledger.v1"),
    });
    expect(synthetic.state.mode).toBe("signed-out");
    await synthetic.connect();
    expect(synthetic.state.ledger.snapshots).toHaveLength(0);
    expect(synthetic.state.workbook?.id).not.toBe(normal.state.workbook?.id);
    expect(google.files.size).toBe(2);
    expect(store.data.get("foliodash.ledger.v1")).toBe(normalCopy);
    await normal.idle();
    await synthetic.idle();
  });

  it("keeps synthetic workbook identity when restoring a missing test workbook", async () => {
    const { google, make, store } = world();
    const identity = {
      title: "FolioDash SYNTHETIC ACCEPTANCE",
      propertyKey: "foliodash-synthetic-acceptance",
      propertyValue: "ledger-v1",
    };
    const session = make({
      workbookIdentity: identity,
      cache: createLedgerCache(() => store, "foliodash.synthetic-acceptance.ledger.v1"),
    });
    await session.connect();
    await saved(session, january);
    await session.idle();
    const original = session.state.workbook;
    if (original === null) throw new Error("Synthetic setup failed");
    google.workbooks.delete(original.id);
    const file = google.files.get(original.id);
    if (file !== undefined) file.trashed = true;
    await session.refresh();
    expect(session.state.sheet).toBe("missing");
    const result = await session.restoreFromDevice();
    expect(result.status).toBe("restored");
    const restored = session.state.workbook;
    if (restored === null) throw new Error("Synthetic restoration failed");
    expect(restored.id).not.toBe(original.id);
    expect(google.files.get(restored.id)?.name).toBe(identity.title);
    expect(google.files.get(restored.id)?.appProperties).toEqual({ [identity.propertyKey]: identity.propertyValue });
    expect(store.data.has("foliodash.ledger.v1")).toBe(false);
    await session.idle();
  });
  it("one connect signs in once, creates the sheet, and leaves the person ready to import", async () => {
    const { google, log, make } = world();
    const session = make();
    expect(session.state.mode).toBe("signed-out");
    const outcome = await session.connect();
    expect(outcome).toMatchObject({ status: "connected", created: true, statements: 0 });
    expect(session.state).toMatchObject({ mode: "online", sheet: "ok" });
    expect(session.state.workbook).not.toBeNull();
    expect(log.signIns).toBe(1);
    expect(google.files.size).toBe(1);
  });

  it("a second device finds the same sheet and loads what was saved, with nothing remembered in advance", async () => {
    const { google, make } = world();
    const first = make();
    await first.connect();
    expect((await saved(first, january)).status).toBe("recorded");
    const otherDevice = world({ google }).make();
    expect(otherDevice.state.mode).toBe("signed-out");
    expect(await otherDevice.connect()).toMatchObject({ status: "connected", created: false, statements: 1 });
    expect(google.files.size).toBe(1);
  });

  it("starts a November portfolio manually and reads it on a device with no saved copy", async () => {
    const { google, make } = world();
    const session = make();
    expect(google.files.size).toBe(0);
    expect(session.state.ledger.snapshots).toEqual([]);
    expect(await session.connect()).toMatchObject({ status: "connected", created: true, statements: 0 });
    const prepared = prepareManualStatement([
      { name: "Synthetic November A", isin: ISIN_A, amount: "1.300,00" },
      { name: "Synthetic November B", isin: ISIN_B, amount: "900,00" },
    ]);
    if (!prepared.ok) throw new Error("Synthetic manual statement failed");
    const request: RecordRequest = {
      date: date("2026-11-15"),
      statement: prepared.statement,
      commands: [ISIN_A, ISIN_B].map((isin) => ({
        isin: parseIsin(isin) as NonNullable<ReturnType<typeof parseIsin>>,
        action: "Start",
        moneyIn: ZERO_CENTS,
        moneyOut: ZERO_CENTS,
        openingNetInvested: cents(1000),
        comment: "",
      })),
    };
    expect((await saved(session, request)).status).toBe("recorded");
    await session.idle();
    const workbook = session.state.workbook;
    if (workbook === null) throw new Error("Synthetic workbook missing");
    expect(google.files.size).toBe(1);
    expect(google.tab(workbook.id, LEDGER_TAB)?.hidden).toBe(true);
    expect(google.tab(workbook.id, VIEW_TAB)?.hidden).toBe(false);
    expect(session.state.ledger.snapshots[0]?.fundsSubtotal).toBe(cents(2200));
    expect(Object.values(session.state.ledger.snapshots[0]?.holdings ?? {}).map((h) => h.netInvested)).toEqual([
      cents(1000),
      cents(1000),
    ]);
    const secondDevice = world({ google }).make();
    expect(secondDevice.state.mode).toBe("signed-out");
    expect(await secondDevice.connect()).toMatchObject({ status: "connected", created: false, statements: 1 });
    expect(secondDevice.state.ledger).toEqual(session.state.ledger);
    expect(google.files.size).toBe(1);
    await secondDevice.idle();
  });

  it("a refused sign-in changes nothing and touches no network", async () => {
    const { google, make } = world();
    const session = make({ signIn: () => Promise.resolve({ ok: false, reason: "denied" }) });
    expect(await session.connect()).toEqual({ status: "sign-in-failed", reason: "denied" });
    expect(session.state.mode).toBe("signed-out");
    expect(google.calls).toEqual([]);
  });
});

describe("the device copy", () => {
  it("opens instantly from the saved copy with no network call and no sign-in", async () => {
    const { google, store, log, make } = world();
    const first = make();
    await first.connect();
    await saved(first, january);
    const callsBefore = google.calls.length;
    const signInsBefore = log.signIns;
    const next = world({ google, store }).make();
    expect(next.state).toMatchObject({ mode: "device-copy", sheet: "unchecked" });
    expect(next.state.ledger.snapshots).toHaveLength(1);
    expect(google.calls.length).toBe(callsBefore);
    expect(log.signIns).toBe(signInsBefore);
  });

  it("keeps the copy current after every save, so a reload shows what was just saved", async () => {
    const { google, store, make } = world();
    const first = make();
    await first.connect();
    await saved(first, january);
    await saved(first, february);
    expect(world({ google, store }).make().state.ledger.snapshots).toHaveLength(2);
  });

  it("refresh confirms an unchanged copy without replacing it, and reports that nothing changed", async () => {
    const { log, make } = world();
    const first = make();
    await first.connect();
    await saved(first, january);
    const returning = make();
    const before = returning.state.ledger;
    log.clock += 60_000;
    expect(await returning.refresh()).toMatchObject({ status: "connected", changed: false, statements: 1 });
    expect(returning.state.mode).toBe("online");
    expect(returning.state.syncedAt).toBe(log.clock);
    expect(returning.state.ledger.revision).toBe(before.revision);
  });

  it("refresh picks up a statement saved on another device", async () => {
    const { google, make } = world();
    const phone = make();
    await phone.connect();
    await saved(phone, january);
    // A different device generates different ids, as real ones (random) would.
    let laptopIds = 0;
    const laptop = world({ google, store: memory() }).make({
      newId: () => `laptop-${String(++laptopIds).padStart(6, "0")}`,
    });
    await laptop.connect();
    expect((await saved(laptop, february)).status).toBe("recorded");
    expect(await phone.refresh()).toMatchObject({ status: "connected", changed: true, statements: 2 });
  });

  it("reuses one sign-in for a run of actions while the token is valid", async () => {
    const { log, make } = world();
    const session = make();
    await session.connect();
    await saved(session, january);
    await session.refresh();
    expect(log.signIns).toBe(1);
  });

  it("writes the readable tab after a save without letting its failure matter", async () => {
    const { google, make } = world();
    const session = make();
    await session.connect();
    google.faults.push({ match: /:clear$/u, status: 500 });
    expect((await saved(session, january)).status).toBe("recorded");
    await session.idle();
    const id = session.state.workbook?.id ?? "";
    expect(google.tab(id, LEDGER_TAB)?.rows.length).toBeGreaterThan(1);
    expect(session.state.ledger.snapshots).toHaveLength(1);
    expect(google.tab(id, VIEW_TAB)).toBeDefined();
  });
});

describe("when the sheet and the device copy disagree, the copy is protected", () => {
  async function withCopy() {
    const w = world();
    const session = w.make();
    await session.connect();
    await saved(session, january);
    await saved(session, february);
    return { ...w, session };
  }

  it("a deleted sheet is reported, the copy is kept, and a confirmed restore re-creates it", async () => {
    const { google, session } = await withCopy();
    const id = session.state.workbook?.id ?? "";
    google.workbooks.delete(id);
    const outcome = await session.refresh();
    expect(outcome).toMatchObject({ status: "needs-attention", sheet: "missing" });
    expect(session.state.ledger.snapshots).toHaveLength(2);
    const restored = await session.restoreFromDevice();
    expect(restored.status).toBe("restored");
    expect(session.state).toMatchObject({ sheet: "ok", mode: "online" });
    expect(session.state.workbook?.id).not.toBe(id);
    expect(session.state.ledger.snapshots).toHaveLength(2);
  });

  it("an emptied sheet is reported, the copy is kept, and a restore refills that same sheet", async () => {
    const { google, session } = await withCopy();
    const id = session.state.workbook?.id ?? "";
    const tab = google.tab(id, LEDGER_TAB);
    if (tab !== undefined) tab.rows = tab.rows.slice(0, 1);
    expect(await session.refresh()).toMatchObject({ status: "needs-attention", sheet: "emptied" });
    expect(session.state.ledger.snapshots).toHaveLength(2);
    expect((await session.restoreFromDevice()).status).toBe("restored");
    expect(session.state.workbook?.id).toBe(id);
    expect(google.files.size).toBe(1);
  });

  it("a damaged sheet is never shown or copied over the saved copy", async () => {
    const { google, store, session } = await withCopy();
    const stored = store.data.get("foliodash.ledger.v1");
    const id = session.state.workbook?.id ?? "";
    const snapshot = (google.tab(id, LEDGER_TAB)?.rows ?? []).find((row) => row[1] === "SNAPSHOT");
    if (snapshot !== undefined) snapshot[2] = "{}";
    expect(await session.refresh()).toMatchObject({ status: "needs-attention", sheet: "damaged" });
    expect(store.data.get("foliodash.ledger.v1")).toBe(stored);
    expect(session.state.ledger.snapshots).toHaveLength(2);
  });

  it("will not restore when nothing is wrong, and has nothing to restore from an empty device", async () => {
    const { session } = await withCopy();
    expect((await session.restoreFromDevice()).status).toBe("not-needed");
    expect((await world().make().restoreFromDevice()).status).toBe("nothing-to-restore");
  });

  it("a network failure leaves the copy and the mode as they were", async () => {
    const { google, session } = await withCopy();
    google.faults.push({ match: /./u, network: true });
    expect(await session.refresh()).toMatchObject({ status: "call-failed", failure: "network" });
    expect(session.state.ledger.snapshots).toHaveLength(2);
  });
});

describe("saving through the session", () => {
  it("says plainly that nothing was saved when nobody is connected", async () => {
    const { make } = world();
    const session = make();
    expect(await saved(session, january)).toMatchObject({ status: "not-saved" });
  });

  it("a lost answer is unknown, the check finds the save, and saving again cannot duplicate it", async () => {
    const { google, make } = world();
    const session = make();
    await session.connect();
    google.faults.push({ match: /:batchUpdate$/u, network: true, applyFirst: true });
    const request = { ...january };
    const id = session.save.newCommandId();
    expect((await session.save.record(request, id, "")).status).toBe("unknown");
    expect((await session.save.check(id)).status).toBe("recorded");
    expect((await session.save.record(request, id, "")).status).toBe("recorded");
    expect(session.state.ledger.snapshots).toHaveLength(1);
  });

  it("a check on a save that never happened says so", async () => {
    const { make } = world();
    const session = make();
    await session.connect();
    expect(await session.save.check("never-sent-id")).toEqual({ status: "not-recorded" });
  });
});

describe("forgetting this device", () => {
  it("wipes the copy, signs out and revokes the token, but leaves the spreadsheet in Google alone", async () => {
    const { google, store, log, make } = world();
    const session = make();
    await session.connect();
    await saved(session, january);
    const filesBefore = google.files.size;
    session.forget();
    expect(session.state).toMatchObject({ mode: "signed-out", workbook: null, syncedAt: null });
    expect(session.state.ledger.snapshots).toHaveLength(0);
    expect(store.data.size).toBe(0);
    expect(log.revoked).toEqual([google.token]);
    expect(google.files.size).toBe(filesBefore);
    expect(world({ google, store }).make().state.mode).toBe("signed-out");
  });

  it("tells listeners when the state changes", async () => {
    const { make } = world();
    const session = make();
    let notified = 0;
    const stop = session.subscribe(() => {
      notified++;
    });
    await session.connect();
    expect(notified).toBeGreaterThan(0);
    stop();
    const before = notified;
    session.forget();
    expect(notified).toBe(before);
  });
});
