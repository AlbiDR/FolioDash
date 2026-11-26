import type { JSX } from "preact";
import type { AccountShared } from "./use-account-controller";
import { Presence } from "../../shared/ui/presence";

export function AccountClientId(p: { readonly shared: AccountShared }): JSX.Element {
  const { props, x } = p.shared;
  const { actions, busy, clientText, setClientText, clientError, setClientError } = x;
  return (
    <>
      {!props.clientConfigured && (
        <div class="more">
          <details open>
            <summary>Advanced: Google client ID</summary>
            <p class="hint">
              A hosted FolioDash already has this. It is the OAuth client ID of the Google Cloud project that signs
              people in. It is public by design and is not a secret.
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
              <Presence show={clientError}>
                {clientError && (
                  <p id="client-id-error" class="field-error" role="alert">
                    That does not look like a client ID. It ends with .apps.googleusercontent.com.
                  </p>
                )}
              </Presence>
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
        </div>
      )}
    </>
  );
}
