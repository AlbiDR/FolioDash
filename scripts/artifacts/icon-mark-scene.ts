// The scene of the FolioDash mark: every layer, bottom to top, as plain data that the SVG and pixel drawings both read.

import { at, parseColour, type Stop, type Transform } from "./icon-raster.ts";
import { CANVAS, CUT_X, CUT_Y, FIT, M, SPARK, letterD, letterF, roundRect, shoulder } from "./icon-mark-geometry.ts";

const CARD_RADIUS = 30;

/** 1 is the deepest grid, where the seams are almost the base blue. The owner chose half of that. */
const GRID_STRENGTH = 0.5;

// ---------------------------------------------------------------------------------------------------------------
// The scene

export interface GradientSpec {
  readonly kind: "linear" | "radial";
  /** "box" coordinates are fractions of the shape's own box; "user" coordinates are in the units the shape is drawn in. */
  readonly units: "box" | "user";
  readonly coords: readonly number[];
  readonly stops: readonly Stop[];
}
export interface SolidSpec {
  readonly kind: "solid";
  readonly colour: string;
  readonly alpha: number;
}
export type PaintSpec = SolidSpec | GradientSpec;
export interface Shadow {
  readonly blur: number;
  readonly dy: number;
  readonly colour: string;
  readonly alpha: number;
}
export type SceneNode =
  | {
      readonly type: "fill";
      readonly path: string;
      readonly paint: PaintSpec;
      readonly opacity: number;
      readonly clip: "tile" | "none";
      readonly place: Transform | null;
    }
  | {
      readonly type: "stroke";
      readonly path: string;
      readonly width: number;
      readonly paint: PaintSpec;
      readonly opacity: number;
      readonly clip: "tile" | "self";
      readonly place: Transform | null;
    }
  | {
      readonly type: "halo";
      readonly path: string;
      readonly blur: number;
      readonly colour: string;
      readonly alpha: number;
      readonly place: Transform;
    }
  | {
      readonly type: "lifted";
      readonly shadows: readonly Shadow[];
      readonly members: readonly { readonly path: string; readonly paint: PaintSpec }[];
      readonly place: Transform;
    };

const stop = (offset: number, hex: string, alpha = 1): Stop => ({ offset, colour: parseColour(hex), alpha });
const gradient = (
  kind: "linear" | "radial",
  units: "box" | "user",
  coords: readonly number[],
  stops: readonly Stop[],
): PaintSpec => ({ kind, units, coords, stops });
const flat = (colour: string, alpha = 1): PaintSpec => ({ kind: "solid", colour, alpha });

// Transparent stops carry the colour of their neighbour, so every renderer interpolates them the same way.
const TILE = gradient(
  "linear",
  "box",
  [0.15, 0, 0.55, 1],
  [stop(0, "#5fa0ff"), stop(0.5, "#2c5ff2"), stop(1, "#0c32c0")],
);
const EDGE = gradient(
  "linear",
  "box",
  [0, 0, 0, 1],
  [stop(0, "#ffffff", 0.65), stop(0.22, "#ffffff", 0.08), stop(0.7, "#010a38", 0), stop(1, "#010a38", 0.5)],
);
const GLOW = gradient(
  "radial",
  "box",
  [0.22, 0.04, 0.85],
  [stop(0, "#ffffff", 0.34), stop(0.6, "#ffffff", 0.04), stop(1, "#ffffff", 0)],
);
const VIGNETTE = gradient("radial", "box", [0.5, 0.42, 0.78], [stop(0.55, "#021046", 0), stop(1, "#021046", 0.42)]);
const SHEEN = gradient("linear", "box", [0, 0, 0, 1], [stop(0, "#ffffff", 0.22), stop(1, "#ffffff", 0)]);
const INK = gradient(
  "linear",
  "user",
  [0, M.top, 0, M.bottom],
  [stop(0, "#ffffff"), stop(0.55, "#f1f6ff"), stop(1, "#c9daff")],
);
const AMBER = gradient(
  "linear",
  "user",
  [0, M.top, 0, CUT_Y.from],
  [stop(0, "#ffe49a"), stop(0.5, "#ffbe3d"), stop(1, "#ff9a0f")],
);
const RIM = gradient(
  "linear",
  "box",
  [0, 0, 0, 1],
  [stop(0, "#ffffff", 0.95), stop(0.3, "#ffffff", 0), stop(0.7, "#0a2a9c", 0), stop(1, "#0a2a9c", 0.38)],
);
const RIM_AMBER = gradient(
  "linear",
  "box",
  [0, 0, 0, 1],
  [stop(0, "#ffffff", 0.95), stop(0.35, "#b85a00", 0), stop(1, "#b85a00", 0.45)],
);

// Each card is a vertical gradient of its own, so the cards differ in tone across the seams.
const CARD_TONES: readonly (readonly [string, string])[] = [
  ["#5a9bff", "#2f64f2"],
  ["#4f8dff", "#2559ea"],
  ["#3f78f6", "#1a46d6"],
  ["#356ff0", "#153fcf"],
];

/** Every layer of the mark, bottom to top. `outer` is the tile's corner radius: 112 for rounded icons, 0 for full-bleed ones. */
export function scene(outer: number): readonly SceneNode[] {
  const x0 = Math.round((FIT.dx + FIT.scale * CUT_X.from) * 10) / 10;
  const x1 = Math.round((FIT.dx + FIT.scale * CUT_X.to) * 10) / 10;
  const y0 = Math.round((FIT.dy + FIT.scale * CUT_Y.from) * 10) / 10;
  const y1 = Math.round((FIT.dy + FIT.scale * CUT_Y.to) * 10) / 10;
  const r = CARD_RADIUS;
  const tile = roundRect(0, 0, CANVAS, CANVAS, [outer, outer, outer, outer]);
  const cards = [
    roundRect(0, 0, x0, y0, [outer, r, r, r]),
    roundRect(x1, 0, CANVAS, y0, [r, outer, r, r]),
    roundRect(0, y1, x0, CANVAS, [r, r, r, outer]),
    roundRect(x1, y1, CANVAS, CANVAS, [r, r, outer, r]),
  ];
  const sheenEdge =
    outer > 0
      ? `M0 ${String(outer)}A${String(outer)} ${String(outer)} 0 0 1 ${String(outer)} 0H${String(CANVAS - outer)}A${String(outer)} ${String(outer)} 0 0 1 ${String(CANVAS)} ${String(outer)}`
      : `M0 0H${String(CANVAS)}`;
  const sheen = `${sheenEdge}V196Q${String(CANVAS / 2)} 250 0 196Z`;
  const rim = roundRect(1.5, 1.5, CANVAS - 1.5, CANVAS - 1.5, [
    Math.max(0, outer - 1.5),
    Math.max(0, outer - 1.5),
    Math.max(0, outer - 1.5),
    Math.max(0, outer - 1.5),
  ]);
  const f = letterF();
  const d = letterD();
  const s = shoulder();
  const nodes: SceneNode[] = [
    { type: "fill", path: tile, paint: TILE, opacity: 1, clip: "none", place: null },
    // What shows between the cards: the tile's own blue, deepened by the grid strength.
    { type: "fill", path: tile, paint: flat("#071f86"), opacity: GRID_STRENGTH, clip: "none", place: null },
  ];
  cards.forEach((path, index) => {
    const [top, bottom] = at(CARD_TONES, index);
    nodes.push({
      type: "fill",
      path,
      paint: gradient("linear", "box", [0, 0, 0, 1], [stop(0, top), stop(1, bottom)]),
      opacity: 1,
      clip: "tile",
      place: null,
    });
    nodes.push({ type: "stroke", path, width: 3, paint: EDGE, opacity: GRID_STRENGTH, clip: "tile", place: null });
  });
  nodes.push(
    { type: "fill", path: tile, paint: GLOW, opacity: 1, clip: "none", place: null },
    { type: "fill", path: tile, paint: VIGNETTE, opacity: 1, clip: "none", place: null },
    { type: "fill", path: sheen, paint: SHEEN, opacity: 1, clip: "none", place: null },
    { type: "stroke", path: rim, width: 3, paint: EDGE, opacity: 1, clip: "tile", place: null },
    { type: "halo", path: s, blur: 16, colour: SPARK, alpha: 0.5, place: FIT },
    {
      type: "lifted",
      shadows: [
        { blur: 12, dy: 15, colour: "#020f4a", alpha: 0.55 },
        { blur: 3, dy: 4, colour: "#020f4a", alpha: 0.45 },
      ],
      members: [
        { path: f, paint: INK },
        { path: d, paint: INK },
        { path: s, paint: AMBER },
      ],
      place: FIT,
    },
    { type: "stroke", path: f, width: 5, paint: RIM, opacity: 1, clip: "self", place: FIT },
    { type: "stroke", path: d, width: 5, paint: RIM, opacity: 1, clip: "self", place: FIT },
    { type: "stroke", path: s, width: 5, paint: RIM_AMBER, opacity: 1, clip: "self", place: FIT },
  );
  return nodes;
}
