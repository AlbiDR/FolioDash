import { canonicalJson } from "../../../core/integrity/canonical-json";
import { sha256Hex } from "../../../core/integrity/sha256";
import { parseExpenseCommand, type ExpenseCommand } from "../../../core/expenses/work-expenses";
import { EXPENSE_METADATA_KEY, EXPENSE_RECORD_ROLE } from "../sheets-layout";
import { callRest, type RestClient } from "../rest";
import { SHEETS } from "../workbook/sheets-api";

export const KEY = EXPENSE_METADATA_KEY;
export const ROLE = EXPENSE_RECORD_ROLE;
export const ANCHOR = "enabled-v1";
export const HEADER = ["schema", "payload", "checksum"];

export function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
export function commandOf(value: unknown): ExpenseCommand | null {
  const item = object(value);
  if (item === null || Object.keys(item).sort().join() !== "amounts,date,expectedRevision,id") return null;
  return parseExpenseCommand(item);
}
export function headToken(heads: ReadonlySet<string>): string | null {
  const ids = [...heads].sort();
  return ids.length > 1 ? `conflict:${sha256Hex(canonicalJson(ids))}` : (ids[0] ?? null);
}

export interface Tab {
  readonly id: number;
  readonly title: string;
  readonly markers: readonly string[];
}
export async function inspect(
  rest: RestClient,
  token: string,
  id: string,
): Promise<
  | { readonly status: "ok"; readonly tabs: readonly Tab[] }
  | { readonly status: "unavailable"; readonly message: string }
> {
  const answer = await callRest(rest, token, {
    method: "GET",
    url: `${SHEETS}/${encodeURIComponent(id)}?fields=${encodeURIComponent("sheets(properties(sheetId,title),developerMetadata)")}`,
  });
  if (!answer.ok)
    return {
      status: "unavailable",
      message: "Your work expense records could not be checked against Google. Nothing on this device was replaced.",
    };
  const sheets = object(answer.value)?.["sheets"];
  if (!Array.isArray(sheets))
    return { status: "unavailable", message: "Google returned an unrecognised workbook description." };
  const tabs: Tab[] = [];
  for (const raw of sheets as unknown[]) {
    const item = object(raw);
    const rawProps = object(item?.["properties"]);
    const props: Record<string, unknown> | null =
      rawProps === null ? null : { ...rawProps, sheetId: rawProps["sheetId"] ?? 0 };
    if (typeof props?.["sheetId"] !== "number" || typeof props["title"] !== "string")
      return { status: "unavailable", message: "Google returned an unrecognised sheet description." };
    const metadata = item?.["developerMetadata"];
    const markers = (Array.isArray(metadata) ? (metadata as unknown[]) : []).flatMap((entry): string[] => {
      const marker = object(entry);
      const location = object(marker?.["location"]);
      return marker?.["metadataKey"] === KEY &&
        typeof marker["metadataValue"] === "string" &&
        location !== null &&
        location["sheetId"] === props["sheetId"] &&
        location["dimensionRange"] === undefined
        ? [marker["metadataValue"]]
        : [];
    });
    tabs.push({ id: props["sheetId"], title: props["title"], markers });
  }
  return { status: "ok", tabs };
}
