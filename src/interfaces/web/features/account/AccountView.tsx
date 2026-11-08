import type { ConnectOutcome, RestoreOutcome, SessionState, TidyOutcome, VerifyOutcome } from "../../../../applications/SessionModel";
import type { JSX } from "preact";
import { useRef, useState } from "preact/hooks";
import { describeAge } from "./timeAgo";
import { Icon } from "../../shared/ui/icons";
import { PageNav } from "../../shared/ui/PageNav";
import { type Message, SHEET_TEXT, describeConnect, describeRestore, describeTidy, describeVerify } from "./accountText";

export interface AccountActions {
  connect(): Promise<ConnectOutcome>;
  refresh(): Promise<ConnectOutcome>;
  /** Renews Google access with the remembered account, or lets the person choose another. */
  reconnect(options?: { readonly differentAccount?: boolean }): Promise<ConnectOutcome>;
  restore(): Promise<RestoreOutcome>;
  verify(): Promise<VerifyOutcome>;
  tidy(): Promise<TidyOutcome>;
  forget(): void;
  /** Remembers a client ID on this device. Returns false if it is not shaped like one. */
  setClientId(text: string): boolean;
}

function Result(props: { readonly message: Message | null }): JSX.Element | null {
  if (props.message === null) return null;
  return (
    <div class={props.message.good ? "review-adjustments notice-success" : "review-problem"} role={props.message.good ? "status" : "alert"}>
      <h3>{props.message.title}</h3>
      <p>{props.message.body}</p>
    </div>
  );
}

/** The one place to see and control where the person's data lives. Plain words, one clear next step. */
export function AccountView(props: {
  readonly state: SessionState;
  readonly now: number;
  readonly clientConfigured: boolean;
  readonly actions: AccountActions;
  /** Which build of the app this page is running, so a stale page is never mistaken for the new one. */
  readonly build: string;
  readonly expenseCommands?: number;
}): JSX.Element {
  const { state, actions } = props;
  const [pending, setPending] = useState<"connect" | "sync" | "restore" | "verify" | "tidy" | null>(null);
  const busy = pending !== null;
  const forgetButton = useRef<HTMLButtonElement>(null);
  const keepButton = useRef<HTMLButtonElement>(null);
  const connectionHeading = useRef<HTMLHeadingElement>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [checkMessage, setCheckMessage] = useState<Message | null>(null);
  const [tidyMessage, setTidyMessage] = useState<Message | null>(null);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [confirmForget, setConfirmForget] = useState(false);
  const [clientText, setClientText] = useState("");
  const [clientError, setClientError] = useState(false);

  async function run(action: () => Promise<ConnectOutcome>, kind: "connect" | "sync"): Promise<void> {
    if (busy) return;
    setPending(kind);
    setMessage(null);
    try {
      const outcome = await action();
      setMessage(outcome.status === "superseded" ? null : describeConnect(outcome));
    } catch {
      setMessage({ good: false, title: "Something went wrong", body: "Nothing was changed. Try again." });
    } finally {
      setPending(null);
    }
  }

  async function restore(): Promise<void> {
    if (busy) return;
    setPending("restore");
    setMessage(null);
    try {
      setMessage(describeRestore(await actions.restore()));
      setConfirmRestore(false);
    } catch {
      setMessage({ good: false, title: "Something went wrong", body: "Nothing on this device was changed. Try again." });
    } finally {
      setPending(null);
    }
  }

  async function verify(): Promise<void> {
    if (busy) return;
    setPending("verify");
    setCheckMessage(null);
    try {
      setCheckMessage(describeVerify(await actions.verify()));
    } catch {
      setCheckMessage({ good: false, title: "Something went wrong", body: "Nothing was changed. Try again." });
    } finally {
      setPending(null);
    }
  }

  async function tidy(): Promise<void> {
    if (busy) return;
    setPending("tidy");
    setTidyMessage(null);
    try {
      setTidyMessage(describeTidy(await actions.tidy()));
    } catch {
      setTidyMessage({ good: false, title: "Something went wrong", body: "Nothing was changed. Try again." });
    } finally {
      setPending(null);
    }
  }

  const signedOut = state.mode === "signed-out";
  const statements = state.ledger.snapshots.length;
  const canRestore = (state.sheet === "missing" || state.sheet === "emptied") && (statements > 0 || (props.expenseCommands ?? 0) > 0);

  return (
    <section class="account screen" aria-labelledby="account-connection-heading">
      <p class="account-lead">Check synchronization, verify your saved history and manage the copy on this device.</p>
      <div class="status" data-busy={busy} aria-live="polite">{pending !== null && <p>{pending === "connect" ? "Waiting for Google…" : pending === "sync" ? "Checking your latest saved history…" : pending === "restore" ? "Restoring your spreadsheet and checking the result…" : pending === "verify" ? "Reading and checking your saved statements…" : "Tidying the generated views in your spreadsheet…"}</p>}</div>

      <div class="card account-summary">
        <h2 id="account-connection-heading" ref={connectionHeading} class="card-title" tabIndex={-1}>Your connection</h2>
        {signedOut ? (
          <>
            <p class="card-subtitle">Not set up yet.</p>
            <p>
              Continue with Google and FolioDash creates one private spreadsheet in your own Google Drive for your portfolio. The spreadsheet lives in your Google account, and you choose whether to share it.
            </p>
            <button type="button" class="primary" disabled={busy || !props.clientConfigured} onClick={() => void run(() => actions.connect(), "connect")}>
              {pending === "connect" ? "Waiting for Google…" : "Continue with Google"}
            </button>
            {!props.clientConfigured && <p class="hint">This site has no Google client set up yet. Add it under Advanced below.</p>}
          </>
        ) : (
          <>
            <p class="card-subtitle">
              {state.connection === "checking" ? "Checking Google for changes from your other devices…" : state.connection === "renewing" ? "Renewing Google access with the account FolioDash remembers…" : state.connection === "waiting" ? "Showing your saved copy. Your next tap renews Google access quietly, then checks for changes." : state.connection === "reconnect" ? "Google access could not be renewed quietly. Reconnect to check your latest history." : state.connection === "offline" ? "Google could not be reached. Showing your saved copy; automatic checks resume when available." : state.mode === "online" ? "Your last Google check completed. Changes are checked automatically while the app is open." : "Showing the copy saved on this device. Sync to check it against your Google Sheet."}
            </p>
            <dl class="facts stacked">
              <div>
                <dt>Your Google Sheet</dt>
                <dd>
                  {state.workbook === null ? "-" : (
                    <a href={state.workbook.url} target="_blank" rel="noreferrer">
                      Open in Google Sheets
                    </a>
                  )}
                </dd>
              </div>
              <div>
                <dt>Statements saved</dt>
                <dd>{statements}</dd>
              </div>
              <div>
                <dt>Last checked against Google</dt>
                <dd>{state.syncedAt === null ? "-" : describeAge(props.now, state.syncedAt)}</dd>
              </div>
              <div>
                <dt>Sheet health</dt>
                <dd>{SHEET_TEXT[state.sheet]}</dd>
              </div>
              {state.trailingRows > 0 && (
                <div>
                  <dt>Unfinished rows ignored</dt>
                  <dd>{state.trailingRows}</dd>
                </div>
              )}
            </dl>
            <button type="button" class="primary" disabled={busy} onClick={() => void run(() => state.connection === "reconnect" ? actions.reconnect() : actions.refresh(), "sync")}>
              <Icon name="history" size={16} /> {pending === "sync" ? "Syncing…" : state.connection === "reconnect" ? "Reconnect with Google" : "Sync now"}
            </button>
          </>
        )}

        <Result message={message} />
        {message !== null && !message.good && state.connection !== "reconnect" && <button type="button" disabled={busy || !props.clientConfigured} onClick={() => void run(() => actions.reconnect(), "connect")}>Reconnect with Google</button>}
        {!signedOut && <button type="button" class="link-button" disabled={busy || !props.clientConfigured} onClick={() => void run(() => actions.reconnect({ differentAccount: true }), "connect")}>Use a different Google account</button>}
      </div>

      {!signedOut && state.workbook !== null && <PageNav items={[{ id: "account-health-heading", label: "Check history" }, { id: "account-maintenance-heading", label: "Tidy sheet" }, { id: "account-device-heading", label: "This device" }]} />}

      {!signedOut && state.workbook !== null && (
        <section class="account-section account-health" aria-labelledby="account-health-heading">
          <h2 id="account-health-heading" class="card-title" tabIndex={-1}>Verify your history</h2>
          <p class="card-subtitle">Every month keeps its exact bank statement. This replays each one and compares it with your saved figures.</p>
          <p>It only reads. Nothing in your Google Sheet or on this device is changed.</p>
          <button type="button" disabled={busy} onClick={() => void verify()}>
            {pending === "verify" ? "Checking your history…" : "Check my history"}
          </button>
          <Result message={checkMessage} />
        </section>
      )}

      {!signedOut && state.workbook !== null && (
        <section class="account-section account-maintenance" aria-labelledby="account-maintenance-heading">
          <h2 id="account-maintenance-heading" class="card-title" tabIndex={-1}>Keep your sheet tidy</h2>
          <p class="card-subtitle">Rewrites the summary and every month's tab so they look alike and stay lean.</p>
          <p>Dates, amounts and prices are shown the same way in every month, with one empty row and column around the data and nothing beyond it. Your saved records are not touched.</p>
          <button type="button" disabled={busy} onClick={() => void tidy()}>
            {pending === "tidy" ? "Tidying your sheet…" : "Tidy my sheet"}
          </button>
          <Result message={tidyMessage} />
        </section>
      )}

      {canRestore && (
        <div class="card">
          <h3 class="card-title">Restore your Google Sheet</h3>
          <p class="card-subtitle">
            {state.sheet === "missing" ? "Your sheet cannot be opened." : "Your sheet is empty."} This device still has {statements}{" "}
            {statements === 1 ? "statement" : "statements"}.
          </p>
          <p>
            Restoring writes the copy on this device {state.sheet === "missing" ? "into a new Google Sheet" : "back into your empty Google Sheet"}, then reads it back and checks it. The portfolio copy holds figures but not original bank statements, so those statements need to be imported again. {props.expenseCommands ? "The saved expense correction history on this device is also recovered into a replacement workbook; existing expense records are preserved." : "This device has no saved expense correction history to restore. Downloaded expense backups are restored separately below."}
          </p>
          <label class="check">
            <input
              type="checkbox"
              disabled={busy}
              checked={confirmRestore}
              onChange={(event) => {
                setConfirmRestore(event.currentTarget.checked);
              }}
            />{" "}
            Yes, restore my Google Sheet from this device
          </label>
          <button type="button" class="primary" disabled={busy || !confirmRestore} onClick={() => void restore()}>
            {pending === "restore" ? "Restoring and checking…" : "Restore from this device"}
          </button>
        </div>
      )}

      <section class="account-section" aria-labelledby="account-device-heading">
        <h2 id="account-device-heading" class="card-title" tabIndex={-1}>How your data is kept</h2>
        <ul class="plain-list">
          <li>
            <strong>Your Google Sheet is the record.</strong> It lives in your Google Drive and you can open it any time. FolioDash can only see the one
            spreadsheet it created.
          </li>
          <li>
            <strong>This device keeps a copy</strong> so FolioDash opens instantly. It can always be rebuilt from your Google Sheet.
          </li>
          <li>
            <strong>Anyone who can use this unlocked device and browser</strong> could see that copy and open FolioDash as you. Its Google access lasts up to an hour and is renewed on a tap while your Google account stays signed in here. If this device is shared, use Forget this device when you
            finish.
          </li>
        </ul>
        {!signedOut && <p class="hint">FolioDash stays connected on this device until you choose Forget this device. Google's access lasts an hour, so it is renewed quietly on your next tap, using the account it remembers; if Google still has your session, nothing needs choosing. Changes are checked when you return, reconnect to the internet and every minute while visible. Finish or discard an edited draft before automatic checks resume. <a href="./privacy/" target="_blank" rel="noopener">Privacy policy</a></p>}
        {!signedOut && (
          <>
            {confirmForget ? (
              <div class="review-problem" role="alert">
                <h3>Forget this device?</h3>
                <p>This removes the saved copy, Google access and the remembered account from this device and signs you out. Your Google Sheet is not touched, and you can continue with Google again any time.</p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    actions.forget();
                    setConfirmForget(false);
                    setMessage({ good: true, title: "This device was forgotten", body: "The saved copy on this device was removed. Your Google Sheet is unchanged." });
                    requestAnimationFrame(() => connectionHeading.current?.focus());
                  }}
                >
                  Yes, forget this device
                </button>{" "}
                <button
                  type="button"
                  ref={keepButton}
                  disabled={busy}
                  onClick={() => {
                    setConfirmForget(false);
                    requestAnimationFrame(() => forgetButton.current?.focus());
                  }}
                >
                  Keep it
                </button>
              </div>
            ) : (
              <button
                type="button"
                ref={forgetButton}
                disabled={busy}
                onClick={() => {
                  setConfirmForget(true);
                  requestAnimationFrame(() => keepButton.current?.focus());
                }}
              >
                Forget this device
              </button>
            )}
          </>
        )}
      </section>

      {!props.clientConfigured && (
        <details class="account-section" open>
          <summary>Advanced: Google client ID</summary>
          <p class="hint">
            A hosted FolioDash already has this. It is the OAuth client ID of the Google Cloud project that signs people in. It is public by design and is not
            a secret.
          </p>
          <div class="field">
            <label for="client-id">Google OAuth client ID</label>
            <input
              id="client-id"
              type="text"
              autoComplete="off"
              spellcheck={false}
              disabled={busy}
              value={clientText}
              aria-invalid={clientError ? "true" : undefined}
              aria-describedby={clientError ? "client-id-error" : undefined}
              onInput={(event) => {
                setClientText(event.currentTarget.value);
                setClientError(false);
              }}
            />
            {clientError && <p id="client-id-error" class="field-error" role="alert">That does not look like a client ID. It ends with .apps.googleusercontent.com.</p>}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const accepted = actions.setClientId(clientText);
              setClientError(!accepted);
              if (!accepted) document.getElementById("client-id")?.focus();
            }}
          >
            Save client ID
          </button>
        </details>
      )}
      <p class="footnote build-stamp">FolioDash build: {props.build}</p>
    </section>
  );
}
