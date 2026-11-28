import { render } from "preact";
import { afterEach, expect, it } from "vitest";
import { Donut } from "../charts/donut";
import "../../shared/tokens.css";
import "../../app/styles/controls-and-charts.css";
import "../../shared/ui/motion/state-charts.css";
import "../charts/chart-arrival.css";

const host = document.createElement("div");
host.style.width = "180px";
document.body.append(host);
afterEach(() => {
  render(null, host);
  host.replaceChildren();
});

const slices = [
  { id: "a", label: "A", value: 55, href: "#a" },
  { id: "b", label: "B", value: 18, href: "#b" },
  { id: "c", label: "C", value: 14, href: "#c" },
  { id: "d", label: "D", value: 13, href: "#d" },
];
const paths = () => [...host.querySelectorAll<SVGPathElement>(".donut-slice")];
const settle = async () => {
  await Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => undefined)));
};

it("grows the inspected slice outward about the ring's centre and never moves another", async () => {
  render(<Donut slices={slices} label="Allocation" activeId={null} />, host);
  await settle();
  const svg = host.querySelector("svg") as SVGSVGElement;
  const box = svg.getBoundingClientRect();
  const centre = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  const before = paths().map((path) => path.getBoundingClientRect());

  render(<Donut slices={slices} label="Allocation" activeId="b" />, host);
  await settle();
  const after = paths().map((path) => path.getBoundingClientRect());

  const grow = 1.15;
  const expected = (rect: DOMRect) => ({
    left: centre.x + (rect.left - centre.x) * grow,
    top: centre.y + (rect.top - centre.y) * grow,
    right: centre.x + (rect.right - centre.x) * grow,
    bottom: centre.y + (rect.bottom - centre.y) * grow,
  });
  const active = after[1] as DOMRect;
  const want = expected(before[1] as DOMRect);
  for (const [side, value] of Object.entries(want)) {
    expect(active[side as keyof typeof want]).toBeCloseTo(value, 0);
  }
  for (const index of [0, 2, 3]) {
    const rect = after[index] as DOMRect;
    const was = before[index] as DOMRect;
    expect(rect.left).toBeCloseTo(was.left, 1);
    expect(rect.top).toBeCloseTo(was.top, 1);
    expect(rect.width).toBeCloseTo(was.width, 1);
  }
  // The grown rim stays inside the svg's own box, so nothing is clipped or pushed against a neighbour.
  expect(active.right).toBeLessThanOrEqual(box.right + 12);
  expect(active.bottom).toBeLessThanOrEqual(box.bottom + 12);
});
