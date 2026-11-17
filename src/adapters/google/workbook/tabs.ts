import { type RestClient, type RestResult, callRest } from "../rest";
import { EXPENSE_METADATA_KEY, EXPENSE_RECORD_ROLE, VIEW_METADATA_KEY } from "../sheets-layout";
import { SHEETS, record } from "./sheets-api";

export interface TabInfo {
  readonly id: number;
  readonly title: string;
  readonly hidden: boolean;
  readonly columns: number;
  readonly viewRoles: readonly string[];
  readonly financialRecords: boolean;
  readonly expenseRecords: boolean;
}

export function viewMetadata(sheetId: number, role: string): Record<string, unknown> {
  return { metadataKey: VIEW_METADATA_KEY, metadataValue: role, location: { sheetId }, visibility: "DOCUMENT" };
}

function sheetLocation(value: unknown, sheetId: number): boolean {
  const location = record(value);
  return (
    location !== null &&
    location["dimensionRange"] === undefined &&
    location["spreadsheet"] !== true &&
    (location["sheetId"] === sheetId ||
      (sheetId === 0 && location["sheetId"] === undefined && location["locationType"] === "SHEET"))
  );
}

export async function listTabs(
  rest: RestClient,
  accessToken: string,
  workbookId: string,
): Promise<RestResult<readonly TabInfo[]>> {
  const answer = await callRest(rest, accessToken, {
    method: "GET",
    url: `${SHEETS}/${encodeURIComponent(workbookId)}?fields=${encodeURIComponent("sheets(properties(sheetId,title,hidden,gridProperties(columnCount)),developerMetadata)")}`,
  });
  if (!answer.ok) return answer;
  const sheets = record(answer.value)?.["sheets"];
  const tabs = (Array.isArray(sheets) ? (sheets as unknown[]) : []).flatMap((entry): TabInfo[] => {
    const properties = record(record(entry)?.["properties"]);
    // Google can omit a scalar's default value (sheet ID zero) in responses.
    const sheetId = properties?.["sheetId"] ?? 0;
    const columns = record(properties?.["gridProperties"])?.["columnCount"];
    const metadata = record(entry)?.["developerMetadata"];
    const financialRecords = (Array.isArray(metadata) ? metadata : []).some((item: unknown) => {
      const value = record(item);
      const location = record(value?.["location"]);
      return (
        value?.["metadataKey"] === EXPENSE_METADATA_KEY &&
        sheetLocation(location, typeof sheetId === "number" ? sheetId : -1)
      );
    });
    const expenseRecords = (Array.isArray(metadata) ? metadata : []).some((item: unknown) => {
      const value = record(item);
      return (
        value?.["metadataKey"] === EXPENSE_METADATA_KEY &&
        value["metadataValue"] === EXPENSE_RECORD_ROLE &&
        sheetLocation(value["location"], typeof sheetId === "number" ? sheetId : -1)
      );
    });
    const viewRoles = (Array.isArray(metadata) ? metadata : []).flatMap((item: unknown): string[] => {
      const value = record(item);
      const location = record(value?.["location"]);
      return value?.["metadataKey"] === VIEW_METADATA_KEY &&
        typeof value["metadataValue"] === "string" &&
        sheetLocation(location, typeof sheetId === "number" ? sheetId : -1) &&
        location?.["dimensionRange"] === undefined
        ? [value["metadataValue"]]
        : [];
    });
    return typeof sheetId === "number" && typeof properties?.["title"] === "string"
      ? [
          {
            id: sheetId,
            title: properties["title"],
            hidden: properties["hidden"] === true,
            columns: typeof columns === "number" ? columns : 0,
            viewRoles,
            financialRecords,
            expenseRecords,
          },
        ]
      : [];
  });
  return { ok: true, value: tabs };
}
