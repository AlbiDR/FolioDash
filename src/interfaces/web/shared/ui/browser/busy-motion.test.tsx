import { render } from "preact";
import { afterEach, expect, it } from "vitest";
import "../../tokens.css";
import "../../../app/styles/content-and-notices.css";
import "../motion/layers.css";

const host = document.createElement("div");
document.body.append(host);
afterEach(() => {
  render(null, host);
  host.replaceChildren();
});

/** The longest a pseudo-element's animation can keep moving, from its own computed iterations and duration. */
function movingSeconds(element: Element): number {
  const [animation] = element
    .getAnimations({ subtree: true })
    .filter((candidate) => (candidate.effect as KeyframeEffect).pseudoElement === "::before");
  expect(animation).toBeDefined();
  const timing = (animation as Animation).effect?.getComputedTiming();
  return (timing?.endTime as number) / 1000;
}

it("a busy notice's indicator stops turning within five seconds and keeps its message", () => {
  render(
    <p class="notice" data-busy="true">
      Waiting for Google…
    </p>,
    host,
  );
  const notice = host.querySelector("p") as HTMLElement;
  expect(movingSeconds(notice)).toBeLessThanOrEqual(5);
  expect(notice.textContent).toBe("Waiting for Google…");
});

it("a busy status line's indicator stops turning within five seconds", () => {
  render(
    <div class="status" data-busy="true">
      <p>Checking your latest saved history…</p>
    </div>,
    host,
  );
  expect(movingSeconds(host.querySelector(".status") as HTMLElement)).toBeLessThanOrEqual(5);
});
