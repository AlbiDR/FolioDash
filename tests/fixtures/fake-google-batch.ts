import { type FakeTab, type GridSize, newTab, resizeTab } from "./fake-google-model";

export function applyBatchRequest(
  tabs: Map<string, FakeTab>,
  request: Record<string, unknown>,
  ids: { nextTabId: number },
): string | null {
  const byId = (sheetId: unknown): FakeTab | undefined =>
    [...tabs.values()].find((candidate) => candidate.id === sheetId);
  const append = request["appendCells"] as
    { sheetId: number; rows: { values: { userEnteredValue: { stringValue: string } }[] }[] } | undefined;
  if (append !== undefined) {
    const tab = byId(append.sheetId);
    if (tab === undefined) return "No such sheet";
    for (const row of append.rows) tab.rows.push(row.values.map((cell) => cell.userEnteredValue.stringValue));
    tab.rowCount = Math.max(tab.rowCount, tab.rows.length);
  }
  const add = request["addSheet"] as
    { properties: { title: string; sheetId?: number; gridProperties?: GridSize } } | undefined;
  if (add !== undefined) {
    // Google refuses a second tab with the same name or id.
    if (tabs.has(add.properties.title)) return "A sheet with the name already exists";
    const chosen = add.properties.sheetId;
    if (chosen !== undefined && byId(chosen) !== undefined) return "A sheet with the id already exists";
    const sheetId = chosen ?? ids.nextTabId;
    ids.nextTabId = Math.max(ids.nextTabId, sheetId + 1);
    tabs.set(add.properties.title, newTab(sheetId, false, add.properties.gridProperties));
  }
  const deletion = request["deleteSheet"] as { sheetId: number } | undefined;
  if (deletion !== undefined) {
    const entry = [...tabs.entries()].find(([, tab]) => tab.id === deletion.sheetId);
    if (entry === undefined) return "No such sheet";
    tabs.delete(entry[0]);
  }
  const metadata = request["createDeveloperMetadata"] as
    { developerMetadata: Record<string, unknown> & { location: { sheetId: number } } } | undefined;
  if (metadata !== undefined) {
    const tab = byId(metadata.developerMetadata.location.sheetId);
    if (tab === undefined) return "No such sheet";
    tab.developerMetadata.push(metadata.developerMetadata);
  }
  const update = request["updateSheetProperties"] as
    | {
        properties: {
          sheetId: number;
          title?: string;
          hidden?: boolean;
          index?: number;
          tabColorStyle?: unknown;
          gridProperties?: GridSize & { frozenRowCount?: number; hideGridlines?: boolean };
        };
        fields: string;
      }
    | undefined;
  if (update !== undefined) {
    const tab = byId(update.properties.sheetId);
    if (tab === undefined) return "No such sheet";
    if (update.properties.title !== undefined) {
      const old = [...tabs.entries()].find(([, candidate]) => candidate.id === tab.id)?.[0];
      if (tabs.has(update.properties.title) && old !== update.properties.title)
        return "A sheet with the name already exists";
      const entries = [...tabs.entries()].map(
        ([title, value]) => [title === old ? (update.properties.title ?? title) : title, value] as const,
      );
      tabs.clear();
      for (const [title, value] of entries) tabs.set(title, value);
    }
    if (update.fields.includes("hidden")) tab.hidden = update.properties.hidden === true;
    if (update.fields.includes("tabColorStyle")) tab.tabColorStyle = update.properties.tabColorStyle;
    if (update.fields === "index") {
      const entries = [...tabs.entries()];
      const current = entries.findIndex(([, candidate]) => candidate.id === tab.id);
      const target = update.properties.index ?? current;
      if (target !== current && target !== current + 1) {
        const entry = entries.splice(current, 1)[0];
        if (entry !== undefined) entries.splice(target > current ? target - 1 : target, 0, entry);
        tabs.clear();
        for (const [title, value] of entries) tabs.set(title, value);
      }
    }
    const grid = update.properties.gridProperties;
    if (grid?.frozenRowCount !== undefined) tab.frozenRowCount = grid.frozenRowCount;
    if (grid?.hideGridlines !== undefined) tab.hideGridlines = grid.hideGridlines;
    if (grid?.rowCount !== undefined) resizeTab(tab, grid.rowCount, tab.columnCount);
    if (grid?.columnCount !== undefined) resizeTab(tab, tab.rowCount, grid.columnCount);
  }
  const remove = request["deleteDimension"] as
    { range: { sheetId: number; dimension: string; startIndex: number; endIndex: number } } | undefined;
  if (remove !== undefined) {
    const tab = byId(remove.range.sheetId);
    if (tab === undefined) return "No such sheet";
    const { startIndex, endIndex } = remove.range;
    if (remove.range.dimension === "COLUMNS") {
      if (endIndex > tab.columnCount) return "Range exceeds grid limits";
      for (const row of tab.rows) row.splice(startIndex, endIndex - startIndex);
      for (const row of tab.formats) row.splice(startIndex, endIndex - startIndex);
      tab.columnCount -= endIndex - startIndex;
    } else {
      if (endIndex > tab.rowCount) return "Range exceeds grid limits";
      tab.rows.splice(startIndex, endIndex - startIndex);
      tab.formats.splice(startIndex, endIndex - startIndex);
      tab.rowCount -= endIndex - startIndex;
    }
  }
  const reset = request["repeatCell"] as { range: { sheetId: number }; fields: string } | undefined;
  if (reset !== undefined) {
    const tab = byId(reset.range.sheetId);
    if (tab === undefined) return "No such sheet";
    if (reset.fields.includes("userEnteredValue")) tab.rows = [];
    if (reset.fields === "userEnteredValue,userEnteredFormat" || reset.fields === "userEnteredFormat") tab.formats = [];
  }
  const width = request["updateDimensionProperties"] as
    | {
        range: { sheetId: number; dimension: string; startIndex: number; endIndex: number };
        properties: { pixelSize: number };
      }
    | undefined;
  if (width !== undefined) {
    const tab = byId(width.range.sheetId);
    if (tab === undefined) return "No such sheet";
    if (width.range.dimension === "ROWS") return null;
    if (width.range.endIndex > tab.columnCount) return "Range exceeds grid limits";
    for (let column = width.range.startIndex; column < width.range.endIndex; column++)
      tab.widths.set(column, width.properties.pixelSize);
  }
  const cells = request["updateCells"] as
    | {
        start: { sheetId: number; rowIndex: number; columnIndex: number };
        rows: {
          values: {
            userEnteredValue?: { numberValue?: number; stringValue?: string };
            userEnteredFormat?: Record<string, unknown>;
          }[];
        }[];
      }
    | undefined;
  if (cells !== undefined) {
    const tab = byId(cells.start.sheetId);
    if (tab === undefined) return "No such sheet";
    for (const [rowOffset, row] of cells.rows.entries()) {
      const rowIndex = cells.start.rowIndex + rowOffset;
      if (rowIndex >= tab.rowCount || cells.start.columnIndex + row.values.length > tab.columnCount)
        return "Range exceeds grid limits";
      tab.rows[rowIndex] = row.values.map(
        (cell) => cell.userEnteredValue?.numberValue ?? cell.userEnteredValue?.stringValue ?? "",
      );
      tab.formats[rowIndex] = row.values.map((cell) => cell.userEnteredFormat ?? null);
    }
  }
  return null;
}
