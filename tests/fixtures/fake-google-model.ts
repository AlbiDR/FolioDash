/** A minimal URL reader, so this fixture needs no DOM or Node typings. */
export interface ParsedUrl {
  readonly pathname: string;
  query(name: string): string | null;
  queryAll(name: string): string[];
}

export function parseUrl(text: string): ParsedUrl {
  const withoutOrigin = text.replace(/^https?:\/\/[^/]+/u, "");
  const [pathname = "", search = ""] = withoutOrigin.split("?");
  const pairs = new Map(
    search
      .split("&")
      .filter((pair) => pair.length > 0)
      .map((pair) => {
        const [key = "", value = ""] = pair.split("=");
        return [decodeURIComponent(key), decodeURIComponent(value)] as const;
      }),
  );
  return {
    pathname,
    query: (name) => pairs.get(name) ?? null,
    queryAll: (name) =>
      search.split("&").flatMap((pair) => {
        const [key = "", value = ""] = pair.split("=");
        return decodeURIComponent(key) === name ? [decodeURIComponent(value)] : [];
      }),
  };
}

/** The tab named by a range such as 'Bank 2026-01-31'!A1 or _FolioDash ledger!A1:D, with its quotes removed. */
export function tabNameOf(range: string): string {
  const name = range.split("!")[0] ?? "";
  return name.startsWith("'") && name.endsWith("'") ? name.slice(1, -1).replace(/''/gu, "'") : name;
}

export interface FakeFile {
  readonly id: string;
  readonly name: string;
  appProperties: Record<string, string>;
  trashed: boolean;
  readonly createdTime: number;
}

export interface FakeTab {
  readonly id: number;
  hidden: boolean;
  tabColorStyle?: unknown;
  frozenRowCount?: number;
  hideGridlines?: boolean;
  rows: unknown[][];
  /** Grid size, as Google tracks it: values may only be written inside it. */
  rowCount: number;
  columnCount: number;
  /** The `userEnteredFormat` of each cell written by `updateCells`, by row then column. */
  formats: (Record<string, unknown> | null)[][];
  widths: Map<number, number>;
  developerMetadata: Record<string, unknown>[];
}

export interface GridSize {
  rowCount?: number;
  columnCount?: number;
}

export function newTab(id: number, hidden: boolean, size: GridSize | undefined): FakeTab {
  return {
    id,
    hidden,
    rows: [],
    rowCount: size?.rowCount ?? 1000,
    columnCount: size?.columnCount ?? 26,
    formats: [],
    widths: new Map(),
    developerMetadata: [],
  };
}

export interface Fault {
  readonly match: RegExp;
  readonly append?: boolean;
  readonly status?: number;
  readonly network?: boolean;
  /** Apply the change before failing, like an answer lost on the way back. */
  readonly applyFirst?: boolean;
}

export function resizeTab(tab: FakeTab, rowCount: number, columnCount: number): void {
  tab.rows.length = Math.min(tab.rows.length, rowCount);
  tab.formats.length = Math.min(tab.formats.length, rowCount);
  for (const row of tab.rows) row.length = Math.min(row.length, columnCount);
  for (const row of tab.formats) row.length = Math.min(row.length, columnCount);
  for (const column of [...tab.widths.keys()]) if (column >= columnCount) tab.widths.delete(column);
  tab.rowCount = rowCount;
  tab.columnCount = columnCount;
}
