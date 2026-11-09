import { motionMilliseconds } from "./motionTiming";
import type { ComponentChildren, JSX } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { useMediaQuery } from "./useMediaQuery";

/** Retains only the outgoing notice until its space collapses. Dismissed actions stop immediately. */
export function Presence(props: { readonly show: boolean; readonly children: ComponentChildren; readonly class?: string }): JSX.Element | null {
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [present, setPresent] = useState(props.show);
  const retained = useRef(props.children);
  const element = useRef<HTMLDivElement>(null);
  const spacing = useRef<{ node: Element; animation: Animation; from: number; to: number }[]>([]);
  useLayoutEffect(() => () => { for (const shift of spacing.current) shift.animation.cancel(); }, []);
  if (props.show) retained.current = props.children;
  useLayoutEffect(() => {
    if (!props.show && (reduced || !present)) {
      retained.current = null;
      for (const shift of spacing.current) shift.animation.cancel();
      spacing.current = [];
      setPresent(false);
      return;
    }
    const node = element.current;
    if (node === null) return;
    const parent = node.parentElement;
    // Cancel the parent's remaining row gap as the notice collapses, avoiding a final layout snap.
    const gap = parent === null ? "0px" : getComputedStyle(parent).rowGap;
    node.style.setProperty("--presence-gap", gap === "normal" ? "0px" : gap);
    node.setAttribute("data-settled", reduced ? "true" : "false");
    if (props.show) setPresent(true);

    const duration = motionMilliseconds(getComputedStyle(node).getPropertyValue("--duration-medium"));
    // A grid keeps a gap around a zero-height row. Shift subsequent items by that last gap
    // while the row collapses, then release the shifts in the same paint that removes the row.
    // Additive translations allow adjacent notices to collapse together without overwriting each other.
    const gapSize = Number.parseFloat(gap) || 0;
    const easing = getComputedStyle(node).getPropertyValue("--ease-standard").trim();
    const siblings = parent === null ? [] : Array.from(parent.children).slice(Array.from(parent.children).indexOf(node) + 1);
    const previous = spacing.current;
    const shifts: typeof previous = [];
    for (const sibling of siblings) {
      const old = previous.find(shift => shift.node === sibling);
      const progress = old?.animation.effect?.getComputedTiming().progress ?? 0;
      const from = old === undefined ? props.show && !present ? -gapSize : 0 : old.from + (old.to - old.from) * progress;
      old?.animation.cancel();
      if (reduced || typeof sibling.animate !== "function" || props.show && present && old === undefined) continue;
      const to = props.show ? 0 : -gapSize;
      if (from === 0 && to === 0) continue;
      const animation = sibling.animate([{ translate: `0 ${String(from)}px` }, { translate: `0 ${String(to)}px` }], { duration, easing, fill: "forwards", composite: "add" });
      shifts.push({ node: sibling, animation, from, to });
    }
    for (const old of previous) if (!siblings.includes(old.node)) old.animation.cancel();
    spacing.current = shifts;
    const timeout = setTimeout(() => {
      if (props.show) node.setAttribute("data-settled", "true");
      else setPresent(false);
    }, duration + 100);
    return () => { clearTimeout(timeout); };
  }, [props.show, reduced, present]);
  if (!props.show && (!present || reduced)) return null;
  return <div ref={element} class={`presence${props.class === undefined ? "" : ` ${props.class}`}`} data-present={props.show} inert={!props.show} aria-hidden={props.show ? undefined : true} onTransitionEnd={event => {
    if (event.target !== event.currentTarget || event.propertyName !== "grid-template-rows") return;
    if (props.show) event.currentTarget.setAttribute("data-settled", "true");
    else setPresent(false);
  }}><div class="presence-content">{props.show ? props.children : retained.current}</div></div>;
}
