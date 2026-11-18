import type {
  ConnectOutcome,
  SessionState,
  SignInOptions,
  SignInResult,
  Workbook,
} from "../../../../../applications/session/session-model";
import {
  FRESH_RENEWAL,
  type RenewalHistory,
  type RenewalTrigger,
  afterAttempt,
  afterReconnectingToNetwork,
  mayRenewAutomatically,
  renewalNeedsThePerson,
  signInOptionsFor,
} from "../../../../../applications/session/renewal-policy";
import { fetchAccountHint } from "../../../../../adapters/google/account-hint";
import type { LedgerState } from "../../../../../core/portfolio/ledger";
import { DRIVE_FILE_SCOPE } from "./session-policy";
import { SessionCore } from "./session-core";

const TOKEN_MAXIMUM_SECONDS = 3600;
const TOKEN_MARGIN_SECONDS = 120;
/** With less than this left, the next click renews access quietly, before it can fail. */
const RENEW_AHEAD_MILLISECONDS = 10 * 60_000;
/** The Google access the session holds: asking for it, renewing it, remembering the account and keeping the device copy. */
export abstract class SessionAccess extends SessionCore {
  protected token: { readonly accessToken: string; readonly validUntil: number } | null = null;
  protected lastAutoCheck = -Infinity;
  protected signingIn: Promise<Awaited<ReturnType<SessionAccess["accessToken"]>>> | null = null;
  protected connecting: Promise<ConnectOutcome> | null = null;
  protected chooserOnNextSignIn = false;
  protected renewal: RenewalHistory = FRESH_RENEWAL;
  protected hint: string | null = null;

  /** A bounded read using existing access. Implemented where the ledger is read. */
  abstract refreshIfNeeded(): Promise<void>;

  protected unauthorized(authorization: string | undefined): void {
    if (authorization === `Bearer ${this.token?.accessToken ?? ""}`) {
      this.dropToken();
      this.set({ ...this.current, connection: this.unrenewedConnection() });
    }
  }

  /** The token, only if it is still valid. Used for background work, which never asks the person to sign in. */
  protected validToken(): string | null {
    return this.token !== null && this.deps.now() < this.token.validUntil ? this.token.accessToken : null;
  }

  /**
   * Access with at least `minimumMilliseconds` left. A token that is valid but too short for
   * the action is kept for reads and replaced first for a save, so Google's expiry cannot fall
   * in the middle of one. If that replacement fails the save is refused, never started.
   */
  protected async accessToken(
    minimumMilliseconds = 0,
  ): Promise<
    | { readonly ok: true; readonly token: string }
    | { readonly ok: false; readonly reason: Extract<SignInResult, { ok: false }>["reason"] }
  > {
    const now = this.deps.now();
    if (this.token !== null && now + minimumMilliseconds < this.token.validUntil)
      return { ok: true, token: this.token.accessToken };
    if (this.token !== null && now >= this.token.validUntil) this.dropToken();
    if (this.signingIn !== null) return this.signingIn;
    const work = this.requestToken("requested");
    this.signingIn = work;
    try {
      return await work;
    } finally {
      if (this.signingIn === work) this.signingIn = null;
    }
  }

  /** Forgets the access this window holds and the stored copy of it, unless another window has stored a newer one. */
  protected dropToken(): void {
    if (this.token !== null) this.deps.googleSession?.discard(this.token.accessToken);
    this.token = null;
  }

  /**
   * Starts a Google request in the current call stack, so a person's click still counts as the
   * gesture Google's window requires. Quiet attempts name the remembered account; once one has
   * failed, a requested one lets the person choose.
   */
  protected async requestToken(trigger: RenewalTrigger): ReturnType<SessionAccess["accessToken"]> {
    const generation = this.generation;
    const chooser = this.chooserOnNextSignIn;
    this.chooserOnNextSignIn = false;
    const options: SignInOptions = signInOptionsFor(trigger, this.renewal, this.hint, chooser);
    this.deps.coordination?.claim();
    let result: SignInResult;
    try {
      result = await this.deps.signIn(this.deps.clientId, DRIVE_FILE_SCOPE, options);
    } catch {
      result = { ok: false, reason: "unavailable" };
    } finally {
      this.deps.coordination?.release();
    }
    if (generation !== this.generation) return { ok: false, reason: "closed" };
    this.renewal = afterAttempt(this.renewal, result, this.deps.now());
    if (!result.ok) {
      // A token that is still valid stays usable for reads even when its replacement did not arrive.
      if (this.validToken() === null) {
        this.dropToken();
        if (this.current.workbook !== null && this.current.mode !== "signed-out")
          this.set({ ...this.current, connection: this.unrenewedConnection() });
      }
      return result;
    }
    // Reused only while Google says it is valid (with a margin), so a run of actions asks once.
    this.token =
      result.expiresInSeconds === undefined
        ? null
        : {
            accessToken: result.accessToken,
            validUntil:
              this.deps.now() +
              (Math.min(result.expiresInSeconds, TOKEN_MAXIMUM_SECONDS) - TOKEN_MARGIN_SECONDS) * 1000,
          };
    this.persistToken();
    if (this.hint === null || options.prompt === "select_account")
      this.later(this.learnHint(result.accessToken, generation));
    return { ok: true, token: result.accessToken };
  }

  protected persistToken(): void {
    const { workbook } = this.current;
    if (this.token !== null && workbook !== null && this.validToken() !== null)
      this.deps.googleSession?.save({
        ...this.token,
        clientId: this.deps.clientId,
        workbookId: workbook.id,
        scope: DRIVE_FILE_SCOPE,
      });
  }

  /** Remembers which account the access belongs to, so the next quiet renewal can name it. Best effort. */
  protected async learnHint(accessToken: string, generation: number): Promise<void> {
    if (this.deps.accountHint === undefined) return;
    const address = await fetchAccountHint(this.deps.rest, accessToken);
    if (address === null || generation !== this.generation) return;
    this.hint = address;
    this.deps.accountHint.save(this.deps.clientId, address);
  }

  /** What the connection looks like with no usable access: renewed on the next click, or waiting for the person. */
  protected unrenewedConnection(): "waiting" | "reconnect" {
    return renewalNeedsThePerson(this.renewal) ? "reconnect" : "waiting";
  }

  protected keep(workbook: Workbook, ledger: LedgerState): void {
    this.deps.cache.save({ workbook, ledger, syncedAt: this.deps.now() });
    if (this.token !== null && this.validToken() !== null)
      this.deps.googleSession?.save({
        ...this.token,
        clientId: this.deps.clientId,
        workbookId: workbook.id,
        scope: DRIVE_FILE_SCOPE,
      });
  }

  /** Whether the next click should renew Google access quietly: a remembered connection with little or no access left. */
  needsRenewal(): boolean {
    const { workbook, mode } = this.current;
    if (workbook === null || mode === "signed-out" || this.signingIn !== null || this.connecting !== null) return false;
    if (this.deps.coordination?.heldElsewhere() === true) return false;
    const remaining = this.token === null ? 0 : this.token.validUntil - this.deps.now();
    return remaining <= RENEW_AHEAD_MILLISECONDS && mayRenewAutomatically(this.renewal, this.deps.now());
  }

  /**
   * Renews Google access on a click the person made for another reason. Call it synchronously
   * from inside the click: Google's window opens only from a user gesture. It names the
   * remembered account, so when Google still has the person's session and grant, nothing needs
   * choosing. It never creates a workbook and never writes. Resolves to whether access was renewed.
   */
  async renewFromGesture(options: { readonly sync: boolean }): Promise<boolean> {
    if (!this.needsRenewal()) return false;
    const usable = this.validToken() !== null;
    // Access that is still valid keeps working while its replacement is on the way.
    if (!usable) this.set({ ...this.current, connection: "renewing" });
    const work = this.requestToken("automatic");
    this.signingIn = work;
    let result: Awaited<typeof work>;
    try {
      result = await work;
    } finally {
      if (this.signingIn === work) this.signingIn = null;
    }
    if (!result.ok) return false;
    this.lastAutoCheck = -Infinity;
    this.set(this.afterRenewal());
    if (options.sync) await this.refreshIfNeeded();
    return true;
  }

  protected afterRenewal(): SessionState {
    const { mode, ledger, workbook, syncedAt, sheet, trailingRows } = this.current;
    return {
      mode,
      ledger,
      workbook,
      syncedAt,
      sheet,
      trailingRows,
      ...(mode === "online" ? { connection: "connected" as const } : {}),
    };
  }

  /** The network is back: a failure that was only the network is forgiven. */
  resumeRenewal(): void {
    this.renewal = afterReconnectingToNetwork(this.renewal);
  }

  /** Takes up Google access another window of this browser stored, if it is newer than this window's. */
  adoptStoredAccess(): boolean {
    const { workbook } = this.current;
    if (workbook === null || this.deps.googleSession === undefined) return false;
    const stored = this.deps.googleSession.load(this.deps.clientId, workbook.id, this.deps.now());
    if (stored === null || (this.token !== null && this.token.validUntil >= stored.validUntil)) return false;
    this.token = { accessToken: stored.accessToken, validUntil: stored.validUntil };
    this.renewal = FRESH_RENEWAL;
    this.lastAutoCheck = -Infinity;
    if (
      this.current.connection === "waiting" ||
      this.current.connection === "reconnect" ||
      this.current.connection === "renewing"
    )
      this.set(this.afterRenewal());
    return true;
  }
}
