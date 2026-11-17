// The FolioDash mark (FD-024): the owner's FD monogram on a tile cut into bento cards.
// One scene, described once with the numbers below, is drawn two ways: as SVG text (icon.svg and the social
// banner) and into pixels by icon-raster.ts (every PNG). Nothing else in the repository draws the mark.
//
// The monogram is the owner's FD, traced to a single stroke width. The grid gaps of the tile are the very gaps
// that cut the D's shoulder, so the letter reads as carved from the same dashboard the tile is made of.
import {
  at,
  blur,
  boundaryDistance,
  bounds,
  fillMask,
  flattenPath,
  parseColour,
  place,
  strokeCoverage,
  type Paint,
  type Polygon,
  type Stop,
  type Transform,
} from "./icon-raster.ts";
import { Canvas, linear, radial, solid } from "./icon-paint.ts";
import { CANVAS, roundRect } from "./icon-mark-geometry.ts";
import { type PaintSpec, scene } from "./icon-mark-scene.ts";

export const TILE_RADIUS = 112;
/** The mark's foreground must stay inside this circle so any launcher mask keeps it whole (Android's safe zone). */
export const SAFE_RADIUS = CANVAS * 0.4;
const RESOLUTION = 2; // the master image is drawn at twice the canvas size, then reduced

const hex = (colour: readonly [number, number, number]): string =>
  `#${colour
    .map((channel) =>
      Math.round(channel * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
// ---------------------------------------------------------------------------------------------------------------
// As SVG

/** The scene as SVG elements, with every id starting with `prefix` so the mark can sit inside another drawing. */
export function markSvgBody(outer: number, prefix: string): string {
  const defs: string[] = [];
  const body: string[] = [];
  let counter = 0;
  const identify = (kind: string): string => `${prefix}${kind}${String(++counter)}`;
  const tileId = `${prefix}tile`;
  defs.push(
    `<clipPath id="${tileId}"><path d="${roundRect(0, 0, CANVAS, CANVAS, [outer, outer, outer, outer])}"/></clipPath>`,
  );
  const stopsSvg = (stops: readonly Stop[]): string =>
    stops
      .map(
        (s) =>
          `<stop offset="${String(s.offset)}" stop-color="${hex(s.colour)}"${s.alpha < 1 ? ` stop-opacity="${String(s.alpha)}"` : ""}/>`,
      )
      .join("");
  const paintAttr = (paint: PaintSpec, attribute: "fill" | "stroke"): string => {
    if (paint.kind === "solid")
      return `${attribute}="${paint.colour}"${paint.alpha < 1 ? ` ${attribute}-opacity="${String(paint.alpha)}"` : ""}`;
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
  const withPlace = (transform: Transform | null, content: string): string =>
    transform === null
      ? content
      : `<g transform="translate(${String(transform.dx)} ${String(transform.dy)}) scale(${String(transform.scale)})">${content}</g>`;
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
      body.push(
        withPlace(
          node.place,
          `<path d="${node.path}" fill="none" ${paintAttr(node.paint, "stroke")} stroke-width="${String(node.width)}"${opacity}${clip}/>`,
        ),
      );
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
      defs.push(
        `<filter id="${id}" x="-25%" y="-25%" width="150%" height="160%" color-interpolation-filters="sRGB">${layers}<feMerge>${merge}</feMerge></filter>`,
      );
      const members = node.members
        .map((member) => `<path d="${member.path}" ${paintAttr(member.paint, "fill")}/>`)
        .join("");
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
  const mapX = (value: number): number =>
    spec.units === "box"
      ? box.x + value * box.width
      : (transform === null ? value : value * transform.scale + transform.dx) * RESOLUTION;
  const mapY = (value: number): number =>
    spec.units === "box"
      ? box.y + value * box.height
      : (transform === null ? value : value * transform.scale + transform.dy) * RESOLUTION;
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
  const shapeOf = (path: string, transform: Transform | null): Polygon[] =>
    place(flattenPath(path), transform ?? IDENTITY, RESOLUTION);
  const tileMask = fillMask(shapeOf(roundRect(0, 0, CANVAS, CANVAS, [outer, outer, outer, outer]), null), working);
  for (const node of scene(outer)) {
    if (node.type === "fill") {
      const shape = shapeOf(node.path, node.place);
      canvas.paint(
        fillMask(shape, working),
        paintOf(node.paint, shape, node.place),
        node.opacity,
        node.clip === "tile" ? tileMask : undefined,
      );
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
