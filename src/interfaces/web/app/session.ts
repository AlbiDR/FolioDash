import {
  type DirectDeps,
  commitDirect,
  ensureWorkbook,
  mirrorStatement,
  outcomeDirect,
  readAllDirect,
  readDirect,
  refreshView,
  restoreDirect,
} from "../../../adapters/google/DirectLedger";
import type { Workbook } from "../../../adapters/google/GoogleWorkbook";
import type { CallFailure } from "../../../adapters/google/LedgerResults";
import type { RestClient } from "../../../adapters/google/Rest";
import { type InterpretStatement, type RebuildReport, verifyRebuild } from "../../../applications/Rebuild";
import { EMPTY_LEDGER, type LedgerState } from "../../../core/Ledger";
import type { CheckResult, RecordRequest, RecordResult, RemoteSave } from "../features/import/ImportModel";
import type { SignInResult } from "./googleIdentity";
import type { LedgerCache } from "./ledgerCache";

/** The narrow permission: only files this app creates or the person opens with it. */
export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";

/** Where the person's data stands on this device. */
export type Mode =
  /** Nothing is stored here and nobody is signed in. */
  | "signed-out"
  /** A saved copy is on this device, not yet confirmed against the spreadsheet in this visit. */
  | "device-copy"
  /** Signed in during this visit and in step with the spreadsheet. */
  | "online";

/** What the last look at the spreadsheet showed. The device copy is never overwritten by a bad answer. */
export type SheetStatus =
  | "unchecked"
  | "ok"
  /** The spreadsheet cannot be opened: deleted, trashed or no longer shared with this app. */
  | "missing"
  /** The spreadsheet is reachable but holds no statements while this device has some. */
  | "emptied"
  | "damaged"
  | "not-a-ledger";

export interface SessionState {
  readonly mode: Mode;
  readonly ledger: LedgerState;
  readonly workbook: Workbook | null;
  /** When the ledger was last confirmed against the spreadsheet, in milliseconds since 1970. */
  readonly syncedAt: number | null;
  readonly sheet: SheetStatus;
  /** Rows after the last commit: an interrupted write, ignored and harmless. */
  readonly trailingRows: number;
}

export type ConnectOutcome =
  | { readonly status: "connected"; readonly created: boolean; readonly statements: number; readonly changed: boolean }
  | { readonly status: "sign-in-failed"; readonly reason: Extract<SignInResult, { ok: false }>["reason"] }
  | { readonly status: "call-failed"; readonly failure: CallFailure }
  /** The sheet needs the person's attention; the device copy was left exactly as it was. */
  | { readonly status: "needs-attention"; readonly sheet: Exclude<SheetStatus, "unchecked" | "ok">; readonly message: string };

export type RestoreOutcome =
  | { readonly status: "restored"; readonly workbook: Workbook }
  | { readonly status: "sign-in-failed"; readonly reason: Extract<SignInResult, { ok: false }>["reason"] }
  | { readonly status: "nothing-to-restore" }
  | { readonly status: "not-needed" }
  | { readonly status: "failed"; readonly message: string };

export type VerifyOutcome =
  | { readonly status: "checked"; readonly report: RebuildReport }
  | { readonly status: "sign-in-failed"; readonly reason: Extract<SignInResult, { ok: false }>["reason"] }
  | { readonly status: "needs-attention"; readonly message: string }
  | { readonly status: "failed"; readonly message: string };

export interface SessionDeps {
  readonly clientId: string;
  /** Re-reads a stored bank statement with today's reader, to prove the ledger can be rebuilt from them. */
  readonly interpret: InterpretStatement;
  readonly signIn: (clientId: string, scope: string) => Promise<SignInResult>;
  readonly revoke?: (accessToken: string) => void;
  readonly rest: RestClient;
  readonly cache: LedgerCache;
  readonly now: () => number;
  readonly newId: () => string;
}

const NEEDS: Readonly<Record<Exclude<SheetStatus, "unchecked" | "ok">, string>> = {
  missing: "Your Google Sheet can no longer be opened. It may have been deleted or moved to the bin. This device still has your saved copy.",
  emptied: "Your Google Sheet holds no statements, but this device still has your saved copy.",
  damaged: "Your Google Sheet's records failed their checks, so they were not used. This device still has your saved copy. Nothing was changed.",
  "not-a-ledger": "The spreadsheet found is not a FolioDash ledger, so it was not changed.",
};

/**
 * One person's data on one device: the Google spreadsheet (the record), the saved
 * copy (an accelerator), and the sign-in that connects them. It holds no figure
 * of its own. The sign-in token lives only in this object's memory.
 */
export class Session {
  private readonly deps: SessionDeps;
  private current: SessionState;
  private token: { readonly accessToken: string; readonly validUntil: number } | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly background = new Set<Promise<unknown>>();

  constructor(deps: SessionDeps) {
    this.deps = deps;
    const copy = deps.cache.load();
    this.current =
      copy === null
        ? { mode: "signed-out", ledger: EMPTY_LEDGER, workbook: null, syncedAt: null, sheet: "unchecked", trailingRows: 0 }
        : { mode: "device-copy", ledger: copy.ledger, workbook: copy.workbook, syncedAt: copy.syncedAt, sheet: "unchecked", trailingRows: 0 };
  }

  /** Resolves when the readable tabs written after a save have finished. They never delay a save and never affect it. */
  async idle(): Promise<void> {
    while (this.background.size > 0) await Promise.allSettled([...this.background]);
  }

  private later(work: Promise<unknown>): void {
    this.background.add(work);
    void work.finally(() => {
      this.background.delete(work);
    });
  }

  get state(): SessionState {
    return this.current;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private set(next: SessionState): void {
    this.current = next;
    for (const listener of this.listeners) listener();
  }

  private async accessToken(): Promise<{ readonly ok: true; readonly token: string } | { readonly ok: false; readonly reason: Extract<SignInResult, { ok: false }>["reason"] }> {
    if (this.token !== null && this.deps.now() < this.token.validUntil) return { ok: true, token: this.token.accessToken };
    const result = await this.deps.signIn(this.deps.clientId, DRIVE_FILE_SCOPE);
    if (!result.ok) {
      this.token = null;
      return result;
    }
    // Reused only while Google says it is valid (with a margin), so a run of actions asks once.
    this.token = result.expiresInSeconds === undefined ? null : { accessToken: result.accessToken, validUntil: this.deps.now() + (result.expiresInSeconds - 120) * 1000 };
    return { ok: true, token: result.accessToken };
  }

  private keep(workbook: Workbook, ledger: LedgerState): void {
    this.deps.cache.save({ workbook, ledger, syncedAt: this.deps.now() });
  }

  /** Signs in, finds or creates the spreadsheet, and loads the ledger. This is the whole of getting started. */
  async connect(): Promise<ConnectOutcome> {
    const signed = await this.accessToken();
    if (!signed.ok) return { status: "sign-in-failed", reason: signed.reason };
    const ensured = await ensureWorkbook(this.deps.rest, signed.token);
    if (ensured.status !== "ready") return { status: "call-failed", failure: ensured.failure };
    return this.load(ensured.workbook, signed.token, ensured.created);
  }

  /** Confirms the saved copy against the spreadsheet. A failed or odd answer never replaces the copy. */
  async refresh(): Promise<ConnectOutcome> {
    if (this.current.workbook === null) return this.connect();
    const signed = await this.accessToken();
    if (!signed.ok) return { status: "sign-in-failed", reason: signed.reason };
    return this.load(this.current.workbook, signed.token, false);
  }

  private async load(workbook: Workbook, accessToken: string, created: boolean): Promise<ConnectOutcome> {
    const read = await readDirect(this.deps.rest, accessToken, workbook.id);
    const copy = this.current.ledger;
    const attention = (sheet: Exclude<SheetStatus, "unchecked" | "ok">): ConnectOutcome => {
      // The device copy is left exactly as it was, so it can still be shown and, with consent, restored.
      this.set({ ...this.current, mode: this.current.mode === "signed-out" ? "signed-out" : "online", workbook, sheet });
      return { status: "needs-attention", sheet, message: NEEDS[sheet] };
    };
    switch (read.status) {
      case "call-failed":
        return { status: "call-failed", failure: read.failure };
      case "unrecognised":
        return { status: "call-failed", failure: "unexpected" };
      case "workbook-unavailable":
        return attention("missing");
      case "damaged":
        return attention("damaged");
      case "refused":
        return attention("not-a-ledger");
      case "ok":
        break;
    }
    if (read.state.snapshots.length === 0 && copy.snapshots.length > 0) return attention("emptied");
    const changed = read.state.revision !== copy.revision;
    this.keep(workbook, read.state);
    this.set({ mode: "online", ledger: read.state, workbook, syncedAt: this.deps.now(), sheet: "ok", trailingRows: read.ignoredTrailingRows });
    return { status: "connected", created, statements: read.state.snapshots.length, changed };
  }

  /**
   * Re-creates the spreadsheet, or refills an empty one, from this device's copy.
   * It only runs after the person confirms, and it never mixes two histories.
   */
  async restoreFromDevice(): Promise<RestoreOutcome> {
    const { ledger, sheet, workbook } = this.current;
    if (ledger.snapshots.length === 0) return { status: "nothing-to-restore" };
    if (sheet !== "missing" && sheet !== "emptied") return { status: "not-needed" };
    const signed = await this.accessToken();
    if (!signed.ok) return { status: "sign-in-failed", reason: signed.reason };
    const deps: DirectDeps = { rest: this.deps.rest, newRevision: this.deps.newId };
    const result = await restoreDirect(deps, signed.token, ledger, sheet === "emptied" ? workbook : null);
    if (result.status !== "restored") {
      return { status: "failed", message: result.status === "not-empty" ? "The spreadsheet already holds statements, so nothing was written." : "The spreadsheet could not be restored. Nothing on this device was changed." };
    }
    this.keep(result.workbook, result.ledger);
    this.set({ mode: "online", ledger: result.ledger, workbook: result.workbook, syncedAt: this.deps.now(), sheet: "ok", trailingRows: 0 });
    // The device copy holds figures only, so a restored sheet has no stored bank statements; the health check says so.
    await refreshView(this.deps.rest, signed.token, result.workbook.id, result.ledger);
    return { status: "restored", workbook: result.workbook };
  }

  /**
   * Proves the saved ledger can be rebuilt: every month that has a stored bank
   * statement is replayed with today's rules and compared with the saved figures.
   * It reads only; it never changes the sheet or the saved copy.
   */
  async verifyHistory(): Promise<VerifyOutcome> {
    const { workbook } = this.current;
    if (workbook === null) return { status: "failed", message: "There is no Google Sheet to check yet." };
    const signed = await this.accessToken();
    if (!signed.ok) return { status: "sign-in-failed", reason: signed.reason };
    const all = await readAllDirect(this.deps.rest, signed.token, workbook.id);
    switch (all.status) {
      case "damaged":
        return { status: "needs-attention", message: `${all.message} Nothing was changed.` };
      case "unavailable":
        return all.failure === "missing" || all.failure === "not-a-ledger"
          ? { status: "needs-attention", message: NEEDS[all.failure === "missing" ? "missing" : "not-a-ledger"] }
          : { status: "failed", message: "Google could not be reached, so nothing was checked." };
      case "ok":
        return { status: "checked", report: verifyRebuild(all.state, all.sources, this.deps.interpret) };
    }
  }

  /** Wipes everything this device holds and signs out. The spreadsheet in Google is not touched. */
  forget(): void {
    this.deps.cache.clear();
    if (this.token !== null) this.deps.revoke?.(this.token.accessToken);
    this.token = null;
    this.set({ mode: "signed-out", ledger: EMPTY_LEDGER, workbook: null, syncedAt: null, sheet: "unchecked", trailingRows: 0 });
  }

  /** The save port the import screens use. It saves to the spreadsheet and reads the result back. */
  readonly save: RemoteSave = {
    newCommandId: () => this.deps.newId(),

    record: async (request: RecordRequest, commandId: string, expectedRevision: string): Promise<RecordResult> => {
      const { workbook } = this.current;
      if (workbook === null) return { status: "not-saved", message: "Continue with Google first, so there is somewhere to save to." };
      const signed = await this.accessToken();
      if (!signed.ok) return { status: "not-saved", message: SIGN_IN_TEXT[signed.reason] };
      const deps: DirectDeps = { rest: this.deps.rest, newRevision: this.deps.newId };
      const commit = await commitDirect(deps, signed.token, workbook.id, {
        commandId,
        expectedRevision,
        statement: request.statement,
        date: request.date,
        commands: request.commands,
        ...(request.source === undefined ? {} : { source: request.source }),
      });
      switch (commit.status) {
        case "committed":
        case "already-committed":
          return this.readBack(workbook, signed.token, request);
        case "stale":
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

    check: async (commandId: string): Promise<CheckResult> => {
      const { workbook } = this.current;
      if (workbook === null) return { status: "cannot-tell", message: "There is no spreadsheet to check." };
      const signed = await this.accessToken();
      if (!signed.ok) return { status: "cannot-tell", message: SIGN_IN_TEXT[signed.reason].replace(", so nothing was saved", "") };
      const outcome = await outcomeDirect(this.deps.rest, signed.token, workbook.id, commandId);
      switch (outcome.status) {
        case "not-found":
          return { status: "not-recorded" };
        case "damaged":
          return { status: "cannot-tell", message: `${outcome.message} Do not record anything until it is restored.` };
        case "unreachable":
          return { status: "cannot-tell", message: "The spreadsheet could not be checked. Try again shortly." };
        case "committed": {
          const back = await this.readBack(workbook, signed.token);
          return back.status === "recorded" ? back : { status: "saved-not-reloaded" };
        }
      }
    },
  };

  private async readBack(workbook: Workbook, accessToken: string, saved?: RecordRequest): Promise<RecordResult> {
    const read = await readDirect(this.deps.rest, accessToken, workbook.id);
    if (read.status !== "ok") return { status: "saved-not-reloaded" };
    this.keep(workbook, read.state);
    this.set({ mode: "online", ledger: read.state, workbook, syncedAt: this.deps.now(), sheet: "ok", trailingRows: read.ignoredTrailingRows });
    // The readable tab is a convenience; its failure never affects the saved records.
    this.later(refreshView(this.deps.rest, accessToken, workbook.id, read.state));
    if (saved?.source !== undefined) this.later(mirrorStatement(this.deps.rest, accessToken, workbook.id, saved.date, saved.source.sheet));
    return { status: "recorded", ledger: read.state };
  }
}

const SIGN_IN_TEXT: Readonly<Record<Extract<SignInResult, { ok: false }>["reason"], string>> = {
  denied: "Permission was declined, so nothing was saved.",
  closed: "The sign-in window was closed, so nothing was saved.",
  unavailable: "Google sign-in could not start, so nothing was saved.",
};

const NOT_SENT_TEXT = {
  unauthorised: "Google rejected the sign-in, so nothing was saved. Try again.",
  forbidden: "Google refused the request, so nothing was saved. Check that you allowed FolioDash to create and manage its own spreadsheet.",
  "not-found": "The spreadsheet could not be opened, so nothing was saved. Open Your data to check it.",
} as const;
