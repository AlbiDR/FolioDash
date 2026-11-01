import type { ConnectionConfig } from "./ConnectionModel";

export type ConfigField = keyof ConnectionConfig;

export type ConfigCheck =
  | { readonly ok: true; readonly config: ConnectionConfig }
  | { readonly ok: false; readonly errors: Readonly<Partial<Record<ConfigField, string>>> };

const GOOGLE_ID = /^[A-Za-z0-9_-]{20,120}$/u;
const CLIENT_ID = /^[0-9]{6,}-[a-z0-9]+\.apps\.googleusercontent\.com$/u;
const ID_IN_ADDRESS = /\/d\/([A-Za-z0-9_-]+)/u;

/** Accepts a bare ID or a pasted Google address and returns the ID. */
export function extractGoogleId(text: string): string {
  const trimmed = text.trim();
  return ID_IN_ADDRESS.exec(trimmed)?.[1] ?? trimmed;
}

/** Checks what the user typed before anything is sent. Messages say what to fix, never echo the value. */
export function checkConfig(raw: Readonly<Record<ConfigField, string>>): ConfigCheck {
  const clientId = raw.clientId.trim();
  const scriptId = extractGoogleId(raw.scriptId);
  const workbookId = extractGoogleId(raw.workbookId);
  const errors: Partial<Record<ConfigField, string>> = {};
  if (!CLIENT_ID.test(clientId)) errors.clientId = "Paste the OAuth client ID. It ends with .apps.googleusercontent.com.";
  if (!GOOGLE_ID.test(scriptId)) errors.scriptId = "Paste the script ID or deployment ID, or the script's address.";
  if (!GOOGLE_ID.test(workbookId)) errors.workbookId = "Paste the spreadsheet's ID or its address.";
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, config: { clientId, scriptId, workbookId } };
}
