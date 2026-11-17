import { describe, expect, it } from "vitest";
import { layerEdges, renderMap } from "../../scripts/docs/repository-map-render";

const sources: Record<string, string> = {
  "src/core/values/money.ts": "export const money = 1;",
  "src/applications/ledger/service.ts": 'import { money } from "../../core/values/money";\nexport const a = money;',
  "src/adapters/google/rest.ts": 'import { a } from "../../applications/ledger/service";\nexport const b = a;',
  "src/interfaces/web/features/import/view.tsx":
    'import { money } from "../../../../core/values/money";\nexport const v = money;',
  "src/interfaces/web/features/history/view.tsx": 'import { v } from "../import/view";\nexport const h = v;',
  "src/core/values/money.test.ts": 'import { b } from "../../adapters/google/rest";',
};
const files = Object.keys(sources);
const read = (file: string): string => sources[file] ?? "";

describe("layer edges", () => {
  it("lists each layer-to-layer import once, in layer order, and merges every feature into one node", () => {
    expect(layerEdges(files, read)).toEqual([
      ["applications", "core"],
      ["adapters", "applications"],
      ["features", "core"],
    ]);
  });
  it("ignores tests, so a test reaching across layers is not drawn as a dependency", () => {
    expect(layerEdges(files, read).some(([from, to]) => from === "core" && to === "adapters")).toBe(false);
  });
});

describe("repository map", () => {
  it("is deterministic and holds a diagram and a folder tree", () => {
    const map = renderMap(files, read);
    expect(renderMap([...files].reverse(), read)).toBe(map);
    expect(map).toContain("flowchart LR");
    expect(map).toContain("applications[applications] --> core[core]");
    expect(map).toContain("├── adapters/");
    expect(map).toContain("│   └── google/");
  });
});
