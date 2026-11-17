// The geometry of the FolioDash mark: the monogram's numbers, its outlines and the rounded rectangles of the tile.

import { type Point, type Transform, at } from "./icon-raster.ts";

export const CANVAS = 512;

// The monogram, in its own units (the supplied artwork was 500 units wide).
const STROKE = 54;
const GAP = 17;
const FILLET = 12;
export const M = {
  left: 54,
  right: 445,
  top: 89,
  bottom: 410,
  stemRight: 54 + STROKE,
  armEnd: 179,
  armTop: 226,
  armBottom: 280,
  dStemLeft: 196,
  dStemRight: 196 + STROKE,
  barBottom: 89 + STROKE,
  stemTop: 89 + STROKE + GAP,
  counterBottom: 410 - STROKE,
  bowlX: 295,
  upperY: 239,
  lowerY: 260,
  outer: 150,
  inner: 150 - STROKE,
} as const;
// The two grid gaps that cut the D's shoulder: a vertical one ends the F's top bar, a horizontal one sits above centre.
export const CUT_X = { from: 290, to: 290 + GAP } as const;
export const CUT_Y = { from: 203, to: 203 + GAP } as const;

// The monogram is centred between its box and its weight (the F is heavy, the bowl is a thin ring) and scaled to fit
// the safe circle with a little margin.
export const FIT: Transform = {
  scale: 0.82,
  dx: Math.round((CANVAS / 2 - 0.82 * 240) * 1000) / 1000,
  dy: Math.round((CANVAS / 2 - 0.82 * 245.6) * 1000) / 1000,
};

export const SPARK = "#ffb02e";

// ---------------------------------------------------------------------------------------------------------------
// Paths

export const tenth = (value: number): string => String(Math.round(value * 10) / 10);
const at2 = (point: Point): string => `${tenth(point[0])} ${tenth(point[1])}`;

interface Node {
  readonly p: Point;
  readonly r: number;
}
type Edge =
  | { readonly kind: "line" }
  | { readonly kind: "arc"; readonly centre: Point; readonly radius: number; readonly clockwise: boolean };
const LINE: Edge = { kind: "line" };
const arcAround = (centre: Point, radius: number, clockwise: boolean): Edge => ({
  kind: "arc",
  centre,
  radius,
  clockwise,
});
const corner = (x: number, y: number, r = FILLET): Node => ({ p: [x, y], r });
const smooth = (x: number, y: number): Node => ({ p: [x, y], r: 0 });

const wrap = <T>(items: readonly T[], index: number): T =>
  at(items, ((index % items.length) + items.length) % items.length);
const unit = (from: Point, to: Point): Point => {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  return [(to[0] - from[0]) / length, (to[1] - from[1]) / length];
};
const turn = (a: Point, b: Point): number => a[0] * b[1] - a[1] * b[0];

/** The fillet circle between a straight edge and an arc, as the points where it touches each. */
function filletLineArc(
  corner: Point,
  direction: Point,
  arcEdge: Extract<Edge, { kind: "arc" }>,
  r: number,
): { readonly onLine: Point; readonly onArc: Point } {
  const inward: Point = [-direction[1], direction[0]];
  const target = arcEdge.clockwise ? arcEdge.radius - r : arcEdge.radius + r;
  const w: Point = [corner[0] + r * inward[0] - arcEdge.centre[0], corner[1] + r * inward[1] - arcEdge.centre[1]];
  const along = w[0] * direction[0] + w[1] * direction[1];
  const discriminant = along * along - (w[0] * w[0] + w[1] * w[1]) + target * target;
  if (discriminant < 0) throw new Error("A corner is too tight for its fillet");
  const roots = [-along + Math.sqrt(discriminant), -along - Math.sqrt(discriminant)];
  const t = Math.abs(at(roots, 0)) < Math.abs(at(roots, 1)) ? at(roots, 0) : at(roots, 1);
  const centre: Point = [corner[0] + t * direction[0] + r * inward[0], corner[1] + t * direction[1] + r * inward[1]];
  const scale = arcEdge.radius / Math.hypot(centre[0] - arcEdge.centre[0], centre[1] - arcEdge.centre[1]);
  return {
    onLine: [centre[0] - r * inward[0], centre[1] - r * inward[1]],
    onArc: [
      arcEdge.centre[0] + (centre[0] - arcEdge.centre[0]) * scale,
      arcEdge.centre[1] + (centre[1] - arcEdge.centre[1]) * scale,
    ],
  };
}

/** A clockwise outline of nodes joined by lines or circular arcs, with every corner rounded by its own fillet. */
function outline(nodes: readonly Node[], edges: readonly Edge[]): string {
  const corners = nodes.map((node, index) => {
    if (node.r === 0) return { into: node.p, out: node.p, r: 0, sweep: 1 };
    const before = wrap(nodes, index - 1).p;
    const after = wrap(nodes, index + 1).p;
    const edgeIn = wrap(edges, index - 1);
    const edgeOut = wrap(edges, index);
    if (edgeIn.kind === "line" && edgeOut.kind === "line") {
      const incoming = unit(before, node.p);
      const outgoing = unit(node.p, after);
      const angle = Math.acos(Math.max(-1, Math.min(1, incoming[0] * outgoing[0] + incoming[1] * outgoing[1])));
      const reach = node.r * Math.tan(angle / 2);
      return {
        into: [node.p[0] - incoming[0] * reach, node.p[1] - incoming[1] * reach] as Point,
        out: [node.p[0] + outgoing[0] * reach, node.p[1] + outgoing[1] * reach] as Point,
        r: node.r,
        sweep: turn(incoming, outgoing) > 0 ? 1 : 0,
      };
    }
    if (edgeIn.kind === "line" && edgeOut.kind === "arc") {
      const touch = filletLineArc(node.p, unit(before, node.p), edgeOut, node.r);
      return { into: touch.onLine, out: touch.onArc, r: node.r, sweep: 1 };
    }
    if (edgeIn.kind === "arc" && edgeOut.kind === "line") {
      const touch = filletLineArc(node.p, unit(node.p, after), edgeIn, node.r);
      return { into: touch.onArc, out: touch.onLine, r: node.r, sweep: 1 };
    }
    throw new Error("Unsupported corner");
  });
  let path = `M${at2(at(corners, 0).out)}`;
  for (let index = 0; index < nodes.length; index++) {
    const edge = at(edges, index);
    const next = wrap(corners, index + 1);
    path +=
      edge.kind === "line"
        ? `L${at2(next.into)}`
        : `A${tenth(edge.radius)} ${tenth(edge.radius)} 0 0 ${edge.clockwise ? "1" : "0"} ${at2(next.into)}`;
    if (next.r > 0) path += `A${String(next.r)} ${String(next.r)} 0 0 ${String(next.sweep)} ${at2(next.out)}`;
  }
  return `${path}Z`;
}

const upper: Point = [M.bowlX, M.upperY];
const lower: Point = [M.bowlX, M.lowerY];
const onCircle = (centreY: number, radius: number, y: number): number =>
  M.bowlX + Math.sqrt(radius * radius - (y - centreY) * (y - centreY));
const aboveCentre = (radius: number, x: number): number =>
  M.upperY - Math.sqrt(radius * radius - (x - M.bowlX) * (x - M.bowlX));

/** The F: its stem, its middle arm and the whole top bar, up to the vertical gap. */
export const letterF = (): string =>
  outline(
    [
      corner(M.left, M.top),
      corner(CUT_X.from, M.top),
      corner(CUT_X.from, M.barBottom),
      corner(M.stemRight, M.barBottom),
      corner(M.stemRight, M.armTop),
      corner(M.armEnd, M.armTop),
      corner(M.armEnd, M.armBottom),
      corner(M.stemRight, M.armBottom),
      corner(M.stemRight, M.bottom),
      corner(M.left, M.bottom),
    ],
    Array.from({ length: 10 }, () => LINE),
  );

/** The D below the horizontal gap: its stem, bottom bar and lower bowl, as one connected piece. */
export const letterD = (): string =>
  outline(
    [
      corner(M.dStemLeft, M.stemTop),
      corner(M.dStemRight, M.stemTop),
      corner(M.dStemRight, M.counterBottom),
      smooth(M.bowlX, M.counterBottom),
      smooth(M.bowlX + M.inner, M.lowerY),
      smooth(M.bowlX + M.inner, M.upperY),
      corner(onCircle(M.upperY, M.inner, CUT_Y.to), CUT_Y.to),
      corner(onCircle(M.upperY, M.outer, CUT_Y.to), CUT_Y.to),
      smooth(M.right, M.upperY),
      smooth(M.right, M.lowerY),
      smooth(M.bowlX, M.bottom),
      corner(M.dStemLeft, M.bottom),
    ],
    [
      LINE,
      LINE,
      LINE,
      arcAround(lower, M.inner, false),
      LINE,
      arcAround(upper, M.inner, false),
      LINE,
      arcAround(upper, M.outer, true),
      LINE,
      arcAround(lower, M.outer, true),
      LINE,
      LINE,
    ],
  );

/** The D's shoulder, the one amber piece: the bowl's upper arc, between the two gaps. */
export const shoulder = (): string =>
  outline(
    [
      corner(CUT_X.to, aboveCentre(M.outer, CUT_X.to)),
      corner(onCircle(M.upperY, M.outer, CUT_Y.from), CUT_Y.from),
      corner(onCircle(M.upperY, M.inner, CUT_Y.from), CUT_Y.from),
      corner(CUT_X.to, aboveCentre(M.inner, CUT_X.to)),
    ],
    [arcAround(upper, M.outer, true), LINE, arcAround(upper, M.inner, false), LINE],
  );

/** A rectangle with its own radius at each corner, clockwise from the top left. A radius of zero is a square corner. */
export function roundRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radii: readonly [number, number, number, number],
): string {
  const [tl, tr, br, bl] = radii;
  const arcTo = (radius: number, x: number, y: number): string =>
    radius > 0 ? `A${tenth(radius)} ${tenth(radius)} 0 0 1 ${tenth(x)} ${tenth(y)}` : "";
  return `M${tenth(x0 + tl)} ${tenth(y0)}H${tenth(x1 - tr)}${arcTo(tr, x1, y0 + tr)}V${tenth(y1 - br)}${arcTo(br, x1 - br, y1)}H${tenth(x0 + bl)}${arcTo(bl, x0, y1 - bl)}V${tenth(y0 + tl)}${arcTo(tl, x0 + tl, y0)}Z`;
}
