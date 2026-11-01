import type { JSX } from "preact";
import { useState } from "preact/hooks";
import type { LedgerState } from "../../../../core/Ledger";
import type { ConnectionConfig, ConnectionPort, ConnectionResult, ConnectionStep, ConnectionStorage } from "./ConnectionModel";
import { type ConfigField, checkConfig } from "./connectionConfig";

type Phase =
  | { readonly name: "idle" }
  | { readonly name: "working"; readonly step: ConnectionStep }
  | { readonly name: "done"; readonly result: ConnectionResult };

const STEP_TEXT: Readonly<Record<ConnectionStep, string>> = {
  "signing-in": "Waiting for Google sign-in and permission…",
  "calling-service": "Calling your script to check the spreadsheet…",
};

interface Message {
  readonly good: boolean;
  readonly title: string;
  readonly body: string;
}

function describe(result: ConnectionResult): Message {
  switch (result.status) {
    case "connected":
      return {
        good: true,
        title: "Connected",
        body:
          (result.statements === 0
            ? "Your script answered and can reach the spreadsheet. It holds no statements yet; the ledger tab is created when the first statement is recorded."
            : `Your script answered and the ledger in the spreadsheet is intact. It holds ${String(result.statements)} ${result.statements === 1 ? "statement" : "statements"}.`) +
          (result.ignoredTrailingRows > 0 ? ` ${String(result.ignoredTrailingRows)} unfinished rows from an interrupted save are ignored.` : ""),
      };
    case "ledger-damaged":
      return { good: false, title: "The ledger is damaged", body: `${result.message} Nothing was changed. Do not record anything until it is restored.` };
    case "workbook-unavailable":
      return { good: false, title: "The spreadsheet could not be opened", body: "The script could not open that spreadsheet with your access. Check the spreadsheet ID, and that this Google account can edit it." };
    case "sign-in-failed":
      return {
        good: false,
        title: result.reason === "denied" ? "Permission was declined" : result.reason === "closed" ? "The sign-in window was closed" : "Google sign-in could not start",
        body:
          result.reason === "unavailable"
            ? "Check the client ID, that this page's address is an authorised origin for it, and that pop-ups are allowed."
            : "Nothing was sent to your script. Try again when you are ready.",
      };
    case "call-failed":
      return failureMessage(result.failure, result.message);
    case "unrecognised-answer":
      return { good: false, title: "The answer was not recognised", body: "The script answered with something this app does not understand. Check that the latest build was pushed and deployed." };
    case "refused":
      return { good: false, title: "The service refused the request", body: result.message };
  }
}

function failureMessage(failure: Extract<ConnectionResult, { status: "call-failed" }>["failure"], detail: string | null): Message {
  const bad = (title: string, body: string): Message => ({ good: false, title, body });
  switch (failure) {
    case "unauthorised":
      return bad("Google rejected the sign-in token", "Try again, and make sure the permission you grant includes spreadsheet access.");
    case "forbidden":
      return bad("Google refused the call", "Check that the Apps Script API is enabled in the Cloud project linked to the script, and that this account is allowed to run it.");
    case "not-found":
      return bad("The script was not found", "Check the script or deployment ID, and that the script is deployed as an API executable.");
    case "unavailable":
      return bad("Google is unavailable", "Google is busy or unavailable. Try again shortly.");
    case "network":
      return bad("The browser could not reach Google", "Check your connection and try again.");
    case "script-error":
      return bad("The script reported an error", detail ?? "The script reported an error.");
    case "unexpected":
      return bad("Unexpected answer from Google", "Google answered in a way this app does not understand.");
  }
}

const BLANK: Readonly<Record<ConfigField, string>> = { clientId: "", scriptId: "", workbookId: "" };

export function ConnectionView(props: {
  readonly connect: ConnectionPort;
  readonly storage: ConnectionStorage;
  /** Called when the spreadsheet answered and its ledger is intact, with the ledger it holds. */
  readonly onConnected?: (config: ConnectionConfig, ledger: LedgerState) => void;
}): JSX.Element {
  const saved = props.storage.load();
  const [fields, setFields] = useState<Readonly<Record<ConfigField, string>>>(saved ?? BLANK);
  const [remember, setRemember] = useState(saved !== null);
  const [errors, setErrors] = useState<Readonly<Partial<Record<ConfigField, string>>>>({});
  const [phase, setPhase] = useState<Phase>({ name: "idle" });

  async function submit(): Promise<void> {
    const check = checkConfig(fields);
    if (!check.ok) {
      setErrors(check.errors);
      return;
    }
    setErrors({});
    const config: ConnectionConfig = check.config;
    if (remember) props.storage.save(config);
    else props.storage.clear();
    setPhase({ name: "working", step: "signing-in" });
    try {
      const result = await props.connect(config, (step) => {
        setPhase({ name: "working", step });
      });
      setPhase({ name: "done", result });
      if (result.status === "connected") props.onConnected?.(config, result.ledger);
    } catch {
      setPhase({ name: "done", result: { status: "call-failed", failure: "unexpected", message: null } });
    }
  }

  const field = (name: ConfigField, label: string, hint: string): JSX.Element => (
    <div class="field">
      <label for={`connection-${name}`}>{label}</label>
      <input
        id={`connection-${name}`}
        type="text"
        autoComplete="off"
        spellcheck={false}
        value={fields[name]}
        aria-describedby={`connection-${name}-hint`}
        aria-invalid={errors[name] === undefined ? undefined : "true"}
        onInput={(event) => {
          // Functional update: several fields can change in one tick (autofill, paste), and each must keep the others.
          const value = event.currentTarget.value;
          setFields((current) => ({ ...current, [name]: value }));
        }}
      />
      <p class="hint" id={`connection-${name}-hint`}>{hint}</p>
      {errors[name] !== undefined && <p class="field-error" role="alert">{errors[name]}</p>}
    </div>
  );

  const message = phase.name === "done" ? describe(phase.result) : null;
  return (
    <section aria-labelledby="connection-heading" class="connection">
      <h2 id="connection-heading">Connection to Google</h2>
      <p>
        This signs you in, reaches your script and spreadsheet, and loads the ledger it holds. Connecting only
        reads: nothing is recorded or changed. Once connected, statements you confirm on the import screen are saved
        to this spreadsheet. Use the synthetic test spreadsheet, not real data. Google may warn that the app is
        unverified; that is expected for your own test app.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {field("clientId", "OAuth client ID", "From the Google Cloud console. It ends with .apps.googleusercontent.com and is not a secret.")}
        {field("scriptId", "Script or deployment ID", "The Apps Script project ID or its API-executable deployment ID. You can paste the script's address.")}
        {field("workbookId", "Spreadsheet ID", "You can paste the spreadsheet's address.")}
        <div class="field">
          <label>
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => {
                setRemember(event.currentTarget.checked);
              }}
            />{" "}
            Remember these three IDs on this device
          </label>
          <p class="hint">Stored only in this browser. They are locators, not passwords. A sign-in token is never stored.</p>
        </div>
        <button type="submit" class="primary" disabled={phase.name === "working"}>
          Connect and check
        </button>
      </form>

      <div aria-live="polite" class="status">
        {phase.name === "working" && <p>{STEP_TEXT[phase.step]}</p>}
      </div>
      {message !== null && (
        <div class={message.good ? "review-adjustments" : "review-problem"} role={message.good ? "status" : "alert"}>
          <h3>{message.title}</h3>
          <p>{message.body}</p>
        </div>
      )}
    </section>
  );
}
