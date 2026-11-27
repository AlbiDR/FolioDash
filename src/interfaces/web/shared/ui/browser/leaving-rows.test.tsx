import { render } from "preact";
import { afterEach, expect, it, vi } from "vitest";
import { useLeavingRows } from "../../motion/leaving-rows";
import "../../tokens.css";
import "../motion/state-content.css";

const host = document.createElement("div");
document.body.append(host);
afterEach(() => {
  render(null, host);
  host.replaceChildren();
});

function List(props: { readonly ids: readonly string[] }) {
  const { rows } = useLeavingRows(props.ids, (id) => id);
  return (
    <ul class="checkpoint-list">
      {rows.map(({ item, leaving }) => (
        <li key={item} class={leaving ? "row-leaving" : undefined} data-id={item}>
          {item}
        </li>
      ))}
    </ul>
  );
}
const ids = () =>
  [...host.querySelectorAll("li")].map(
    (li) => `${li.dataset["id"] ?? ""}${li.classList.contains("row-leaving") ? "*" : ""}`,
  );

it("keeps a removed row on screen, fading, in its own place and then drops it", async () => {
  render(<List ids={["a", "b", "c"]} />, host);
  render(<List ids={["a", "c"]} />, host);
  await vi.waitFor(() => {
    expect(ids()).toEqual(["a", "b*", "c"]);
  });
  const leaving = host.querySelector<HTMLElement>("li.row-leaving") as HTMLElement;
  expect(leaving.getAnimations().map((animation) => (animation as CSSAnimation).animationName)).toContain(
    "motion-fade-out",
  );
  await vi.waitFor(() => {
    expect(ids()).toEqual(["a", "c"]);
  });
});

it("drops each leaving row after its own time, not after the latest one left", async () => {
  render(<List ids={["a", "b", "c", "d"]} />, host);
  render(<List ids={["a", "c", "d"]} />, host);
  await vi.waitFor(() => {
    expect(ids()).toEqual(["a", "b*", "c", "d"]);
  });
  const started = performance.now();
  await new Promise((done) => setTimeout(done, 120));
  render(<List ids={["a", "c"]} />, host);
  await vi.waitFor(() => {
    expect(ids().some((id) => id.startsWith("b"))).toBe(false);
  });
  // b left first, so it goes about 210 ms after it left, well before d (left 120 ms later) goes.
  expect(performance.now() - started).toBeLessThan(300);
  expect(ids()).toContain("d*");
  await vi.waitFor(() => {
    expect(ids()).toEqual(["a", "c"]);
  });
});
