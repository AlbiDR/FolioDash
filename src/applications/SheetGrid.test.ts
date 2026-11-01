import { describe, expect, it } from "vitest";
import { BUFFER_WIDTH, EMPTY_CELL, bufferedGrid, plainCell, rawCell } from "./SheetGrid";

const values = (grid: ReturnType<typeof bufferedGrid>): (string | number)[][] => grid.cells.map((row) => row.map((cell) => cell.value));

describe("bufferedGrid", () => {
  it("keeps an existing empty first row and column and closes the far sides with one more of each", () => {
    const grid = bufferedGrid([[], [EMPTY_CELL, plainCell("a"), plainCell("b")]]);
    expect(values(grid)).toEqual([["", "", "", ""], ["", "a", "b", ""], ["", "", "", ""]]);
  });

  it("adds an empty first row and column when the data touches the edge", () => {
    expect(values(bufferedGrid([[plainCell("a")]]))).toEqual([["", "", ""], ["", "a", ""], ["", "", ""]]);
  });

  it("drops trailing empty rows and columns, so nothing beyond the data and the margin remains", () => {
    const grid = bufferedGrid([[], [EMPTY_CELL, plainCell("a"), EMPTY_CELL, EMPTY_CELL, EMPTY_CELL], [], [], []]);
    expect(grid.cells).toHaveLength(3);
    expect(grid.cells[0]).toHaveLength(3);
    expect(grid.widths).toHaveLength(3);
  });

  it("makes the margin columns narrow and keeps the widths of the data columns, shifted with the data", () => {
    const grid = bufferedGrid([[plainCell("a"), plainCell("b")]], [200, 90]);
    expect(grid.widths).toEqual([BUFFER_WIDTH, 200, 90, BUFFER_WIDTH]);
  });

  it("gives an empty sheet a margin only", () => {
    expect(values(bufferedGrid([]))).toEqual([[""]]);
  });
});

describe("rawCell", () => {
  it("keeps text, writes a number only when nothing is lost, and leaves formulas and gaps empty", () => {
    expect(rawCell({ kind: "text", text: "Fondi" }).value).toBe("Fondi");
    expect(rawCell({ kind: "number", text: "652.289", format: null }).value).toBe(652.289);
    expect(rawCell({ kind: "number", text: "1.10", format: null }).value).toBe("1.10");
    expect(rawCell({ kind: "formula" }).value).toBe("");
    expect(rawCell(undefined).value).toBe("");
  });
});
