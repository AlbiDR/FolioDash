import {
  type CheckpointOutcome,
  appendCheckpoint,
  checkCheckpoint,
  preflightCheckpoint,
  readCheckpoints,
} from "../../../../adapters/google/direct-checkpoints";
import type { CheckpointReceipt } from "../../../../adapters/browser/storage/checkpoint-store";
import { type CheckpointCommand, activeCheckpoints } from "../../../../core/portfolio/checkpoints";
import type { IsoDate } from "../../../../core/values/iso-date";
import type { EuroCents } from "../../../../core/values/money";
import {
  CheckpointSessionCore,
  type CheckpointWriteResult,
  UNREADABLE,
  containsKnown,
} from "./checkpoint/checkpoint-session-core";

/** Feature state for checkpoints. The Google connection comes from the app session. */
export class CheckpointSession extends CheckpointSessionCore {
  refresh(purpose: "read" | "background" = "read"): Promise<void> {
    if (this.refreshing !== null) return this.refreshing;
    const epoch = this.epoch;
    const run = this.load(purpose).catch(() => {
      if (epoch === this.epoch)
        this.set({
          ...this.current,
          ready: false,
          message: "Your checkpoints could not be checked against Google. Your device copy was kept.",
        });
    });
    this.refreshing = run;
    void run.then(() => {
      if (this.refreshing === run) this.refreshing = null;
    });
    return run;
  }
  /** Records a value-only observation of the portfolio's total value. */
  add(request: {
    readonly date: IsoDate;
    readonly cents: EuroCents;
    readonly note: string;
  }): Promise<CheckpointWriteResult> {
    return this.write({
      id: this.deps.newId(),
      kind: "add",
      date: request.date,
      cents: request.cents,
      note: request.note,
    });
  }
  /** Withdraws an active checkpoint. */
  void(target: string): Promise<CheckpointWriteResult> {
    return this.write({ id: this.deps.newId(), kind: "void", target });
  }

  private async write(command: CheckpointCommand): Promise<CheckpointWriteResult> {
    if (this.busy)
      return { status: "not-saved", message: "A checkpoint operation is already running. Wait for its outcome." };
    this.busy = true;
    this.sequence++;
    const epoch = this.epoch;
    try {
      if (this.current.receiptsUnreadable) return { status: "unknown", message: UNREADABLE };
      if (this.current.pending.length > 0)
        return { status: "unknown", message: "A previous checkpoint save needs checking first. Use Check outcome." };
      if (!this.current.ready)
        return { status: "not-saved", message: "Load and check your checkpoints before saving." };
      const access = await this.deps.access("write");
      if (epoch !== this.epoch) return this.accountChanged();
      if (!access.ok) return { status: "not-saved", message: access.message };
      if (this.workbookId !== access.workbook.id)
        return { status: "not-saved", message: "The connected workbook changed. Reload checkpoints before saving." };
      const id = access.workbook.id;
      const today = this.deps.today?.() ?? todayOf(new Date());
      const held = await this.deps.lock.run(() => this.locked(access.token, id, command, today, epoch));
      if (held.status === "unsupported")
        return {
          status: "not-saved",
          message:
            "This browser cannot keep several windows from saving at once, so nothing was sent. Checkpoints can still be read.",
        };
      if (held.status === "busy")
        return { status: "not-saved", message: "Another window is saving a checkpoint. Wait a moment and try again." };
      return held.value;
    } catch {
      if (epoch !== this.epoch) return this.accountChanged();
      this.refreshPending();
      return {
        status: "unknown",
        message: "The save outcome could not be checked. Use Check outcome before saving again.",
      };
    } finally {
      this.busy = false;
    }
  }
  /** The whole critical section. Runs only while this window holds the lock. */
  private async locked(
    token: string,
    id: string,
    command: CheckpointCommand,
    today: IsoDate,
    epoch: number,
  ): Promise<CheckpointWriteResult> {
    // Forget or an account change may have happened while this window waited for the lock.
    if (epoch !== this.epoch) return this.accountChanged();
    const stored = this.receiptsOf(id);
    // A record that cannot be read is treated as an unresolved save, never as an empty one.
    if (stored.unreadable) {
      this.set({ ...this.current, receiptsUnreadable: true, message: UNREADABLE });
      return { status: "unknown", message: UNREADABLE };
    }
    if (stored.receipts.length > 0) {
      this.set({
        ...this.current,
        pending: stored.receipts.map((receipt) => receipt.command),
        message: "A previous checkpoint save needs checking first.",
      });
      return {
        status: "unknown",
        message: "A previous checkpoint save, possibly from another window, needs checking first. Use Check outcome.",
      };
    }
    const known = this.knownCommands(id);
    const preflight = await preflightCheckpoint(
      this.deps.rest,
      token,
      id,
      command,
      today,
      this.current.initialized,
      known,
    );
    if (epoch !== this.epoch) return this.accountChanged();
    if (preflight.status === "unavailable") return { status: "not-saved", message: preflight.message };
    // A refusal or a no-op still tells this window what Google holds now, so the list and chart catch up at once.
    if (preflight.status === "refused") {
      const note = this.adopt(id, preflight.commands ?? []);
      return { status: "refused", message: note === null ? preflight.message : `${preflight.message} ${note}` };
    }
    if (preflight.status === "no-op") {
      const note = this.adopt(id, preflight.commands);
      return {
        status: "no-change",
        message:
          note === null
            ? "Nothing to change: that checkpoint is already withdrawn."
            : `Nothing to change: that checkpoint is already withdrawn. ${note}`,
      };
    }
    // The receipt must be durable before anything is sent, or a lost answer plus a reload could lose the command.
    const receipt: CheckpointReceipt = { command, phase: "sent" };
    if (!this.deps.store.saveReceipts(id, [receipt]))
      return {
        status: "not-saved",
        message:
          "This device cannot keep a safe record of the save, so nothing was sent. Free some browser storage and try again.",
      };
    this.set({ ...this.current, pending: [command] });
    const outcome = await appendCheckpoint(
      this.deps.rest,
      token,
      id,
      command,
      today,
      this.current.initialized,
      known,
      () => epoch === this.epoch,
    );
    if (epoch !== this.epoch) return this.accountChanged();
    return this.resolve(id, receipt, outcome);
  }

  /**
   * Turns an outcome into the final state. A confirmed command is persisted in the history copy and read
   * back before its receipt is removed; a receipt is kept on any failure. An outcome known not to have
   * appended anything first records that on the receipt, so cleaning up later never needs the command to
   * exist in Google. An outcome that may have appended anything stays unknown.
   */
  private resolve(
    id: string,
    receipt: CheckpointReceipt,
    outcome: CheckpointOutcome,
    observedInitialized?: boolean,
  ): CheckpointWriteResult {
    if (outcome.status === "unknown") {
      this.refreshPending();
      this.set({ ...this.current, message: outcome.message });
      return { status: "unknown", message: outcome.message };
    }
    if (outcome.status === "conflict") {
      // The command exists with different content: never evidence that nothing was sent. Keep the receipt and the known history.
      this.refreshPending();
      this.set({ ...this.current, ready: false, suspect: true, message: outcome.message });
      return { status: "unknown", message: outcome.message };
    }
    const known = this.knownCommands(id);
    if (outcome.status !== "saved" && receipt.phase !== "not-submitted") {
      if (!this.deps.store.saveReceipts(id, [{ command: receipt.command, phase: "not-submitted" }])) {
        const message = "This device could not record that nothing was sent. Use Check outcome to finish.";
        this.refreshPending();
        this.set({ ...this.current, message });
        return { status: "unknown", message };
      }
    }
    const commands = "commands" in outcome ? outcome.commands : undefined;
    if (commands !== undefined) {
      if (!containsKnown(commands, known)) {
        const message =
          "Google's log does not include every checkpoint known on this device. Your copy and the unsent command were kept. Review the workbook before saving again.";
        this.refreshPending();
        this.set({ ...this.current, ready: false, suspect: true, message });
        return { status: "unknown", message };
      }
      // An absent log stays uninitialised; only a log that exists (or one that was saved) is remembered as initialized.
      const initialized =
        observedInitialized ?? (outcome.status === "saved" || this.current.initialized || commands.length > 0);
      const kept = !initialized && commands.length === 0 ? "saved" : this.persistCopy(id, commands, initialized);
      if (kept !== "saved") {
        // Nothing is lost: the receipt stays until the local copy can be written.
        const message =
          kept === "stale"
            ? "Another window holds newer checkpoint data. Use Check outcome to finish."
            : outcome.status === "saved"
              ? "Saved in Google, but this device could not update its local copy. Use Check outcome to finish."
              : "This device could not update its local copy. Use Check outcome to finish.";
        this.refreshPending();
        this.set({ ...this.current, commands, active: activeCheckpoints(commands), initialized, message });
        return { status: "unknown", message };
      }
      this.set({
        ...this.current,
        commands,
        active: activeCheckpoints(commands),
        initialized,
        cached: false,
        suspect: false,
      });
    }
    const cleared = this.deps.store.saveReceipts(id, []);
    if (!cleared) {
      const message = "A finished save could not be cleared from this device. Use Check outcome.";
      this.refreshPending();
      this.set({ ...this.current, message });
      return { status: "unknown", message };
    }
    this.set({ ...this.current, pending: [], receiptsUnreadable: false, message: "" });
    if (outcome.status === "saved") return { status: "saved", message: "" };
    if (outcome.status === "no-op")
      return { status: "no-change", message: "Nothing to change: that checkpoint is already withdrawn." };
    return { status: outcome.status === "refused" ? "refused" : "not-saved", message: outcome.message };
  }
  /** Reads the unresolved command back from Google. Never submits anything. */
  async checkPending(): Promise<CheckpointWriteResult> {
    if (this.busy)
      return { status: "not-saved", message: "A checkpoint operation is already running. Wait for its outcome." };
    const id = this.workbookId;
    if (id === null) return { status: "not-saved", message: "Connect first." };
    this.busy = true;
    this.sequence++;
    const epoch = this.epoch;
    try {
      const access = await this.deps.access("read");
      if (epoch !== this.epoch) return this.accountChanged();
      if (!access.ok) return { status: "not-saved", message: access.message };
      if (access.workbook.id !== id)
        return {
          status: "not-saved",
          message: "The connected workbook changed. Reconnect to the original workbook to check this save.",
        };
      const held = await this.deps.lock.run(async (): Promise<CheckpointWriteResult> => {
        const stored = this.receiptsOf(id);
        if (stored.unreadable) return { status: "unknown", message: UNREADABLE };
        const receipt = stored.receipts[0];
        if (receipt === undefined) {
          this.set({ ...this.current, pending: [], receiptsUnreadable: false });
          return { status: "no-change", message: "There is no unresolved checkpoint save." };
        }
        if (receipt.phase === "not-submitted") {
          // Known never sent: clean up from the authoritative log, with no need for the command to exist in Google.
          const read = await readCheckpoints(this.deps.rest, access.token, id, this.current.initialized);
          if (epoch !== this.epoch) return this.accountChanged();
          if (read.status !== "ok" && read.status !== "absent")
            return {
              status: "unknown",
              message: "The save outcome could not be checked yet. Keep this page open and try again.",
            };
          const settled = this.resolve(
            id,
            receipt,
            { status: "not-submitted", message: "", commands: read.status === "ok" ? read.commands : [] },
            read.status === "ok",
          );
          return settled.status === "unknown"
            ? settled
            : { status: "no-change", message: "The earlier save was never sent. It is cleared." };
        }
        const outcome = await checkCheckpoint(this.deps.rest, access.token, id, receipt.command, true);
        if (epoch !== this.epoch) return this.accountChanged();
        return this.resolve(id, receipt, outcome);
      });
      if (held.status === "unsupported")
        return {
          status: "not-saved",
          message: "This browser cannot keep several windows from saving at once, so nothing was changed.",
        };
      if (held.status === "busy")
        return {
          status: "not-saved",
          message: "Another window is working on checkpoints. Wait a moment and try again.",
        };
      return held.value;
    } catch {
      return {
        status: "unknown",
        message: "The save outcome could not be checked yet. Keep this page open and try again.",
      };
    } finally {
      this.busy = false;
    }
  }
}

/** The user's local calendar date. */
function todayOf(now: Date): IsoDate {
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` as IsoDate;
}
