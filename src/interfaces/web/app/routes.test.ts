import { describe, expect, it } from "vitest";
import { navEntryOf, routeFrom } from "./routes";

describe("routeFrom", () => {
  it("reads the main screens", () => {
    expect(routeFrom("#import")).toEqual({ name: "import" });
    expect(routeFrom("#history")).toEqual({ name: "history" });
    expect(routeFrom("#connection")).toEqual({ name: "connection" });
    expect(routeFrom("#months")).toEqual({ name: "months" });
  });

  it("reads a fund by a valid identifier only", () => {
    expect(routeFrom("#fund/US0378331005")).toEqual({ name: "fund", isin: "US0378331005" });
    expect(routeFrom("#fund/US0378331006")).toEqual({ name: "overview" });
    expect(routeFrom("#fund/")).toEqual({ name: "overview" });
    expect(routeFrom("#fund/<script>")).toEqual({ name: "overview" });
  });

  it("falls back to the overview for anything unknown or empty", () => {
    for (const hash of ["", "#", "#overview", "#nonsense"]) expect(routeFrom(hash)).toEqual({ name: "overview" });
  });
});

describe("navEntryOf", () => {
  it("files the detail screens under the portfolio", () => {
    expect(navEntryOf({ name: "months" })).toBe("overview");
    expect(navEntryOf({ name: "fund", isin: "US0378331005" })).toBe("overview");
    expect(navEntryOf({ name: "import" })).toBe("import");
  });
});
