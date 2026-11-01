import type { JSX } from "preact";
import { useState } from "preact/hooks";
import { describeAge } from "../../app/timeAgo";
import type { ConnectOutcome, RestoreOutcome, SessionState, VerifyOutcome } from "../../app/session";
import { Icon } from "../../shared/ui/icons";
import { type Message, SHEET_TEXT, describeConnect, describeRestore, describeVerify } from "./accountText";

export interface AccountActions {
  connect(): Promise<ConnectOutcome>;
  refresh(): Promise<ConnectOutcome>;
  restore(): Promise<RestoreOutcome>;
  verify(): Promise<VerifyOutcome>;
  forget(): void;
  /** Remembers a client ID on this device. Returns false if it is not shaped like one. */
  setClientId(text: string): boolean;
}

function Result(props: { readonly message: Message | null }): JSX.Element | null {
  if (props.message === null) return null;
  return (
    <div class={props.message.good ? "review-adjustments" : "review-problem"} role={props.message.good ? "status" : "alert"}>
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
}): JSX.Element {
  const { state, actions } = props;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [checkMessage, setCheckMessage] = useState<Message | null>(null);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [confirmForget, setConfirmForget] = useState(false);
  const [clientText, setClientText] = useState("");
  const [clientError, setClientError] = useState(false);

  async function run(action: () => Promise<ConnectOutcome>): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      setMessage(describeConnect(await action()));
    } catch {
      setMessage({ good: false, title: "Something went wrong", body: "Nothing was changed. Try again." });
    } finally {
      setBusy(false);
    }
  }

  async function restore(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      setMessage(describeRestore(await actions.restore()));
      setConfirmRestore(false);
    } catch {
      setMessage({ good: false, title: "Something went wrong", body: "Nothing on this device was changed. Try again." });
    } finally {
      setBusy(false);
    }
  }

  async function verify(): Promise<void> {
    setBusy(true);
    setCheckMessage(null);
    try {
      setCheckMessage(describeVerify(await actions.verify()));
    } catch {
      setCheckMessage({ good: false, title: "Something went wrong", body: "Nothing was changed. Try again." });
    } finally {
      setBusy(false);
    }
  }

  const signedOut = state.mode === "signed-out";
  const statements = state.ledger.snapshots.length;
  const canRestore = (state.sheet === "missing" || state.sheet === "emptied") && statements > 0;

  return (
    <section class="account screen" aria-labelledby="account-heading">
      <h2 id="account-heading" class="visually-hidden">Your data</h2>

      <div class="card">
        <h3 class="card-title">Where your data lives</h3>
        {signedOut ? (
          <>
            <p class="card-subtitle">Not set up yet.</p>
            <p>
              Continue with Google and FolioDash creates one private spreadsheet in your own Google Drive for your portfolio. Nobody else, including
              the people who made FolioDash, can see it.
            </p>
            <button type="button" class="primary" disabled={busy || !props.clientConfigured} onClick={() => void run(() => actions.connect())}>
              Continue with Google
            </button>
            {!props.clientConfigured && <p class="hint">This site has no Google client set up yet. Add it under Advanced below.</p>}
          </>
        ) : (
          <>
            <p class="card-subtitle">
              {state.mode === "online" ? "In step with your Google Sheet." : "Showing the copy saved on this device. Sync to check it against your Google Sheet."}
            </p>
            <dl class="facts stacked">
              <div>
                <dt>Your Google Sheet</dt>
                <dd>
                  {state.workbook === null ? "–" : (
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
                <dd>{state.syncedAt === null ? "–" : describeAge(props.now, state.syncedAt)}</dd>
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
            <button type="button" class="primary" disabled={busy} onClick={() => void run(() => actions.refresh())}>
              <Icon name="history" size={16} /> Sync now
            </button>
          </>
        )}
        <Result message={message} />
      </div>

      {!signedOut && state.workbook !== null && (
        <div class="card">
          <h3 class="card-title">Check that your history can be rebuilt</h3>
          <p class="card-subtitle">Every month keeps its exact bank statement. This replays each one and compares it with your saved figures.</p>
          <p>It only reads. Nothing in your Google Sheet or on this device is changed.</p>
          <button type="button" disabled={busy} onClick={() => void verify()}>
            Check my history
          </button>
          <Result message={checkMessage} />
        </div>
      )}

      {canRestore && (
        <div class="card">
          <h3 class="card-title">Restore your Google Sheet</h3>
          <p class="card-subtitle">
            {state.sheet === "missing" ? "Your sheet cannot be opened." : "Your sheet is empty."} This device still has {statements}{" "}
            {statements === 1 ? "statement" : "statements"}.
          </p>
          <p>
            Restoring writes the copy on this device {state.sheet === "missing" ? "into a new Google Sheet" : "back into your empty Google Sheet"}, then reads it back and checks it. The copy holds your figures but not the original bank statements, so a restored sheet cannot be rebuilt from statements until you import them again.
          </p>
          <label class="check">
            <input
              type="checkbox"
              checked={confirmRestore}
              onChange={(event) => {
                setConfirmRestore(event.currentTarget.checked);
              }}
            />{" "}
            Yes, restore my Google Sheet from this device
          </label>
          <button type="button" class="primary" disabled={busy || !confirmRestore} onClick={() => void restore()}>
            Restore from this device
          </button>
        </div>
      )}

      <div class="card">
        <h3 class="card-title">How your data is kept</h3>
        <ul class="plain-list">
          <li>
            <strong>Your Google Sheet is the record.</strong> It lives in your Google Drive and you can open it any time. FolioDash can only see the one
            spreadsheet it created.
          </li>
          <li>
            <strong>This device keeps a copy</strong> so FolioDash opens instantly. It can always be rebuilt from your Google Sheet.
          </li>
          <li>
            <strong>Anyone who can use this unlocked device and browser</strong> could see that copy. If this device is shared, use Forget this device when you
            finish.
          </li>
        </ul>
        {!signedOut && (
          <>
            {confirmForget ? (
              <div class="review-problem" role="alert">
                <h3>Forget this device?</h3>
                <p>This removes the saved copy from this device and signs you out. Your Google Sheet is not touched, and you can continue with Google again any time.</p>
                <button
                  type="button"
                  onClick={() => {
                    actions.forget();
                    setConfirmForget(false);
                    setMessage(null);
                  }}
                >
                  Yes, forget this device
                </button>{" "}
                <button
                  type="button"
                  onClick={() => {
                    setConfirmForget(false);
                  }}
                >
                  Keep it
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setConfirmForget(true);
                }}
              >
                Forget this device
              </button>
            )}
          </>
        )}
      </div>

      {!props.clientConfigured && (
        <details class="card" open>
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
              value={clientText}
              aria-invalid={clientError ? "true" : undefined}
              onInput={(event) => {
                setClientText(event.currentTarget.value);
                setClientError(false);
              }}
            />
            {clientError && <p class="field-error" role="alert">That does not look like a client ID. It ends with .apps.googleusercontent.com.</p>}
          </div>
          <button
            type="button"
            onClick={() => {
              setClientError(!actions.setClientId(clientText));
            }}
          >
            Save client ID
          </button>
        </details>
      )}
    </section>
  );
}
