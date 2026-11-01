import type { ConnectionConfig } from "../features/connection/ConnectionModel";

type Env = Readonly<Record<string, unknown>>;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Starting values for the Connection page, set as GitHub variables and read at
 * build time. They are public locators, never credentials, and a person's own
 * remembered values take precedence. The spreadsheet ID is deliberately not
 * included: it stays something each person enters.
 */
export function connectionDefaults(env: Env): Pick<ConnectionConfig, "clientId" | "scriptId"> {
  return { clientId: text(env["VITE_GOOGLE_CLIENT_ID"]), scriptId: text(env["VITE_GOOGLE_SCRIPT_ID"]) };
}

export const buildConnectionDefaults = connectionDefaults(import.meta.env);
