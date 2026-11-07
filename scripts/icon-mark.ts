// The FolioDash mark (FD-024): the owner's FD monogram on a tile cut into bento cards.
// One scene, described once with the numbers below, is drawn two ways: as SVG text (icon.svg and the social
// banner) and into pixels by icon-raster.ts (every PNG). Nothing else in the repository draws the mark.
//
// The monogram is the owner's FD, traced to a single stroke width. The grid gaps of the tile are the very gaps
// that cut the D's shoulder, so the letter reads as carved from the same dashboard the tile is made of.

import {
  Canvas,
  at,
  blur,
  boundaryDistance,
  bounds,
  fillMask,
  flattenPath,
  linear,
  parseColour,
  place,
  radial,
  solid,
  strokeCoverage,
  type Paint,
  type Point,
  type Polygon,
  type Stop,
  type Transform,
} from "./icon-raster.ts";

export const CANVAS = 512;
export const TILE_RADIUS = 112;
/** The mark's foreground must stay inside this circle so any launcher mask keeps it whole (Android's safe zone). */
export const SAFE_RADIUS = CANVAS * 0.4;
const RESOLUTION = 2; // the master image is drawn at twice the canvas size, then reduced
const CARD_RADIUS = 30;
/** 1 is the deepest grid, where the seams are almost the base blue. The owner chose half of that. */
const GRID_STRENGTH = 0.5;

// The monogram, in its own units (the supplied artwork was 500 units wide).
const STROKE = 54;
const GAP = 17;
const FILLET = 12;
const M = {
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
const CUT_X = { from: 290, to: 290 + GAP } as const;
const CUT_Y = { from: 203, to: 203 + GAP } as const;

// The monogram is centred between its box and its weight (the F is heavy, the bowl is a thin ring) and scaled to fit
// the safe circle with a little margin.
const FIT: Transform = {
  scale: 0.82,
  dx: Math.round((CANVAS / 2 - 0.82 * 240) * 1000) / 1000,
  dy: Math.round((CANVAS / 2 - 0.82 * 245.6) * 1000) / 1000,
};

const SPARK = "#ffb02e";

// ---------------------------------------------------------------------------------------------------------------
// Paths

const hex = (colour: readonly [number, number, number]): string => `#${colour.map((channel) => Math.round(channel * 255).toString(16).padStart(2, "0")).join("")}`;
const tenth = (value: number): string => String(Math.round(value * 10) / 10);
const at2 = (point: Point): string => `${tenth(point[0])} ${tenth(point[1])}`;

interface Node {
  readonly p: Point;
  readonly r: number;
}
type Edge = { readonly kind: "line" } | { readonly kind: "arc"; readonly centre: Point; readonly radius: number; readonly clockwise: boolean };
const LINE: Edge = { kind: "line" };
const arcAround = (centre: Point, radius: number, clockwise: boolean): Edge => ({ kind: "arc", centre, radius, clockwise });
const corner = (x: number, y: number, r = FILLET): Node => ({ p: [x, y], r });
const smooth = (x: number, y: number): Node => ({ p: [x, y], r: 0 });

const wrap = <T>(items: readonly T[], index: number): T => at(items, ((index % items.length) + items.length) % items.length);
const unit = (from: Point, to: Point): Point => {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  return [(to[0] - from[0]) / length, (to[1] - from[1]) / length];
};
const turn = (a: Point, b: Point): number => a[0] * b[1] - a[1] * b[0];

/** The fillet circle between a straight edge and an arc, as the points where it touches each. */
function filletLineArc(corner: Point, direction: Point, arcEdge: Extract<Edge, { kind: "arc" }>, r: number): { readonly onLine: Point; readonly onArc: Point } {
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
    onArc: [arcEdge.centre[0] + (centre[0] - arcEdge.centre[0]) * scale, arcEdge.centre[1] + (centre[1] - arcEdge.centre[1]) * scale],
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
    path += edge.kind === "line" ? `L${at2(next.into)}` : `A${tenth(edge.radius)} ${tenth(edge.radius)} 0 0 ${edge.clockwise ? "1" : "0"} ${at2(next.into)}`;
    if (next.r > 0) path += `A${String(next.r)} ${String(next.r)} 0 0 ${String(next.sweep)} ${at2(next.out)}`;
  }
  return `${path}Z`;
}

const upper: Point = [M.bowlX, M.upperY];
const lower: Point = [M.bowlX, M.lowerY];
const onCircle = (centreY: number, radius: number, y: number): number => M.bowlX + Math.sqrt(radius * radius - (y - centreY) * (y - centreY));
const aboveCentre = (radius: number, x: number): number => M.upperY - Math.sqrt(radius * radius - (x - M.bowlX) * (x - M.bowlX));

/** The F: its stem, its middle arm and the whole top bar, up to the vertical gap. */
const letterF = (): string =>
  outline(
    [corner(M.left, M.top), corner(CUT_X.from, M.top), corner(CUT_X.from, M.barBottom), corner(M.stemRight, M.barBottom), corner(M.stemRight, M.armTop), corner(M.armEnd, M.armTop), corner(M.armEnd, M.armBottom), corner(M.stemRight, M.armBottom), corner(M.stemRight, M.bottom), corner(M.left, M.bottom)],
    Array.from({ length: 10 }, () => LINE),
  );

/** The D below the horizontal gap: its stem, bottom bar and lower bowl, as one connected piece. */
const letterD = (): string =>
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
    [LINE, LINE, LINE, arcAround(lower, M.inner, false), LINE, arcAround(upper, M.inner, false), LINE, arcAround(upper, M.outer, true), LINE, arcAround(lower, M.outer, true), LINE, LINE],
  );

/** The D's shoulder, the one amber piece: the bowl's upper arc, between the two gaps. */
const shoulder = (): string =>
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
function roundRect(x0: number, y0: number, x1: number, y1: number, radii: readonly [number, number, number, number]): string {
  const [tl, tr, br, bl] = radii;
  const arcTo = (radius: number, x: number, y: number): string => (radius > 0 ? `A${tenth(radius)} ${tenth(radius)} 0 0 1 ${tenth(x)} ${tenth(y)}` : "");
  return `M${tenth(x0 + tl)} ${tenth(y0)}H${tenth(x1 - tr)}${arcTo(tr, x1, y0 + tr)}V${tenth(y1 - br)}${arcTo(br, x1 - br, y1)}H${tenth(x0 + bl)}${arcTo(bl, x0, y1 - bl)}V${tenth(y0 + tl)}${arcTo(tl, x0 + tl, y0)}Z`;
}

// ---------------------------------------------------------------------------------------------------------------
// The scene

interface GradientSpec {
  readonly kind: "linear" | "radial";
  /** "box" coordinates are fractions of the shape's own box; "user" coordinates are in the units the shape is drawn in. */
  readonly units: "box" | "user";
  readonly coords: readonly number[];
  readonly stops: readonly Stop[];
}
interface SolidSpec {
  readonly kind: "solid";
  readonly colour: string;
  readonly alpha: number;
}
type PaintSpec = SolidSpec | GradientSpec;
interface Shadow {
  readonly blur: number;
  readonly dy: number;
  readonly colour: string;
  readonly alpha: number;
}
type SceneNode =
  | { readonly type: "fill"; readonly path: string; readonly paint: PaintSpec; readonly opacity: number; readonly clip: "tile" | "none"; readonly place: Transform | null }
  | { readonly type: "stroke"; readonly path: string; readonly width: number; readonly paint: PaintSpec; readonly opacity: number; readonly clip: "tile" | "self"; readonly place: Transform | null }
  | { readonly type: "halo"; readonly path: string; readonly blur: number; readonly colour: string; readonly alpha: number; readonly place: Transform }
  | { readonly type: "lifted"; readonly shadows: readonly Shadow[]; readonly members: readonly { readonly path: string; readonly paint: PaintSpec }[]; readonly place: Transform };

const stop = (offset: number, hex: string, alpha = 1): Stop => ({ offset, colour: parseColour(hex), alpha });
const gradient = (kind: "linear" | "radial", units: "box" | "user", coords: readonly number[], stops: readonly Stop[]): PaintSpec => ({ kind, units, coords, stops });
const flat = (colour: string, alpha = 1): PaintSpec => ({ kind: "solid", colour, alpha });

// Transparent stops carry the colour of their neighbour, so every renderer interpolates them the same way.
const TILE = gradient("linear", "box", [0.15, 0, 0.55, 1], [stop(0, "#5fa0ff"), stop(0.5, "#2c5ff2"), stop(1, "#0c32c0")]);
const EDGE = gradient("linear", "box", [0, 0, 0, 1], [stop(0, "#ffffff", 0.65), stop(0.22, "#ffffff", 0.08), stop(0.7, "#010a38", 0), stop(1, "#010a38", 0.5)]);
const GLOW = gradient("radial", "box", [0.22, 0.04, 0.85], [stop(0, "#ffffff", 0.34), stop(0.6, "#ffffff", 0.04), stop(1, "#ffffff", 0)]);
const VIGNETTE = gradient("radial", "box", [0.5, 0.42, 0.78], [stop(0.55, "#021046", 0), stop(1, "#021046", 0.42)]);
const SHEEN = gradient("linear", "box", [0, 0, 0, 1], [stop(0, "#ffffff", 0.22), stop(1, "#ffffff", 0)]);
const INK = gradient("linear", "user", [0, M.top, 0, M.bottom], [stop(0, "#ffffff"), stop(0.55, "#f1f6ff"), stop(1, "#c9daff")]);
const AMBER = gradient("linear", "user", [0, M.top, 0, CUT_Y.from], [stop(0, "#ffe49a"), stop(0.5, "#ffbe3d"), stop(1, "#ff9a0f")]);
const RIM = gradient("linear", "box", [0, 0, 0, 1], [stop(0, "#ffffff", 0.95), stop(0.3, "#ffffff", 0), stop(0.7, "#0a2a9c", 0), stop(1, "#0a2a9c", 0.38)]);
const RIM_AMBER = gradient("linear", "box", [0, 0, 0, 1], [stop(0, "#ffffff", 0.95), stop(0.35, "#b85a00", 0), stop(1, "#b85a00", 0.45)]);

// Each card is a vertical gradient of its own, so the cards differ in tone across the seams.
const CARD_TONES: readonly (readonly [string, string])[] = [["#5a9bff", "#2f64f2"], ["#4f8dff", "#2559ea"], ["#3f78f6", "#1a46d6"], ["#356ff0", "#153fcf"]];

/** Every layer of the mark, bottom to top. `outer` is the tile's corner radius: 112 for rounded icons, 0 for full-bleed ones. */
function scene(outer: number): readonly SceneNode[] {
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
  const sheenEdge = outer > 0 ? `M0 ${String(outer)}A${String(outer)} ${String(outer)} 0 0 1 ${String(outer)} 0H${String(CANVAS - outer)}A${String(outer)} ${String(outer)} 0 0 1 ${String(CANVAS)} ${String(outer)}` : `M0 0H${String(CANVAS)}`;
  const sheen = `${sheenEdge}V196Q${String(CANVAS / 2)} 250 0 196Z`;
  const rim = roundRect(1.5, 1.5, CANVAS - 1.5, CANVAS - 1.5, [Math.max(0, outer - 1.5), Math.max(0, outer - 1.5), Math.max(0, outer - 1.5), Math.max(0, outer - 1.5)]);
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
    nodes.push({ type: "fill", path, paint: gradient("linear", "box", [0, 0, 0, 1], [stop(0, top), stop(1, bottom)]), opacity: 1, clip: "tile", place: null });
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

// ---------------------------------------------------------------------------------------------------------------
// As SVG

/** The scene as SVG elements, with every id starting with `prefix` so the mark can sit inside another drawing. */
export function markSvgBody(outer: number, prefix: string): string {
  const defs: string[] = [];
  const body: string[] = [];
  let counter = 0;
  const identify = (kind: string): string => `${prefix}${kind}${String(++counter)}`;
  const tileId = `${prefix}tile`;
  defs.push(`<clipPath id="${tileId}"><path d="${roundRect(0, 0, CANVAS, CANVAS, [outer, outer, outer, outer])}"/></clipPath>`);
  const stopsSvg = (stops: readonly Stop[]): string =>
    stops
      .map((s) => `<stop offset="${String(s.offset)}" stop-color="${hex(s.colour)}"${s.alpha < 1 ? ` stop-opacity="${String(s.alpha)}"` : ""}/>`)
      .join("");
  const paintAttr = (paint: PaintSpec, attribute: "fill" | "stroke"): string => {
    if (paint.kind === "solid") return `${attribute}="${paint.colour}"${paint.alpha < 1 ? ` ${attribute}-opacity="${String(paint.alpha)}"` : ""}`;
    const id = identify("g");
    const units = paint.units === "user" ? ' gradientUnits="userSpaceOnUse"' : "";
    const [a = 0, b = 0, c = 0, e = 0] = paint.coords;
    defs.push(
      paint.kind === "linear"
        ? `<linearGradient id="${id}"${units} x1="${String(a)}" y1="${String(b)}" x2="${String(c)}" y2="${String(e)}">${stopsSvg(paint.stops)}</linearGradient>`
        : `<radialGradient id="${id}"${units} cx="${String(a)}" cy="${String(b)}" r="${String(c)}">${stopsSvg(paint.stops)}</radialGradient>`,
    );
    return `${attribute}="url(#${id})"`;
  };
  const withPlace = (transform: Transform | null, content: string): string => (transform === null ? content : `<g transform="translate(${String(transform.dx)} ${String(transform.dy)}) scale(${String(transform.scale)})">${content}</g>`);
  for (const node of scene(outer)) {
    if (node.type === "fill") {
      const opacity = node.opacity < 1 ? ` opacity="${String(node.opacity)}"` : "";
      const clip = node.clip === "tile" ? ` clip-path="url(#${tileId})"` : "";
      body.push(withPlace(node.place, `<path d="${node.path}" ${paintAttr(node.paint, "fill")}${opacity}${clip}/>`));
    } else if (node.type === "stroke") {
      const opacity = node.opacity < 1 ? ` stroke-opacity="${String(node.opacity)}"` : "";
      let clip = node.clip === "tile" ? ` clip-path="url(#${tileId})"` : "";
      if (node.clip === "self") {
        const id = identify("c");
        defs.push(`<clipPath id="${id}"><path d="${node.path}"/></clipPath>`);
        clip = ` clip-path="url(#${id})"`;
      }
      body.push(withPlace(node.place, `<path d="${node.path}" fill="none" ${paintAttr(node.paint, "stroke")} stroke-width="${String(node.width)}"${opacity}${clip}/>`));
    } else if (node.type === "halo") {
      const id = identify("h");
      defs.push(
        `<filter id="${id}" x="-40%" y="-40%" width="180%" height="180%" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceAlpha" stdDeviation="${String(node.blur)}" result="b"/><feFlood flood-color="${node.colour}" flood-opacity="${String(node.alpha)}"/><feComposite in2="b" operator="in"/></filter>`,
      );
      body.push(withPlace(node.place, `<path d="${node.path}" fill="${node.colour}" filter="url(#${id})"/>`));
    } else {
      const id = identify("f");
      const layers = node.shadows
        .map(
          (shadow, index) =>
            `<feGaussianBlur in="SourceAlpha" stdDeviation="${String(shadow.blur)}" result="b${String(index)}"/><feOffset in="b${String(index)}" dy="${String(shadow.dy)}" result="o${String(index)}"/><feFlood flood-color="${shadow.colour}" flood-opacity="${String(shadow.alpha)}"/><feComposite in2="o${String(index)}" operator="in" result="s${String(index)}"/>`,
        )
        .join("");
      const merge = `${node.shadows.map((_shadow, index) => `<feMergeNode in="s${String(index)}"/>`).join("")}<feMergeNode in="SourceGraphic"/>`;
      defs.push(`<filter id="${id}" x="-25%" y="-25%" width="150%" height="160%" color-interpolation-filters="sRGB">${layers}<feMerge>${merge}</feMerge></filter>`);
      const members = node.members.map((member) => `<path d="${member.path}" ${paintAttr(member.paint, "fill")}/>`).join("");
      body.push(withPlace(node.place, `<g filter="url(#${id})">${members}</g>`));
    }
  }
  return `<defs>\n${defs.map((item) => `  ${item}`).join("\n")}\n</defs>\n${body.join("\n")}`;
}

/** The standalone icon file. */
export function markSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(CANVAS)} ${String(CANVAS)}">\n${markSvgBody(TILE_RADIUS, "")}\n</svg>\n`;
}

// ---------------------------------------------------------------------------------------------------------------
// As pixels

function paintOf(spec: PaintSpec, shape: readonly Polygon[], transform: Transform | null): Paint {
  if (spec.kind === "solid") return solid(parseColour(spec.colour), spec.alpha);
  const box = bounds(shape);
  const mapX = (value: number): number => (spec.units === "box" ? box.x + value * box.width : ((transform === null ? value : value * transform.scale + transform.dx) * RESOLUTION));
  const mapY = (value: number): number => (spec.units === "box" ? box.y + value * box.height : ((transform === null ? value : value * transform.scale + transform.dy) * RESOLUTION));
  const [a = 0, b = 0, c = 0, e = 0] = spec.coords;
  if (spec.kind === "linear") return linear(mapX(a), mapY(b), mapX(c), mapY(e), spec.stops);
  return radial(mapX(a), mapY(b), spec.units === "box" ? c * box.width : c * RESOLUTION, spec.stops);
}

const IDENTITY: Transform = { scale: 1, dx: 0, dy: 0 };

/** The edge of the master image, in pixels. Every icon is this image reduced. */
export const MASTER = CANVAS * RESOLUTION;

/** The mark as a premultiplied RGBA image MASTER pixels wide. `outer` is the tile's corner radius (0 for full-bleed). */
export function renderMark(outer: number): Float32Array {
  const working = MASTER;
  const canvas = new Canvas(working);
  const shapeOf = (path: string, transform: Transform | null): Polygon[] => place(flattenPath(path), transform ?? IDENTITY, RESOLUTION);
  const tileMask = fillMask(shapeOf(roundRect(0, 0, CANVAS, CANVAS, [outer, outer, outer, outer]), null), working);
  for (const node of scene(outer)) {
    if (node.type === "fill") {
      const shape = shapeOf(node.path, node.place);
      canvas.paint(fillMask(shape, working), paintOf(node.paint, shape, node.place), node.opacity, node.clip === "tile" ? tileMask : undefined);
    } else if (node.type === "stroke") {
      const shape = shapeOf(node.path, node.place);
      const scale = (node.place?.scale ?? 1) * RESOLUTION;
      const band = strokeCoverage(boundaryDistance(shape, working, node.width * scale), node.width * scale);
      const clip = node.clip === "tile" ? tileMask : fillMask(shape, working);
      canvas.paint(band, paintOf(node.paint, shape, node.place), node.opacity, clip);
    } else if (node.type === "halo") {
      const shape = shapeOf(node.path, node.place);
      const soft = blur(fillMask(shape, working), working, node.blur * node.place.scale * RESOLUTION);
      canvas.paint(soft, solid(parseColour(node.colour), node.alpha));
    } else {
      const members = node.members.map((member) => shapeOf(member.path, node.place));
      for (const shadow of node.shadows) {
        const moved = place(members.flat(), { scale: 1, dx: 0, dy: shadow.dy * node.place.scale * RESOLUTION }, 1);
        const soft = blur(fillMask(moved, working), working, shadow.blur * node.place.scale * RESOLUTION);
        canvas.paint(soft, solid(parseColour(shadow.colour), shadow.alpha));
      }
      node.members.forEach((member, index) => {
        const shape = at(members, index);
        canvas.paint(fillMask(shape, working), paintOf(member.paint, shape, node.place));
      });
    }
  }
  return canvas.data;
}

/** The farthest any of the letters (before shadow and glow) reaches from the centre of the canvas, in canvas units. */
export function foregroundReach(): number {
  let reach = 0;
  for (const node of scene(TILE_RADIUS)) {
    if (node.type !== "lifted") continue;
    for (const member of node.members) {
      for (const polygon of place(flattenPath(member.path), node.place, 1)) {
        for (const [x, y] of polygon) reach = Math.max(reach, Math.hypot(x - CANVAS / 2, y - CANVAS / 2));
      }
    }
  }
  return reach;
}
