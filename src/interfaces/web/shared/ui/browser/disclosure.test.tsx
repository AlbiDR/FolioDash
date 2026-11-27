import { render } from "preact";
import { afterEach, expect, it, vi } from "vitest";
import "../../tokens.css";
import "../motion/layers.css";

const host = document.createElement("div");
document.body.append(host);
afterEach(() => {
  render(null, host);
  host.replaceChildren();
});

const contentHeight = (details: Element) => Number.parseFloat(getComputedStyle(details, "::details-content").blockSize);

it("opens with its content height animated where the engine supports it and with a short fade where it does not, never with neither", async () => {
  render(
    <details>
      <summary>More</summary>
      <p>Body</p>
    </details>,
    host,
  );
  const details = host.querySelector("details") as HTMLDetailsElement;
  const paragraph = details.querySelector("p") as HTMLElement;
  const animatesHeight = CSS.supports("interpolate-size: allow-keywords");
  // Style must be computed in the closed state first, or there is nothing for a transition to start from.
  if (animatesHeight) expect(contentHeight(details)).toBe(0);
  details.open = true;
  if (animatesHeight) {
    // The content box grows through heights between closed and fully open, and the child's own fade is switched off.
    await vi.waitFor(() => {
      const height = contentHeight(details);
      expect(height).toBeGreaterThan(0);
      expect(height).toBeLessThan(paragraph.getBoundingClientRect().height);
    });
    expect(getComputedStyle(paragraph).animationName).toBe("none");
  } else {
    // Without animated heights the panel opens at once and its content plays the short fade instead.
    expect(getComputedStyle(paragraph).animationName).toBe("disclosure-enter");
    expect(paragraph.getAnimations().map((animation) => (animation as CSSAnimation).animationName)).toContain(
      "disclosure-enter",
    );
  }
});
