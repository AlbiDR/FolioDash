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
