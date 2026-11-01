import type { ConnectOutcome, RestoreOutcome, SheetStatus } from "../../app/session";

export interface Message {
  readonly good: boolean;
  readonly title: string;
  readonly body: string;
}

const CALL_FAILED: Readonly<Record<string, string>> = {
  unauthorised: "Google rejected the sign-in. Try again.",
  forbidden: "Google refused the request. Check that you allowed FolioDash to create and manage its own spreadsheet.",
  "not-found": "Google could not find the spreadsheet. Open Your data to check it.",
  unavailable: "Google is busy or unavailable. Try again shortly.",
  network: "The browser could not reach Google. Check your connection and try again.",
  unexpected: "Google answered in a way this app does not understand. Nothing was changed.",
};

const SIGN_IN: Readonly<Record<string, string>> = {
  denied: "Permission was declined. Nothing was created or changed.",
  closed: "The sign-in window was closed. Nothing was created or changed.",
  unavailable: "Google sign-in could not start. Check that pop-ups are allowed and that this site's address is allowed for its client ID.",
};

/** What a connect or sync result says to the person, in plain words. */
export function describeConnect(outcome: ConnectOutcome): Message {
  switch (outcome.status) {
    case "connected":
      if (outcome.created) return { good: true, title: "Your Google Sheet is ready", body: "A private spreadsheet was created in your Google Drive. Import your first bank statement to start your portfolio." };
      if (outcome.changed) return { good: true, title: "Updated from your Google Sheet", body: `Loaded ${String(outcome.statements)} ${outcome.statements === 1 ? "statement" : "statements"}.` };
      return { good: true, title: "Already up to date", body: `Your saved copy matches your Google Sheet (${String(outcome.statements)} ${outcome.statements === 1 ? "statement" : "statements"}).` };
    case "sign-in-failed":
      return { good: false, title: "Not signed in", body: SIGN_IN[outcome.reason] ?? "Sign-in did not complete." };
    case "call-failed":
      return { good: false, title: "Could not reach your Google Sheet", body: `${CALL_FAILED[outcome.failure] ?? "Something went wrong."} Your saved copy was not changed.` };
    case "needs-attention":
      return { good: false, title: "Your Google Sheet needs attention", body: outcome.message };
  }
}

export function describeRestore(outcome: RestoreOutcome): Message {
  switch (outcome.status) {
    case "restored":
      return { good: true, title: "Your Google Sheet was restored", body: "Everything saved on this device was written back, then read back and checked." };
    case "sign-in-failed":
      return { good: false, title: "Not signed in", body: SIGN_IN[outcome.reason] ?? "Sign-in did not complete." };
    case "nothing-to-restore":
      return { good: false, title: "Nothing to restore", body: "This device holds no saved statements." };
    case "not-needed":
      return { good: true, title: "Nothing to restore", body: "Your Google Sheet is fine." };
    case "failed":
      return { good: false, title: "Could not restore", body: outcome.message };
  }
}

export const SHEET_TEXT: Readonly<Record<SheetStatus, string>> = {
  unchecked: "Not checked in this visit",
  ok: "Healthy: every record passed its checks",
  missing: "Cannot be opened",
  emptied: "Holds no statements",
  damaged: "Records failed their checks",
  "not-a-ledger": "Not a FolioDash sheet",
};
