import type { Workbook } from "../../../../../applications/session/session-model";
import {
  type DirectDeps,
  attachDirect,
  backfillDirect,
  commitDirect,
  fenceRevisionDirect,
  outcomeDirect,
  readAllDirect,
  recoverRevisionDirect,
} from "../../../../../adapters/google/direct-ledger";
import type { AttachItem } from "../../../../../applications/ledger/ledger-service";
import type { BackfillStatement } from "../../../../../applications/import/backfill-review";
import type { FundCommand } from "../../../../../core/statements/import-plan";
import type { IsoDate } from "../../../../../core/values/iso-date";
import type { RawSheet } from "../../../../../core/statements/raw-sheet";
import type {
  CheckResult,
  RecordRequest,
  RecordResult,
  RemoteSave,
} from "../../../../../applications/import/import-model";
import { NOT_SENT_TEXT, SIGN_IN_TEXT, WRITE_MINIMUM_MILLISECONDS } from "./session-policy";
import { SessionSync } from "./session-sync";

/** Saving to the spreadsheet: the save port the import screens use, with its receipts and read-back. */
export abstract class SessionRecords extends SessionSync {
  /** The save port the import screens use. It saves to the spreadsheet and reads the result back. */
  readonly save: RemoteSave = {
    newCommandId: () => this.deps.newId(),

    backfill: (
      earlier: readonly BackfillStatement[],
      boundary: readonly FundCommand[],
      commandId: string,
      expectedRevision: string,
      expectedWorkbookId: string,
    ): Promise<RecordResult> =>
      this.writeRevision(
        commandId,
        (deps, token, workbook) =>
          backfillDirect(
            deps,
            token,
            workbook.id,
            { earlier, boundary, commandId, expectedRevision },
            this.deps.interpret,
          ),
        earlier.flatMap((item) => (item.source === undefined ? [] : [{ date: item.date, sheet: item.source.sheet }])),
        expectedWorkbookId,
      ),

    recoverRevision: (
      targetRevision: string,
      commandId: string,
      expectedRevision: string,
      expectedWorkbookId: string,
    ): Promise<RecordResult> =>
      this.writeRevision(
        commandId,
        (deps, token, workbook) =>
          recoverRevisionDirect(deps, token, workbook.id, { targetRevision, commandId, expectedRevision }),
        [],
        expectedWorkbookId,
      ),

    record: async (request: RecordRequest, commandId: string, expectedRevision: string): Promise<RecordResult> => {
      const generation = this.generation;
      const { workbook } = this.current;
      if (workbook === null)
        return { status: "not-saved", message: "Continue with Google first, so there is somewhere to save to." };
      if (this.revisionBlocked(workbook.id))
        return { status: "not-saved", message: "Check the previous history change before saving another statement." };
      const signed = await this.accessToken(WRITE_MINIMUM_MILLISECONDS);
      if (!signed.ok) return { status: "not-saved", message: SIGN_IN_TEXT[signed.reason] };
      if (generation !== this.generation)
        return {
          status: "not-saved",
          message:
            "The account changed before saving. Nothing was submitted. Review the selected account before continuing.",
        };
      const deps: DirectDeps = { rest: this.deps.rest, newRevision: this.deps.newId };
      const commit = await commitDirect(deps, signed.token, workbook.id, {
        commandId,
        expectedRevision,
        statement: request.statement,
        date: request.date,
        commands: request.commands,
        ...(request.source === undefined ? {} : { source: request.source }),
      });
      if (generation !== this.generation)
        return {
          status: "unknown",
          message:
            "The account changed during this save. Check its outcome in the original workbook before another attempt.",
        };
      switch (commit.status) {
        case "committed":
        case "already-committed":
          return this.readBack(
            workbook,
            signed.token,
            request.source === undefined ? [] : [{ date: request.date, sheet: request.source.sheet }],
          );
        case "stale":
          await this.load(workbook, signed.token, false, generation);
          return { status: "stale" };
        case "rejected":
          return { status: "rejected", messages: commit.messages };
        case "damaged":
          return { status: "damaged", message: commit.message };
        case "not-committed":
          return { status: "not-saved", message: commit.message };
        case "not-sent":
          return { status: "not-saved", message: NOT_SENT_TEXT[commit.failure] };
        case "refused":
          return { status: "not-saved", message: commit.message };
        case "unknown":
          return { status: "unknown", message: commit.message };
      }
    },

    attach: async (
      items: readonly AttachItem[],
      commandId: string,
      expectedRevision: string,
    ): Promise<RecordResult> => {
      const generation = this.generation;
      const { workbook } = this.current;
      if (workbook === null)
        return { status: "not-saved", message: "Continue with Google first, so there is somewhere to save to." };
      if (this.revisionBlocked(workbook.id))
        return { status: "not-saved", message: "Check the previous history change before attaching statements." };
      const signed = await this.accessToken(WRITE_MINIMUM_MILLISECONDS);
      if (!signed.ok) return { status: "not-saved", message: SIGN_IN_TEXT[signed.reason] };
      if (generation !== this.generation)
        return {
          status: "not-saved",
          message:
            "The account changed before saving. Nothing was submitted. Review the selected account before continuing.",
        };
      const deps: DirectDeps = { rest: this.deps.rest, newRevision: this.deps.newId };
      const commit = await attachDirect(deps, signed.token, workbook.id, { commandId, expectedRevision, items });
      if (generation !== this.generation)
        return {
          status: "unknown",
          message:
            "The account changed during this save. Check its outcome in the original workbook before another attempt.",
        };
      switch (commit.status) {
        case "committed":
        case "already-committed":
          return this.readBack(
            workbook,
            signed.token,
            items.map((item) => ({ date: item.date, sheet: item.source.sheet })),
          );
        case "stale":
          await this.load(workbook, signed.token, false, generation);
          return { status: "stale" };
        case "rejected":
          return { status: "rejected", messages: commit.messages };
        case "damaged":
          return { status: "damaged", message: commit.message };
        case "not-committed":
          return { status: "not-saved", message: commit.message };
        case "not-sent":
          return { status: "not-saved", message: NOT_SENT_TEXT[commit.failure] };
        case "refused":
          return { status: "not-saved", message: commit.message };
        case "unknown":
          return { status: "unknown", message: commit.message };
      }
    },

    statementDates: async (): Promise<ReadonlySet<IsoDate> | null> => {
      const { workbook } = this.current;
      if (workbook === null) return null;
      const signed = await this.accessToken();
      if (!signed.ok) return null;
      const all = await readAllDirect(this.deps.rest, signed.token, workbook.id);
      return all.status === "ok" ? new Set(all.sources.map((source) => source.date)) : null;
    },

    check: async (commandId: string, expectedWorkbookId?: string): Promise<CheckResult> => {
      const { workbook } = this.current;
      if (workbook === null) return { status: "cannot-tell", message: "There is no spreadsheet to check." };
      if (expectedWorkbookId !== undefined && workbook.id !== expectedWorkbookId)
        return {
          status: "cannot-tell",
          message: "The account changed. Check this operation in its original workbook.",
        };
      const pending = this.deps.revisionPending?.load(workbook.id);
      if (pending !== undefined && !pending.ok)
        return { status: "cannot-tell", message: "The pending change on this device could not be read." };
      if (pending?.ok === true && pending.commandId !== null && pending.commandId !== commandId)
        return { status: "cannot-tell", message: "A different history change needs checking first." };
      const signed = await this.accessToken();
      if (!signed.ok)
        return { status: "cannot-tell", message: SIGN_IN_TEXT[signed.reason].replace(", so nothing was saved", "") };
      const outcome = await outcomeDirect(this.deps.rest, signed.token, workbook.id, commandId);
      switch (outcome.status) {
        case "not-found":
          if (pending?.ok === true && pending.commandId === commandId) {
            if (pending.predecessor === null)
              return {
                status: "cannot-tell",
                message: "The change is not visible yet. Check again before making another change.",
              };
            const fenced = await fenceRevisionDirect(
              { rest: this.deps.rest, newRevision: this.deps.newId },
              signed.token,
              workbook.id,
              commandId,
              pending.predecessor,
            );
            if (fenced === "unknown")
              return {
                status: "cannot-tell",
                message: "The change could not yet be resolved. Check again before making another change.",
              };
            const read = await this.readBack(workbook, signed.token);
            if (read.status !== "recorded")
              return {
                status: "cannot-tell",
                message: "The spreadsheet could not be reloaded. Check the change again.",
              };
            if (!this.deps.revisionPending?.clear(workbook.id, commandId))
              return { status: "cannot-tell", message: "The pending receipt could not be cleared on this device." };
            this.set({ ...this.current, pendingRevision: null });
            return fenced === "fenced" ? { status: "not-recorded" } : read;
          }
          return { status: "not-recorded" };
        case "damaged":
          return { status: "cannot-tell", message: `${outcome.message} Do not record anything until it is restored.` };
        case "unreachable":
          return { status: "cannot-tell", message: "The spreadsheet could not be checked. Try again shortly." };
        case "committed": {
          const back = await this.readBack(workbook, signed.token);
          if (back.status === "recorded" && pending?.ok === true && pending.commandId === commandId) {
            if (!this.deps.revisionPending?.clear(workbook.id, commandId))
              return {
                status: "cannot-tell",
                message: "The change is recorded, but its pending receipt could not be cleared on this device.",
              };
            this.set({ ...this.current, pendingRevision: null });
          }
          return back.status === "recorded" ? back : { status: "saved-not-reloaded" };
        }
      }
    },
  };

  protected revisionBlocked(workbookId: string): boolean {
    const pending = this.deps.revisionPending?.load(workbookId);
    return pending !== undefined && (!pending.ok || pending.commandId !== null);
  }

  protected async writeRevision(
    commandId: string,
    action: (deps: DirectDeps, token: string, workbook: Workbook) => ReturnType<typeof backfillDirect>,
    mirror: readonly { readonly date: IsoDate; readonly sheet: RawSheet }[] = [],
    expectedWorkbookId?: string,
  ): Promise<RecordResult> {
    const generation = this.generation;
    const { workbook } = this.current;
    if (workbook === null)
      return { status: "not-saved", message: "Continue with Google first, so there is somewhere to save to." };
    if (expectedWorkbookId !== undefined && workbook.id !== expectedWorkbookId) return { status: "stale" };
    const signed = await this.accessToken(WRITE_MINIMUM_MILLISECONDS);
    if (!signed.ok) return { status: "not-saved", message: SIGN_IN_TEXT[signed.reason] };
    if (generation !== this.generation)
      return { status: "not-saved", message: "The account changed before saving. Nothing was submitted." };
    if (this.deps.revisionPending === undefined || !this.deps.revisionPending.begin(workbook.id, commandId))
      return {
        status: "not-saved",
        message:
          "The previous history change needs checking, or this device cannot keep a recovery receipt. Nothing was submitted.",
      };
    this.set({ ...this.current, pendingRevision: commandId });
    let result: Awaited<ReturnType<typeof backfillDirect>>;
    try {
      result = await action(
        {
          rest: this.deps.rest,
          newRevision: this.deps.newId,
          beforeRevisionWrite: (fingerprint) =>
            this.deps.revisionPending?.prepare(workbook.id, commandId, fingerprint) ?? false,
        },
        signed.token,
        workbook,
      );
    } catch {
      return { status: "unknown", message: "The result is not known. Check the change before trying again." };
    }
    if (generation !== this.generation)
      return {
        status: "unknown",
        message:
          "The account changed during this save. Check its outcome in the original workbook before another attempt.",
      };
    if (result.status !== "unknown" && result.status !== "committed" && result.status !== "already-committed") {
      if (!this.deps.revisionPending.clear(workbook.id, commandId))
        return {
          status: "unknown",
          message: "The pending receipt could not be cleared. Check the change before continuing.",
        };
      this.set({ ...this.current, pendingRevision: null });
    }
    switch (result.status) {
      case "committed":
      case "already-committed": {
        const read = await this.readBack(workbook, signed.token, mirror);
        if (read.status !== "recorded") return read;
        if (!this.deps.revisionPending.clear(workbook.id, commandId))
          return {
            status: "unknown",
            message:
              "The change was recorded, but its pending receipt could not be cleared. Check the change before continuing.",
          };
        this.set({ ...this.current, pendingRevision: null });
        return read;
      }
      case "stale":
        await this.load(workbook, signed.token, false, generation);
        return { status: "stale" };
      case "rejected":
        return { status: "rejected", messages: result.messages };
      case "damaged":
        return { status: "damaged", message: result.message };
      case "not-committed":
        return { status: "not-saved", message: result.message };
      case "not-sent":
        return { status: "not-saved", message: NOT_SENT_TEXT[result.failure] };
      case "refused":
        return { status: "not-saved", message: result.message };
      case "unknown":
        return { status: "unknown", message: result.message };
    }
  }
}
