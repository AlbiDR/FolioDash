import type { Workbook } from "../../applications/session/session-model";
import type { Grid } from "../../applications/ledger/sheet-grid";
import { type RestClient, type RestResult, callRest } from "./rest";
import {
  APP_PROPERTY_KEY,
  APP_PROPERTY_VALUE,
  ORGANIZATION_METADATA_KEY,
  ORGANIZATION_VERSION,
  LEDGER_COLUMNS,
  LEDGER_HEADER,
  LEDGER_TAB,
  VIEW_TAB,
  WORKBOOK_TITLE,
} from "./sheets-layout";
import { DRIVE, SHEETS, fail, openUrl, record } from "./workbook/sheets-api";
import { type TabInfo, listTabs, viewMetadata } from "./workbook/tabs";
import { readLedgerRows, tidyLedgerTab } from "./workbook/ledger-rows";
import { numberedView, viewValues } from "./workbook/view-match";
import { organizationRequests, technicalRequests, viewRequests } from "./workbook/grid-requests";

/** Explicit discovery identity keeps local synthetic acceptance separate from the real portfolio. */
export interface WorkbookIdentity {
  readonly title: string;
  readonly propertyKey: string;
  readonly propertyValue: string;
}
const DEFAULT_IDENTITY: WorkbookIdentity = {
  title: WORKBOOK_TITLE,
  propertyKey: APP_PROPERTY_KEY,
  propertyValue: APP_PROPERTY_VALUE,
};

/**
 * Finds the person's FolioDash spreadsheet again: first by the tag the app put on
 * it, then, in case tagging did not complete, by its name. The newest match wins.
 */
export async function findWorkbook(
  rest: RestClient,
  accessToken: string,
  identity: WorkbookIdentity = DEFAULT_IDENTITY,
): Promise<RestResult<Workbook | null>> {
  const queries = [
    `appProperties has { key='${identity.propertyKey}' and value='${identity.propertyValue}' } and trashed=false`,
    `name='${identity.title}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
  ];
  for (const query of queries) {
    const url = `${DRIVE}?q=${encodeURIComponent(query)}&fields=${encodeURIComponent("files(id)")}&orderBy=${encodeURIComponent("createdTime desc")}&pageSize=1&spaces=drive`;
    const answer = await callRest(rest, accessToken, { method: "GET", url });
    if (!answer.ok) return answer;
    const files = record(answer.value)?.["files"];
    const first = Array.isArray(files) ? record(files[0]) : null;
    if (typeof first?.["id"] === "string") return { ok: true, value: { id: first["id"], url: openUrl(first["id"]) } };
  }
  return { ok: true, value: null };
}

/**
 * Creates the spreadsheet: a readable tab for the person and a hidden ledger tab
 * with its header in the same creation request, then tags the file. A tagging
 * failure is not fatal, because the name search finds the file anyway; it is
 * reported so it can be mentioned.
 */
export async function createWorkbook(
  rest: RestClient,
  accessToken: string,
  identity: WorkbookIdentity = DEFAULT_IDENTITY,
): Promise<RestResult<Workbook & { readonly tagged: boolean }>> {
  const created = await callRest(rest, accessToken, {
    method: "POST",
    url: SHEETS,
    body: {
      properties: { title: identity.title },
      sheets: [
        { properties: { sheetId: 0, title: VIEW_TAB, index: 0 }, developerMetadata: [viewMetadata(0, VIEW_TAB)] },
        {
          properties: {
            sheetId: 1,
            title: LEDGER_TAB,
            index: 1,
            hidden: true,
            gridProperties: { rowCount: 2, columnCount: LEDGER_COLUMNS, frozenRowCount: 1 },
          },
          data: [
            {
              startRow: 0,
              startColumn: 0,
              rowData: [{ values: LEDGER_HEADER.map((text) => ({ userEnteredValue: { stringValue: text } })) }],
            },
          ],
        },
      ],
    },
  });
  if (!created.ok) return created;
  const id = record(created.value)?.["spreadsheetId"];
  if (typeof id !== "string") return fail("unexpected");

  const header = await readLedgerRows(rest, accessToken, id);
  if (!header.ok) return header;
  if ("notALedger" in header.value) return fail("unexpected");

  await tidyLedgerTab(rest, accessToken, id);

  const tag = await callRest(rest, accessToken, {
    method: "PATCH",
    url: `${DRIVE}/${encodeURIComponent(id)}?fields=id`,
    body: { appProperties: { [identity.propertyKey]: identity.propertyValue } },
  });
  return { ok: true, value: { id, url: openUrl(id), tagged: tag.ok } };
}

export interface GridTab {
  readonly title: string;
  readonly grid: Grid;
  /** Ledger/source-backed compatibility views; generated lazily for migrations. */
  readonly legacyGrids?: readonly Grid[] | (() => readonly Grid[]);
}

/** A cheap connection-time check; this never writes or requests new access. */
export async function needsOrganization(
  rest: RestClient,
  token: string,
  workbookId: string,
): Promise<RestResult<boolean>> {
  const answer = await callRest(rest, token, {
    method: "GET",
    url: `${SHEETS}/${encodeURIComponent(workbookId)}?fields=developerMetadata`,
  });
  if (!answer.ok) return answer;
  if (record(answer.value) === null) return fail("unexpected");
  const metadata = record(answer.value)?.["developerMetadata"];
  const versions = (Array.isArray(metadata) ? (metadata as unknown[]) : []).filter(
    (item) =>
      record(item)?.["metadataKey"] === ORGANIZATION_METADATA_KEY &&
      record(record(item)?.["location"])?.["spreadsheet"] === true,
  );
  return { ok: true, value: versions.length !== 1 || record(versions[0])?.["metadataValue"] !== ORGANIZATION_VERSION };
}

function candidatesFor(existing: readonly TabInfo[], tab: GridTab): readonly TabInfo[] {
  return existing.filter(
    (candidate) =>
      candidate.viewRoles.includes(tab.title) ||
      candidate.title === tab.title ||
      (tab.legacyGrids !== undefined && numberedView(candidate.title, tab.title)),
  );
}

export type GridWriteResult = RestResult<true> & {
  readonly message?: string;
  readonly consolidatedTabs?: number;
  readonly preservedTabs?: number;
};

/**
 * Writes tabs from finished grids, any number of them: list the
 * tabs, then one batch that adds the missing owned views, fits every grid to exactly its
 * data plus the one-cell margin (so surplus rows and columns are deleted), resets
 * what was there, and writes values, formats and widths. Text goes in as text and
 * numbers as numbers, with no guessing by Google. A batch is applied whole or not
 * at all. Unmarked legacy tabs require an additional exact-content read before adoption.
 * These tabs are views of the ledger that can be rewritten at any time, so
 * a failure here never affects the saved records.
 */
export async function writeGridTabs(
  rest: RestClient,
  accessToken: string,
  workbookId: string,
  tabs: readonly GridTab[],
  options: { readonly completeOrganization?: boolean } = {},
): Promise<GridWriteResult> {
  if (tabs.length === 0) return { ok: true, value: true };
  // Never let a view operation target the financial log or repeat a role in one batch.
  if (tabs.some((tab) => tab.title === LEDGER_TAB) || new Set(tabs.map((tab) => tab.title)).size !== tabs.length)
    return fail("unexpected");
  const existing = await listTabs(rest, accessToken, workbookId);
  if (!existing.ok) return existing;
  let organized = [...existing.value];
  // One read for all legacy/duplicate candidates, however many months there are.
  const checking = [
    ...new Map(
      tabs
        .flatMap((tab) => {
          const candidates = candidatesFor(existing.value, tab);
          return candidates.filter(
            (candidate) =>
              candidate.viewRoles.length === 0 || candidates.length > 1 || numberedView(candidate.title, tab.title),
          );
        })
        .map((candidate) => [candidate.id, candidate] as const),
    ).values(),
  ];
  const values = new Map<number, unknown>();
  if (checking.length > 0) {
    const ranges = checking
      .map((candidate) => `ranges=${encodeURIComponent(`'${candidate.title.replaceAll("'", "''")}'`)}`)
      .join("&");
    const read = await callRest(rest, accessToken, {
      method: "GET",
      url: `${SHEETS}/${encodeURIComponent(workbookId)}/values:batchGet?${ranges}&valueRenderOption=FORMULA`,
    });
    if (!read.ok) return read;
    const valueRanges = record(read.value)?.["valueRanges"];
    if (!Array.isArray(valueRanges) || valueRanges.length !== checking.length) return fail("unexpected");
    checking.forEach((candidate, index) => values.set(candidate.id, record(valueRanges[index])?.["values"] ?? []));
  }
  let consolidatedTabs = 0;
  let preservedTabs = 0;
  let nextId = existing.value.reduce((highest, tab) => Math.max(highest, tab.id), 0) + 1;

  const requests: unknown[] = [];
  for (const tab of tabs) {
    const rows = tab.grid.cells.length;
    const columns = tab.grid.widths.length;
    const candidates = candidatesFor(existing.value, tab);
    const owned = candidates.filter((candidate) => candidate.viewRoles.includes(tab.title));
    const error = (message: string): GridWriteResult => ({
      ok: false,
      failure: "unexpected",
      message: `${message} No organization batch was submitted. Saved records are preserved.`,
    });
    if (
      owned.some(
        (candidate) => candidate.title === LEDGER_TAB || candidate.financialRecords || candidate.viewRoles.length !== 1,
      )
    )
      return error(`The ownership of “${tab.title}” is ambiguous.`);
    // Compatibility renderings are generated only for an actual migration;
    // normal writes to a marked view never render every historical summary.
    let expected: readonly string[] | null = null;
    const matches = (candidate: TabInfo): boolean => {
      if (!values.has(candidate.id)) return false;
      const older = (): readonly Grid[] =>
        typeof tab.legacyGrids === "function" ? tab.legacyGrids() : (tab.legacyGrids ?? []);
      expected ??= [tab.grid, ...older()].map((grid) =>
        viewValues(grid.cells.map((row) => row.map((cell) => cell.value))),
      );
      return expected.includes(viewValues(values.get(candidate.id)));
    };
    const eligible = candidates.filter(
      (candidate) =>
        !candidate.financialRecords &&
        candidate.title !== LEDGER_TAB &&
        (candidate.viewRoles.length === 0 ||
          (candidate.viewRoles.length === 1 && candidate.viewRoles[0] === tab.title)),
    );
    // Multiple ownership markers require ledger-backed compatibility renderings
    // and independently verified contents before consolidation.
    if (owned.length > 1 && (tab.legacyGrids === undefined || owned.some((candidate) => !matches(candidate))))
      return error(`The ownership of “${tab.title}” is ambiguous.`);
    const canonical = candidates.find((candidate) => candidate.title === tab.title);
    if (canonical !== undefined && !owned.includes(canonical) && (!eligible.includes(canonical) || !matches(canonical)))
      return error(
        `“${canonical.title}” differs from its retained statement or saved view. Preserve and rename that tab before organizing again.`,
      );
    const chosen =
      (tab.legacyGrids === undefined ? (owned[0] ?? canonical) : (canonical ?? owned[0])) ?? eligible.find(matches);
    const knownId = chosen?.id;
    if (chosen !== undefined && !owned.includes(chosen)) {
      requests.push({ createDeveloperMetadata: { developerMetadata: viewMetadata(chosen.id, tab.title) } });
    }
    for (const candidate of candidates) {
      if (candidate.id === knownId) continue;
      if (
        tab.legacyGrids !== undefined &&
        eligible.includes(candidate) &&
        (matches(candidate) || (owned.length === 1 && owned.includes(candidate)))
      ) {
        // Checked financial/source records retain the facts behind these views,
        // so the current presentation can be rebuilt after consolidation.
        requests.push({ deleteSheet: { sheetId: candidate.id } });
        organized = organized.filter((item) => item.id !== candidate.id);
        consolidatedTabs++;
      } else preservedTabs++;
    }
    if (chosen !== undefined) {
      const title = numberedView(chosen.title, tab.title) && canonical === undefined ? tab.title : chosen.title;
      if (title !== chosen.title)
        requests.push({ updateSheetProperties: { properties: { sheetId: chosen.id, title }, fields: "title" } });
      organized = organized.map((candidate) =>
        candidate.id === chosen.id ? { ...candidate, title, viewRoles: [tab.title] } : candidate,
      );
    }
    const sheetId = knownId ?? nextId++;
    if (knownId === undefined) {
      const title = tab.title;
      organized.push({
        id: sheetId,
        title,
        hidden: false,
        columns,
        viewRoles: [title],
        financialRecords: false,
        expenseRecords: false,
      });
      requests.push({
        addSheet: { properties: { sheetId, title, gridProperties: { rowCount: rows, columnCount: columns } } },
      });
      requests.push({ createDeveloperMetadata: { developerMetadata: viewMetadata(sheetId, tab.title) } });
    }
    requests.push(...viewRequests(tab, sheetId, knownId, rows, columns));
  }
  requests.push(...technicalRequests(organized), ...organizationRequests(organized));
  if (options.completeOrganization)
    requests.push(
      {
        deleteDeveloperMetadata: {
          dataFilter: {
            developerMetadataLookup: { metadataKey: ORGANIZATION_METADATA_KEY, locationType: "SPREADSHEET" },
          },
        },
      },
      {
        createDeveloperMetadata: {
          developerMetadata: {
            metadataKey: ORGANIZATION_METADATA_KEY,
            metadataValue: ORGANIZATION_VERSION,
            location: { spreadsheet: true },
            visibility: "DOCUMENT",
          },
        },
      },
    );
  const written = await callRest(rest, accessToken, {
    method: "POST",
    url: `${SHEETS}/${encodeURIComponent(workbookId)}:batchUpdate`,
    body: { requests },
  });
  return written.ok ? { ok: true, value: true, consolidatedTabs, preservedTabs } : written;
}
