import type { ConnectOutcome, Workbook } from "../../../../applications/session/session-model";
import { FRESH_RENEWAL } from "../../../../applications/session/renewal-policy";
import { toIsoDate } from "../../../../core/values/iso-date";
import { EMPTY_LEDGER } from "../../../../core/portfolio/ledger";
import { ExpenseSession } from "./expense-session";
import { CheckpointSession } from "./checkpoint-session";
import { type CheckpointStore, createCheckpointStore } from "../../../../adapters/browser/storage/checkpoint-store";
import type { KeyValueStore } from "../../../../adapters/browser/storage/ledger-cache";
import { NEEDS, SIGN_IN_TEXT, type SessionDeps, WRITE_MINIMUM_MILLISECONDS } from "./stack/session-policy";
import { initialState } from "./stack/session-core";
import { SessionRecords } from "./stack/session-records";

/** A throwaway store for a session built without one (tests, previews): nothing survives it. */
function memoryCheckpointStore(): CheckpointStore {
  const data = new Map<string, string>();
  const held: KeyValueStore = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
  return createCheckpointStore(() => held, "memory.");
}

/**
 * One person's data on one device: the Google spreadsheet (the record), the saved
 * copy (an accelerator), and the sign-in that connects them. It holds no figure
 * of its own. Short-lived access is kept on the device and renewed quietly on the
 * person's next click, naming the remembered account, so the connection outlasts
 * Google's one-hour token without asking them to sign in again.
 */
export class Session extends SessionRecords {
  readonly expenses: ExpenseSession;
  readonly checkpoints: CheckpointSession;

  constructor(deps: SessionDeps) {
    super(deps, initialState(deps));
    this.hint = deps.accountHint?.load(deps.clientId) ?? null;
    const { workbook } = this.current;
    if (workbook !== null) {
      this.token = deps.googleSession?.load(deps.clientId, workbook.id, deps.now()) ?? null;
      // Remembered, but not yet confirmed this visit: the next click renews access if it is missing.
      if (this.token === null) this.current = { ...this.current, connection: "waiting" };
    }
    this.expenses = new ExpenseSession({
      rest: this.deps.rest,
      newId: deps.newId,
      workbookId: this.current.workbook?.id ?? null,
      onViewResult: (updated) => {
        if (!updated) {
          this.organizationPending = true;
          this.set({
            ...this.current,
            organization: {
              status: "pending",
              message:
                "Your expense entry is saved. Its readable spreadsheet view will be refreshed on the next connection or save.",
            },
          });
        } else if (this.organizationPending && this.current.workbook !== null)
          this.queueViews(this.current.workbook, this.current.ledger, [], true);
      },
      today: () => {
        const now = new Date(deps.now());
        const today = toIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
        if (today === null) throw new Error("The device date is outside the supported range.");
        return today;
      },
      ...(deps.expenseCache === undefined ? {} : { cache: deps.expenseCache }),
      access: (purpose) => this.featureAccess(purpose, (blocked) => this.expenseBlockedMessage(blocked)),
    });
    this.checkpoints = new CheckpointSession({
      rest: this.deps.rest,
      store: deps.checkpointStore ?? memoryCheckpointStore(),
      lock: deps.checkpointLock ?? { run: () => Promise.resolve({ status: "unsupported" as const }) },
      newId: deps.newId,
      workbookId: this.current.workbook?.id ?? null,
      today: () => {
        const now = new Date(deps.now());
        const today = toIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
        if (today === null) throw new Error("The device date is outside the supported range.");
        return today;
      },
      access: (purpose) => this.featureAccess(purpose, (blocked) => this.checkpointBlockedMessage(blocked)),
    });
  }

  /**
   * The signed-in access a feature needs, in the same terms for every feature. The tab can be opened before the
   * portfolio was checked on this visit, so a read checks the workbook itself; a write still needs a check that has succeeded.
   */
  private async featureAccess(
    purpose: "read" | "write",
    blocked: (purpose: "read" | "write") => string,
  ): Promise<
    | { readonly ok: true; readonly token: string; readonly workbook: Workbook }
    | { readonly ok: false; readonly message: string }
  > {
    if (this.current.workbook === null)
      return { ok: false, message: "Continue with Google first to create or find your private FolioDash workbook." };
    if (this.current.sheet !== "ok" && purpose === "read") {
      const outcome = await this.refresh();
      if (outcome.status === "sign-in-failed") return { ok: false, message: SIGN_IN_TEXT[outcome.reason] };
    }
    if (this.current.sheet !== "ok") return { ok: false, message: blocked(purpose) };
    const signed = await this.accessToken(purpose === "write" ? WRITE_MINIMUM_MILLISECONDS : 0);
    return signed.ok
      ? { ok: true, token: signed.token, workbook: this.current.workbook }
      : { ok: false, message: SIGN_IN_TEXT[signed.reason] };
  }

  /** Why checkpoints cannot be read or changed now. */
  private checkpointBlockedMessage(purpose: "read" | "write"): string {
    const { sheet } = this.current;
    if (sheet !== "ok" && sheet !== "unchecked") return NEEDS[sheet];
    if (purpose === "read")
      return "Google could not check your workbook, so your saved checkpoint copy was kept. Check again shortly.";
    return "Sync and check your Google workbook in Your data before saving a checkpoint.";
  }

  /** Why expenses cannot be read or changed now, in the same words the portfolio uses for its sheet. */
  private expenseBlockedMessage(purpose: "read" | "write"): string {
    const { sheet } = this.current;
    if (sheet !== "ok" && sheet !== "unchecked") return NEEDS[sheet];
    if (purpose === "read")
      return "Google could not check your workbook, so your saved expense copy was kept. Check again shortly.";
    return "Sync and check your Google workbook in Your data before changing expenses.";
  }

  /**
   * Reconnection renews the current workbook. An explicit account switch first drops the old
   * device context and discovers the selected account’s workbook through a new connection.
   */
  reconnect(options?: { readonly differentAccount?: boolean }): Promise<ConnectOutcome> {
    if (options?.differentAccount === true) {
      // A chooser is a new account connection, never a renewal of the previous workbook.
      // Hide and invalidate the former account before OAuth; cancellation must not expose it.
      this.forgetDevice(true, false);
      this.chooserOnNextSignIn = true;
      return this.connect();
    }
    this.organizationChecked = null;
    this.token = null;
    this.deps.googleSession?.clear();
    this.chooserOnNextSignIn = false;
    this.syncSequence++;
    this.set({ ...this.current, connection: "renewing" });
    return this.refresh();
  }

  /** Wipes everything this device holds and signs out. The spreadsheet in Google is not touched. */
  forget(): void {
    this.forgetDevice(true);
  }

  /** Another window of this browser forgot the device: this one drops its copy too, and must not write anything back. */
  forgetFromElsewhere(): void {
    this.forgetDevice(false);
  }

  private forgetDevice(announce: boolean, revoke = true): void {
    this.generation++;
    this.syncSequence++;
    this.lastAutoCheck = -Infinity;
    this.freshness = null;
    this.verifying = null;
    this.deps.googleSession?.clear();
    this.deps.accountHint?.clear();
    this.hint = null;
    this.renewal = FRESH_RENEWAL;
    this.chooserOnNextSignIn = false;
    if (announce) this.deps.coordination?.announceForgotten();
    this.signingIn = null;
    this.connecting = null;
    this.expenses.forget();
    this.checkpoints.forget();
    this.deps.cache.clear();
    if (this.token !== null && announce && revoke) this.deps.revoke?.(this.token.accessToken);
    this.token = null;
    if (this.quietTimer !== null) clearTimeout(this.quietTimer);
    this.quietTimer = null;
    this.pendingView = null;
    this.pendingTabs = new Map();
    this.tidied = null;
    this.organizationPending = false;
    this.organizationChecked = null;
    this.organizationCheck = null;
    this.organizing = null;
    this.set({
      mode: "signed-out",
      ledger: EMPTY_LEDGER,
      workbook: null,
      syncedAt: null,
      sheet: "unchecked",
      trailingRows: 0,
    });
  }
}
