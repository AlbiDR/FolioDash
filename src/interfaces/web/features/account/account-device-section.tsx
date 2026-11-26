import type { JSX } from "preact";
import { Icon } from "../../shared/ui/icons";
import { Presence } from "../../shared/ui/presence";
import type { AccountShared } from "./use-account-controller";

export function AccountDeviceSection(p: { readonly shared: AccountShared }): JSX.Element {
  const { x } = p.shared;
  const {
    actions,
    busy,
    forgetButton,
    keepButton,
    connectionHeading,
    setMessage,
    confirmForget,
    setConfirmForget,
    signedOut,
  } = x;
  return (
    <section class="account-section" aria-labelledby="account-device-heading">
      <h2 id="account-device-heading" class="card-title" tabIndex={-1}>
        Where your data lives
      </h2>
      <a class="row-link plain" href="#checkpoints">
        <span>Checkpoints: value-only observations between statements</span>
        <Icon name="chevron" size={18} />
      </a>
      <ul class="plain-list">
        <li>
          <strong>Your Google Sheet is the record.</strong> It lives in your Google Drive and you can open it any time.
          FolioDash can only see the one spreadsheet it created.
        </li>
        <li>
          <strong>This device keeps a copy</strong> so FolioDash opens instantly. It can always be rebuilt from your
          Google Sheet.
        </li>
        <li>
          <strong>Anyone who can use this unlocked device and browser</strong> could see that copy and open FolioDash as
          you. Its Google access lasts up to an hour and is renewed on a tap while your Google account stays signed in
          here. If this device is shared, use Forget this device when you finish.
        </li>
      </ul>
      {!signedOut && (
        <>
          <Presence show={confirmForget}>
            {confirmForget && (
              <div class="review-problem" role="alert">
                <h3>Forget this device?</h3>
                <p>
                  This removes the saved copy, Google access and the remembered account from this device and signs you
                  out. Your Google Sheet is not touched, and you can continue with Google again any time.
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    actions.forget();
                    setConfirmForget(false);
                    setMessage({
                      good: true,
                      title: "This device was forgotten",
                      body: "The saved copy on this device was removed. Your Google Sheet is unchanged.",
                    });
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
            )}
          </Presence>
          {!confirmForget && (
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
      {!signedOut && (
        <div class="more">
          <details>
            <summary>How staying connected works</summary>
            <p class="hint">
              FolioDash stays connected on this device until you choose Forget this device. Google's access lasts an
              hour, so it is renewed quietly on your next tap, using the account it remembers; if Google still has your
              session, nothing needs choosing. Changes are checked when you return, reconnect to the internet and every
              minute while visible. Finish or discard an edited draft before automatic checks resume.{" "}
              <a href="./privacy/" target="_blank" rel="noopener">
                Privacy policy
              </a>
            </p>
          </details>
        </div>
      )}
    </section>
  );
}
