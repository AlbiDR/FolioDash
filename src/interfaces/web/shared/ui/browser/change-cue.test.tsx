import { render } from "preact";
import { useRef, useState } from "preact/hooks";
import { afterEach, expect, it, vi } from "vitest";
import "../../tokens.css";
import { ChangeCue, useChangeCue } from "../change-cue";

const host = document.createElement("div");
document.body.append(host);
afterEach(() => {
  render(null, host);
  host.replaceChildren();
});

function Probe(props: { readonly label: string }) {
  return <ChangeCue value={props.label}>{props.label}</ChangeCue>;
}

const animationsOf = (element: Element): Animation[] => element.getAnimations();
// Preact runs effects after paint, so "nothing happened" is asserted after a settle, and "something happened" is awaited.
const settle = () => new Promise((resolve) => setTimeout(resolve, 150));

it("plays nothing on the first render, then one fade up from the update opacity on each change", async () => {
  render(<Probe label="Copy ISIN" />, host);
  const cue = host.firstElementChild as HTMLElement;
  expect(animationsOf(cue)).toHaveLength(0);

  render(<Probe label="Copied" />, host);
  await vi.waitFor(() => {
    expect(animationsOf(cue)).toHaveLength(1);
  });
  const [animation] = animationsOf(cue);
  expect(animation).toBeDefined();
  const frames = (animation?.effect as KeyframeEffect).getKeyframes();
  expect(frames.map((frame) => Number(frame["opacity"]))).toEqual([0.65, 1]);
  expect(cue.textContent).toBe("Copied");

  // Let the cue finish, then re-render the same value: nothing new may start.
  await animation?.finished;
  render(<Probe label="Copied" />, host);
  await settle();
  expect(animationsOf(cue)).toHaveLength(0);
});

it("restarts the cue when the value changes again mid-cue, never stacking two", async () => {
  render(<Probe label="a" />, host);
  const cue = host.firstElementChild as HTMLElement;
  render(<Probe label="b" />, host);
  await vi.waitFor(() => {
    expect(animationsOf(cue)).toHaveLength(1);
  });
  const first = animationsOf(cue)[0];
  render(<Probe label="c" />, host);
  await vi.waitFor(() => {
    expect(animationsOf(cue)[0]).not.toBe(first);
  });
  await settle();
  expect(animationsOf(cue)).toHaveLength(1);
  expect(cue.textContent).toBe("c");
});

it("plays nothing when the motion layer declines to move, as it does under reduced motion, and the value still changes at once", async () => {
  function Declined() {
    const element = useRef<HTMLButtonElement>(null);
    const [value, setValue] = useState("x");
    useChangeCue(element, value, { play: () => null, stop: () => undefined });
    return (
      <button
        type="button"
        ref={element}
        id="declined"
        onClick={() => {
          setValue("y");
        }}
      >
        {value}
      </button>
    );
  }
  render(<Declined />, host);
  const element = host.querySelector("#declined") as HTMLElement;
  element.click();
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(element.textContent).toBe("y");
  expect(animationsOf(element)).toHaveLength(0);
});
