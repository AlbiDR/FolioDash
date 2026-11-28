import type { JSX } from "preact";
import { describeAge } from "./time-ago";
import { Icon } from "../../shared/ui/icons";
import { SHEET_TEXT } from "./account-text";
import { Result } from "./account-result";
import type { AccountShared } from "./use-account-controller";

export function AccountConnectionCard(p: { readonly shared: AccountShared }): JSX.Element {
  const { props, x } = p.shared;
  const { state, actions, pending, busy, connectionHeading, message, run, signedOut, statements } = x;
  return (
    <div class="card account-summary">
      <h2 id="account-connection-heading" ref={connectionHeading} class="card-title" tabIndex={-1}>
        Your connection
      </h2>
      {signedOut ? (
        <>
          <p class="card-subtitle account-status" data-tone="idle">
            Not set up yet.
          </p>
          <p>
            Continue with Google and FolioDash creates one private spreadsheet in your own Google Drive for your
            portfolio. The spreadsheet lives in your Google account, and you choose whether to share it.
          </p>
          {!props.clientConfigured && (
            <p class="hint">This site has no Google client set up yet. Add it under Advanced below.</p>
          )}
          <button
            type="button"
            class="primary"
            disabled={busy || !props.clientConfigured}
            onClick={() => void run(() => actions.connect(), "connect")}
          >
            {pending === "connect" ? "Waiting for Google…" : "Continue with Google"}
          </button>
        </>
      ) : (
        <>
          <p
            class="card-subtitle account-status"
            data-tone={
              state.connection === "reconnect" || state.connection === "offline"
                ? "attention"
                : state.connection !== "renewing" && state.connection !== "waiting" && state.mode === "online"
                  ? "ok"
                  : "idle"
            }
          >
            {state.connection === "renewing"
              ? "Renewing Google access with the account FolioDash remembers…"
              : state.connection === "waiting"
                ? "Showing your saved copy. Your next tap renews Google access quietly, then checks for changes."
                : state.connection === "reconnect"
                  ? "Google access could not be renewed quietly. Reconnect to check your latest history."
                  : state.connection === "offline"
                    ? "Google could not be reached. Showing your saved copy; automatic checks resume when available."
                    : state.mode === "online"
                      ? "Your last Google check completed. Changes are checked automatically while the app is open."
                      : "Showing your saved copy while FolioDash checks Google for changes."}
          </p>
          <dl class="facts stacked">
            <div>
              <dt>Your Google Sheet</dt>
              <dd>
                {state.workbook === null ? (
                  "-"
                ) : (
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
          <button
            type="button"
            class="primary"
            disabled={busy}
            onClick={() =>
              void run(() => (state.connection === "reconnect" ? actions.reconnect() : actions.refresh()), "sync")
            }
          >
            <Icon name="history" size={16} />{" "}
            {pending === "sync" ? "Syncing…" : state.connection === "reconnect" ? "Reconnect with Google" : "Sync now"}
          </button>
        </>
      )}

      <Result message={message} />
      {message !== null && !message.good && state.connection !== "reconnect" && (
        <button
          type="button"
          disabled={busy || !props.clientConfigured}
          onClick={() => void run(() => actions.reconnect(), "connect")}
        >
          Reconnect with Google
        </button>
      )}
      {!signedOut && (
        <button
          type="button"
          class="link-button"
          disabled={busy || !props.clientConfigured}
          onClick={() => void run(() => actions.reconnect({ differentAccount: true }), "connect")}
        >
          Use a different Google account
        </button>
      )}
    </div>
  );
}
