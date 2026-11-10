import { describe, expect, it } from "vitest";
import { discoverInteractions, inventoryTable } from "../../scripts/interactionInventory";

describe("interaction discovery", () => {
  it("finds conditional/repeated native controls, SVG marks and inspection regions", () => {
    const found = discoverInteractions([{ file: "src/interfaces/web/Test.tsx", text: `
      <section>{ready && <button disabled={busy}>Save</button>}{rows.map(row => <a href={row.url}>Open</a>)}
      <input type="radio" /><input type="range" /><select /><textarea />
      <details><summary>More</summary></details><svg onPointerMove={inspect}><g role="button" tabIndex={-1} /><a href="#fund" /></svg>
      <div tabIndex={0} role="region" /><h2 tabIndex={-1}>Heading</h2><input type="hidden" /></section>` }]);
    expect(found.map(entry => entry.family)).toEqual(["action", "action", "choice", "slider", "field", "field", "action", "chart-inspection", "chart-mark", "chart-mark", "scroll-region"]);
  });
  it("flags newly introduced custom click targets instead of silently treating them as covered", () => {
    expect(discoverInteractions([{ file: "new.tsx", text: '<div onClick={go}>Go</div>' }])[0]?.family).toBe("unclassified");
    expect(discoverInteractions([{ file: "new.tsx", text: '<div role="button" onClick={go}>Go</div>' }])[0]?.family).toBe("action");
  });
  it("ignores event delegation and programmatic focus landmarks", () => {
    expect(discoverInteractions([{ file: "shell.tsx", text: '<main tabIndex={-1} onKeyDown={escape} onClickCapture={guard}><h1 tabIndex={-1}>Title</h1></main>' }])).toEqual([]);
  });
  it("keeps identities across line shifts but detects a changed control and new duplicates", () => {
    const source = '<button type="button">Action</button>';
    const scan = (text: string) => discoverInteractions([{ file: "control.tsx", text }]);
    expect(scan(source)[0]?.id).toBe(scan(`\n\n${source}`)[0]?.id);
    expect(scan(source)[0]?.id).not.toBe(scan('<button type="submit">Action</button>')[0]?.id);
    expect(scan(source)[0]?.id).not.toBe(scan('<button type="button">Delete</button>')[0]?.id);
    const repeated = scan(`<div>${source}${source}</div>`);
    expect(new Set(repeated.map(entry => entry.id)).size).toBe(2);
  });
  it("escapes table content and never calls source coverage visual verification", () => {
    const table = inventoryTable(discoverInteractions([{ file: "control.tsx", text: '<button aria-label="A | B">Action</button>' }]));
    expect(table).toContain("A &#124; B");
    expect(table).toContain("STATES OPEN");
    expect(table).not.toContain("VERIFIED");
  });
});

it("preserves explicit state reviews and leaves newly discovered controls open", () => {
  const first = discoverInteractions([{ file: "control.tsx", text: '<button type="button">Action</button>' }]);
  const id = first[0]?.id ?? "";
  const changed = discoverInteractions([{ file: "control.tsx", text: '<div><button type="button">Action</button><input /></div>' }]);
  const table = inventoryTable(changed, new Map([[id, "Chrome hover/focus checked; pending OPEN"]]));
  expect(table).toContain("Chrome hover/focus checked; pending OPEN");
  expect(table).toContain("SOURCE CLASSIFIED; STATES OPEN");
  expect(inventoryTable(first)).not.toBe(inventoryTable(changed));
});
