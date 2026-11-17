import type { RestResult } from "../rest";

export const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";
export const DRIVE = "https://www.googleapis.com/drive/v3/files";

export function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function fail<T>(failure: Extract<RestResult<T>, { ok: false }>["failure"]): RestResult<T> {
  return { ok: false, failure };
}

export function openUrl(id: string): string {
  return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/edit`;
}
