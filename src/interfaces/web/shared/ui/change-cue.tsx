import type { ComponentChildren, JSX, RefObject } from "preact";
import { useEffect, useMemo, useRef } from "preact/hooks";
import { createMotion, type Motion, timingFrom } from "../motion/animate";

/**
 * A short cue when a value shown in place changes, so it never simply swaps (docs/design/polished-by-default.md,
 * phase 6): the element fades up from the update opacity over the state duration. Nothing plays on the first render,
 * under reduced motion, or without the Web Animations API, and the value itself is never delayed.
 */
export function playChangeCue(element: Element, motion: Motion): void {
  const style = getComputedStyle(element);
  const from = Number.parseFloat(style.getPropertyValue("--motion-update-opacity"));
  motion.play(
    element,
    [{ opacity: Number.isFinite(from) ? from : 0.65 }, { opacity: 1 }],
    timingFrom(style, "--duration-short", "--ease-smooth"),
  );
}

export function useChangeCue(element: RefObject<Element | null>, value: unknown, motion?: Motion): void {
  const player = useMemo(() => motion ?? createMotion(), [motion]);
  const previous = useRef(value);
  useEffect(() => {
    if (Object.is(previous.current, value)) return;
    previous.current = value;
    if (element.current !== null) playChangeCue(element.current, player);
  }, [element, player, value]);
}

/** Wraps content whose meaning changes in place, and cues each change of `value`. */
export function ChangeCue(props: {
  readonly value: unknown;
  readonly class?: string;
  readonly children: ComponentChildren;
}): JSX.Element {
  const element = useRef<HTMLSpanElement>(null);
  useChangeCue(element, props.value);
  return (
    <span ref={element} class={props.class}>
      {props.children}
    </span>
  );
}
