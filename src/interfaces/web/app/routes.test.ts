import { describe, expect, it } from "vitest";
import { navEntryOf, routeFrom } from "./routes";

describe("routeFrom", () => {
  it("reads the main screens", () => {
    expect(routeFrom("#expenses")).toEqual({ name: "expenses" });
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

describe("activity route", () => {
  it("reads the activity screen and gives it its own navigation entry", () => {
    expect(routeFrom("#activity")).toEqual({ name: "activity" });
    expect(navEntryOf({ name: "activity" })).toBe("activity");
  });
});

describe("navEntryOf", () => {
  it("files the detail screens under the portfolio", () => {
    expect(navEntryOf({ name: "expenses" })).toBe("expenses");
    expect(navEntryOf({ name: "months" })).toBe("overview");
    expect(navEntryOf({ name: "fund", isin: "US0378331005" })).toBe("overview");
    expect(navEntryOf({ name: "import" })).toBe("import");
    expect(navEntryOf({ name: "history" })).toBe("import");
    expect(navEntryOf({ name: "connection" })).toBe("connection");
  });
});

describe("checkpoints route", () => {
  it("reads the checkpoints screen and files it under the portfolio", () => {
    expect(routeFrom("#checkpoints")).toEqual({ name: "checkpoints" });
    expect(navEntryOf({ name: "checkpoints" })).toBe("overview");
  });
});
