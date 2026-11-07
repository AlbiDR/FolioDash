import type { ConnectOutcome, RestoreOutcome, SheetStatus, TidyOutcome, VerifyOutcome } from "../../../../applications/SessionModel";
import { formatMonthYear } from "../../../../core/IsoDate";

export interface Message {
  readonly good: boolean;
  readonly title: string;
  readonly body: string;
}

const CALL_FAILED: Readonly<Record<string, string>> = {
  unauthorised: "Google no longer accepts this session. Choose Reconnect with Google. FolioDash asks for the account it remembers; if that is not the account that owns your FolioDash sheet, choose Use a different Google account.",
  forbidden: "Google refused the request. Check that you allowed FolioDash to create and manage its own spreadsheet.",
  "not-found": "Google could not find the spreadsheet. Open Your data to check it.",
  unavailable: "Google is busy or unavailable. Try again shortly.",
  network: "The browser could not reach Google. Check your connection and try again.",
  unexpected: "Google answered in a way this app does not understand. Nothing was changed.",
};

const SIGN_IN: Readonly<Record<string, string>> = {
  blocked: "Your browser blocked the Google window. Allow pop-ups for this site, then choose Continue with Google or Sync now again.",
  timeout: "Google sign-in took too long. Close the old Google window and try again. Your saved copy is still available.",
  denied: "Permission was declined. Nothing was created or changed.",
  closed: "The sign-in window was closed. Nothing was created or changed.",
  unavailable: "Google sign-in could not start. Check that pop-ups are allowed and that this site's address is allowed for its client ID.",
};

/** What a connect or sync result says to the person, in plain words. */
export function describeConnect(outcome: ConnectOutcome): Message {
  switch (outcome.status) {
    case "superseded":
      return { good: false, title: "This check was superseded", body: "A newer check or connection change replaced this request. Your saved copy was not changed by this request. Check the current connection status." };
    case "connected":
      if (outcome.created) return { good: true, title: "Your Google Sheet is ready", body: "A private spreadsheet was created in your Google Drive. Import your first bank statement to start your portfolio." };
      if (outcome.changed) return { good: true, title: "Updated from your Google Sheet", body: `Loaded ${String(outcome.statements)} ${outcome.statements === 1 ? "statement" : "statements"}.` };
      return { good: true, title: "Already up to date", body: `Your saved copy matches your Google Sheet (${String(outcome.statements)} ${outcome.statements === 1 ? "statement" : "statements"}).` };
    case "sign-in-failed":
      return { good: false, title: "Not signed in", body: SIGN_IN[outcome.reason] ?? "Sign-in did not complete." };
    case "call-failed":
      return { good: false, title: outcome.failure === "unauthorised" ? "Reconnect to Google" : "Could not reach your Google Sheet", body: `${CALL_FAILED[outcome.failure] ?? "Something went wrong."} Your saved copy was not changed.` };
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

const plural = (count: number, one: string, many: string): string => `${String(count)} ${count === 1 ? one : many}`;

/** What the history check says: how many months rebuild exactly, and, plainly, which cannot be checked or do not match. */
export function describeVerify(outcome: VerifyOutcome): Message {
  switch (outcome.status) {
    case "sign-in-failed":
      return { good: false, title: "Not signed in", body: SIGN_IN[outcome.reason] ?? "Sign-in did not complete." };
    case "needs-attention":
      return { good: false, title: "Your Google Sheet needs attention", body: outcome.message };
    case "failed":
      return { good: false, title: "Could not check", body: outcome.message };
    case "checked": {
      const { report } = outcome;
      if (report.months === 0) return { good: true, title: "Nothing to check yet", body: "No months are saved yet." };
      const lines: string[] = [];
      if (report.differing.length > 0) lines.push(`These months do not match what their saved statement produces: ${report.differing.map((date) => formatMonthYear(date)).join(", ")}.`);
      if (report.unreadable.length > 0) lines.push(`These months have a saved statement that could not be read: ${report.unreadable.map((date) => formatMonthYear(date)).join(", ")}.`);
      if (report.withoutStatement > 0) {
        lines.push(`${plural(report.withoutStatement, "month was", "months were")} saved without its bank statement (before statements were kept, or restored from a device copy), so ${report.withoutStatement === 1 ? "it" : "they"} cannot be rebuilt.`);
      }
      const clean = report.differing.length === 0 && report.unreadable.length === 0;
      const everything = clean && report.withoutStatement === 0;
      return {
        good: clean,
        title: everything ? "Your whole history can be rebuilt" : clean ? "What can be checked, matches" : "Something does not match",
        body: [`${String(report.matching)} of ${plural(report.months, "month", "months")} rebuild exactly from the saved bank statements.`, ...lines].join(" "),
      };
    }
  }
}

export function describeTidy(outcome: TidyOutcome): Message {
  switch (outcome.status) {
    case "sign-in-failed":
      return { good: false, title: "Not signed in", body: SIGN_IN[outcome.reason] ?? "Sign-in did not complete." };
    case "needs-attention":
      return { good: false, title: "Your Google Sheet needs attention", body: outcome.message };
    case "failed":
      return { good: false, title: "Could not tidy", body: outcome.message };
    case "tidied": {
      const rest = outcome.withoutStatement > 0 ? ` ${plural(outcome.withoutStatement, "month has", "months have")} no kept statement, so there is no tab for ${outcome.withoutStatement === 1 ? "it" : "them"}.` : "";
      return { good: true, title: "Your sheet is tidy", body: `The summary and ${plural(outcome.months, "monthly tab", "monthly tabs")} were rewritten.${rest}` };
    }
  }
}
