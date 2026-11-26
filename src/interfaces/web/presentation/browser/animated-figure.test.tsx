import { render } from "preact";
import { afterEach, expect, it, vi } from "vitest";
import "../../shared/tokens.css";
import { AnimatedFigure, formatFigureCount } from "../animated-figure";

const host = document.createElement("div");
document.body.append(host);
afterEach(() => {
  render(null, host);
  host.replaceChildren();
});

const figure = (id: string) => (
  <span id={id}>
    <AnimatedFigure value={1234} text="1234" format={formatFigureCount} />
  </span>
);

it("counts a figure that can be seen and not one scrolled out of sight inside a clipping container", async () => {
  render(
    <div id="table" style="width:120px;overflow-x:auto;white-space:nowrap">
      <div style="width:600px;display:flex;gap:260px">
        {figure("seen")}
        {figure("hidden")}
      </div>
    </div>,
    host,
  );
  await vi.waitFor(() => {
    expect(host.querySelector("#seen [data-counting]")).not.toBeNull();
  });
  expect(host.querySelector("#hidden [data-counting]")).toBeNull();
  expect(host.querySelector("#hidden")?.textContent).toContain("1234");
});

it("never counts on a page entered from inside the app, and still shows the exact figure", async () => {
  render(<main data-arrival="entered">{figure("entered")}</main>, host);
  await new Promise((resolve) => setTimeout(resolve, 150));
  expect(host.querySelector("#entered [data-counting]")).toBeNull();
  expect(host.querySelector("#entered")?.textContent).toContain("1234");
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 150));

function Shown(props: { readonly text: string; readonly masked?: boolean }) {
  return (
    <main data-arrival="entered">
      <span id="figure">
        <AnimatedFigure
          value={props.masked === true ? null : Number(props.text)}
          text={props.text}
          format={formatFigureCount}
          masked={props.masked === true}
        />
      </span>
    </main>
  );
}

const figureNode = () => host.querySelector("#figure .animated-figure") as HTMLElement;

it("cues a figure that changes while it is shown, with its exact text there at once", async () => {
  render(<Shown text="100" />, host);
  expect(figureNode().getAnimations()).toHaveLength(0);
  render(<Shown text="250" />, host);
  expect(figureNode().textContent).toContain("250");
  await vi.waitFor(() => {
    expect(figureNode().getAnimations()).toHaveLength(1);
  });
  expect(figureNode().hasAttribute("data-counting")).toBe(false);
});

it("never cues a privacy change, in either direction, and never for an unchanged figure", async () => {
  render(<Shown text="100" />, host);
  render(<Shown text="••••" masked />, host);
  await settle();
  expect(figureNode().getAnimations()).toHaveLength(0);
  render(<Shown text="100" />, host);
  await settle();
  expect(figureNode().getAnimations()).toHaveLength(0);
  render(<Shown text="100" />, host);
  await settle();
  expect(figureNode().getAnimations()).toHaveLength(0);
});
