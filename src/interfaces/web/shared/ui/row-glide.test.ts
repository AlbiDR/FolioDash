import { afterEach, describe, expect, it, vi } from "vitest";
import { createRowGlide, glideDistance, translationY } from "./row-glide";

describe("glideDistance", () => {
  it("starts a row where it was drawn and ends it where it now sits", () => {
    expect(glideDistance(100, 0, 40)).toBe(60);
    expect(glideDistance(40, 0, 100)).toBe(-60);
  });

  it("includes a glide still running, so a re-sort never jumps", () => {
    expect(glideDistance(100, 10, 40)).toBe(70);
    expect(glideDistance(100, -15, 40)).toBe(45);
  });

  it("draws nothing for a row that has not moved or moved less than half a pixel", () => {
    expect(glideDistance(100, 0, 100)).toBe(0);
    expect(glideDistance(100, 0, 100.3)).toBe(0);
    expect(glideDistance(100, 0, 99.6)).toBe(0);
  });
});

describe("translationY", () => {
  it("reads the vertical translation of a computed matrix", () => {
    expect(translationY("matrix(1, 0, 0, 1, 0, -12.5)")).toBe(-12.5);
    expect(translationY("matrix(1, 0, 0, 1, 4, 30)")).toBe(30);
  });

  it("reads zero when no transform applies or the value cannot be read", () => {
    expect(translationY("none")).toBe(0);
    expect(translationY("")).toBe(0);
    expect(translationY("matrix(1, 0, 0, 1, 0)")).toBe(0);
    expect(translationY("translate(2px)")).toBe(0);
  });
});

/** A row as the controller sees it: a box, a running transform and a fake Web Animations `animate`. */
function makeRow(top: number, height = 40) {
  const animations: { keyframes: unknown; options: unknown; cancel: ReturnType<typeof vi.fn> }[] = [];
  const row = {
    top,
    height,
    transform: "none",
    animations,
    getBoundingClientRect: () => ({ top: row.top, height: row.height }),
    animate: vi.fn((keyframes: unknown, options: unknown) => {
      const animation = { keyframes, options, cancel: vi.fn() };
      animations.push(animation);
      return animation;
    }),
  };
  return row;
}

function setup(
  rows: ReturnType<typeof makeRow>[],
  { reduced = false, rootTop = () => 0 }: { reduced?: boolean; rootTop?: () => number } = {},
) {
  const node = { querySelectorAll: () => rows, getBoundingClientRect: () => ({ top: rootTop() }) };
  vi.stubGlobal("window", { scrollY: 0, matchMedia: () => ({ matches: reduced }) });
  vi.stubGlobal("getComputedStyle", (element: { transform?: string }) => ({
    transform: element.transform ?? "none",
    getPropertyValue: (name: string) =>
      ({ "--duration-medium": "380ms", "--ease-standard": " cubic-bezier(0.2, 0, 0, 1) " })[name] ?? "",
  }));
  return createRowGlide(() => node as unknown as HTMLElement, "tr");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createRowGlide", () => {
  it("ignores the card's own movement while preserving movement of a row inside it", () => {
    let top = 100;
    const row = makeRow(160);
    const glide = setup([row], { rootTop: () => top });
    glide.settle("all");
    top = 200;
    row.top = 260;
    glide.settle("filtered");
    expect(row.animate).not.toHaveBeenCalled();
    row.top = 240;
    glide.settle("sorted");
    expect(row.animate.mock.calls[0]?.[0]).toEqual([
      { transform: "translateY(20.00px)" },
      { transform: "translateY(0px)" },
    ]);
  });
  it("records resting positions on the first settle without moving anything", () => {
    const row = makeRow(100);
    setup([row]).settle("name:asc");
    expect(row.animate).not.toHaveBeenCalled();
  });

  it("glides a row from where it was drawn to where it now sits, in one shared duration and easing", () => {
    const row = makeRow(100);
    const glide = setup([row]);
    glide.settle("name:asc");
    row.top = 40;
    glide.settle("value:desc");
    expect(row.animate).toHaveBeenCalledOnce();
    expect(row.animate.mock.calls[0]).toEqual([
      [{ transform: "translateY(60.00px)" }, { transform: "translateY(0px)" }],
      { duration: 380, easing: "cubic-bezier(0.2, 0, 0, 1)" },
    ]);
  });

  it("does not glide when the order is unchanged, though the rows move", () => {
    const row = makeRow(100);
    const glide = setup([row]);
    glide.settle("value:desc");
    row.top = 40;
    glide.settle("value:desc");
    expect(row.animate).not.toHaveBeenCalled();
  });

  it("carries a glide still running into the next re-sort, so the row does not jump", () => {
    const row = makeRow(100);
    const glide = setup([row]);
    glide.settle("name:asc");
    row.top = 40;
    glide.settle("value:desc");
    const first = row.animations[0];
    if (first === undefined) throw new Error("expected a glide");
    // The first glide is 20px along its way when the order changes again.
    row.transform = "matrix(1, 0, 0, 1, 0, 20)";
    row.top = 0;
    glide.settle("share:desc");
    expect(first.cancel).toHaveBeenCalledOnce();
    expect(row.animate).toHaveBeenLastCalledWith(
      [{ transform: "translateY(60.00px)" }, { transform: "translateY(0px)" }],
      expect.any(Object),
    );
  });

  it("measures the resting position without a running glide when the order is unchanged", () => {
    const row = makeRow(100);
    const glide = setup([row]);
    glide.settle("name:asc");
    // The box includes a 20px glide still running, so the resting top is 40.
    row.top = 60;
    row.transform = "matrix(1, 0, 0, 1, 0, 20)";
    glide.settle("name:asc");
    expect(row.animate).not.toHaveBeenCalled();
    row.top = 0;
    row.transform = "none";
    glide.settle("value:desc");
    expect(row.animate.mock.calls[0]?.[0]).toEqual([
      { transform: "translateY(40.00px)" },
      { transform: "translateY(0px)" },
    ]);
  });

  it("takes the new place at once under reduced motion, while still recording it", () => {
    const row = makeRow(100);
    const glide = setup([row], { reduced: true });
    glide.settle("name:asc");
    row.top = 40;
    glide.settle("value:desc");
    expect(row.animate).not.toHaveBeenCalled();
  });

  it("does not draw a movement under half a pixel", () => {
    const row = makeRow(100);
    const glide = setup([row]);
    glide.settle("name:asc");
    row.top = 100.2;
    glide.settle("value:desc");
    expect(row.animate).not.toHaveBeenCalled();
  });

  it("skips a row that is not drawn and forgets its position", () => {
    const row = makeRow(100, 0);
    const glide = setup([row]);
    glide.settle("name:asc");
    row.top = 40;
    row.height = 40;
    glide.settle("value:desc");
    expect(row.animate).not.toHaveBeenCalled();
  });

  it("does nothing for rows without the Web Animations API", () => {
    const row = makeRow(100);
    Reflect.deleteProperty(row, "animate");
    const glide = setup([row]);
    glide.settle("name:asc");
    row.top = 40;
    expect(() => {
      glide.settle("value:desc");
    }).not.toThrow();
  });

  it("does nothing when its root is not in the document", () => {
    vi.stubGlobal("window", { scrollY: 0, matchMedia: () => ({ matches: false }) });
    const glide = createRowGlide(() => null, "tr");
    expect(() => {
      glide.settle("value:desc");
    }).not.toThrow();
  });
});
