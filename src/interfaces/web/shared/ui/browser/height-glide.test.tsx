import { render } from "preact";
import { useRef } from "preact/hooks";
import { afterEach, expect, it, vi } from "vitest";
import { useHeightGlide } from "../../motion/height-glide";
import "../../tokens.css";

const host = document.createElement("div");
document.body.append(host);
afterEach(() => {
  render(null, host);
  host.replaceChildren();
});

function Box(props: { readonly rows: number; readonly changeKey: string }) {
  const box = useRef<HTMLDivElement>(null);
  useHeightGlide(box, props.changeKey);
  return (
    <div ref={box} data-box>
      {Array.from({ length: props.rows }, (_, index) => (
        <p key={index} style={{ margin: 0, height: "40px" }}>
          row
        </p>
      ))}
    </div>
  );
}
const box = () => host.querySelector("[data-box]") as HTMLElement;

it("eases a box from its old height to its new one when its key changes, and not on an unrelated render", async () => {
  render(<Box rows={4} changeKey="a" />, host);
  render(<Box rows={4} changeKey="a" />, host);
  expect(box().getAnimations()).toHaveLength(0);
  render(<Box rows={2} changeKey="b" />, host);
  await vi.waitFor(() => {
    expect(box().getAnimations().length).toBeGreaterThan(0);
  });
  const frames = (box().getAnimations()[0]?.effect as KeyframeEffect).getKeyframes();
  expect(frames[0]?.["height"]).toBe("160px");
  expect(frames.at(-1)?.["height"]).toBe("80px");
});
