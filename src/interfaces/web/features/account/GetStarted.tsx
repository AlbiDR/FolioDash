import type { ConnectOutcome } from "../../../../applications/SessionModel";
import type { JSX } from "preact";
import { useState } from "preact/hooks";
import { describeConnect } from "./accountText";

/**
 * The first thing a new person sees above the sample: what it is and the one thing to do next.
 * The two steps behind the button are one tap further down. Everything else is automatic.
 */
export function GetStarted(props: { readonly clientConfigured: boolean; readonly connect: () => Promise<ConnectOutcome>; readonly onReady: () => void }): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function go(): Promise<void> {
    setBusy(true);
    setProblem(null);
    try {
      const outcome = await props.connect();
      if (outcome.status === "connected") props.onReady();
      else setProblem(`${describeConnect(outcome).title}. ${describeConnect(outcome).body}`);
    } catch {
      setProblem("Something went wrong. Nothing was changed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section class="card get-started" aria-labelledby="get-started-title">
      <h2 id="get-started-title" class="card-title">You are exploring a sample</h2>
      <p class="card-subtitle">The figures are invented. Continue with Google to see your own statements here.</p>
      <button type="button" class="primary" data-working={busy} disabled={busy || !props.clientConfigured} onClick={() => void go()}>
        {busy ? "Waiting for Google…" : "Continue with Google"}
      </button>
      <div class="status" data-busy={busy} aria-live="polite">{busy && <p>Complete the Google sign-in to continue. Your portfolio opens after the connection is checked.</p>}</div>
      {!props.clientConfigured && <p class="hint">This site has no Google client set up yet. Add it on the Your data screen.</p>}
      {problem !== null && <p class="field-error" role="alert">{problem}</p>}
      <details class="setup-details">
        <summary>How setup works</summary>
        <ol class="steps">
          <li>
            <strong>Continue with Google.</strong> FolioDash creates one private spreadsheet in your own Google Drive. Its Google permission covers files you use with FolioDash.
          </li>
          <li>
            <strong>Import your bank statements.</strong> Choose one or more bank Excel exports, or a workbook with a statement on each sheet. Check the dates and cash movements, then confirm to create your portfolio.
          </li>
        </ol>
        <p class="footnote">Your own data stays in your Google Sheet. <a href="./privacy/" target="_blank" rel="noopener">Privacy policy</a></p>
      </details>
    </section>
  );
}
