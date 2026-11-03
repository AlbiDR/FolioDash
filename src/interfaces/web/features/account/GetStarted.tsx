import type { JSX } from "preact";
import { useState } from "preact/hooks";
import type { ConnectOutcome } from "../../app/session";
import { describeConnect } from "./accountText";

/**
 * The first thing a new person sees. Two steps, said plainly, and one button.
 * Everything else (the spreadsheet, the permissions, the first load) is automatic.
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
    <div class="card get-started">
      <h2 class="card-title">Start your own portfolio</h2>
      <p class="card-subtitle">Connect Google, then import your first statement.</p>
      <details class="setup-details">
        <summary>How setup works</summary>
        <ol class="steps">
          <li>
            <strong>Continue with Google.</strong> FolioDash creates one private spreadsheet in your own Google Drive. It can only ever see that one file.
          </li>
          <li>
            <strong>Import your first bank statement.</strong> Drop in the Excel file from your bank. Your figures appear straight away.
          </li>
        </ol>
      </details>
      <button type="button" class="primary" data-working={busy} disabled={busy || !props.clientConfigured} onClick={() => void go()}>
        {busy ? "Waiting for Google…" : "Continue with Google"}
      </button>
      {!props.clientConfigured && <p class="hint">This site has no Google client set up yet. Add it on the Your data screen.</p>}
      {problem !== null && <p class="field-error" role="alert">{problem}</p>}
      <p class="footnote">The figures below are invented, so you can look around first.</p>
    </div>
  );
}
