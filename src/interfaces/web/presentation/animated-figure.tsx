import type { JSX } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";
import { timingFrom } from "../shared/motion/animate";
import { prefersReducedMotion } from "../shared/motion/reduced-motion";
import { motionMilliseconds } from "../shared/ui/motion-timing";

interface AnimatedFigureProps {
  readonly value: number | null;
  readonly text: string;
  readonly format: (value: number) => string;
  readonly class?: string;
  readonly masked?: boolean;
}

/** Keep the exact text in the layout and accessibility tree. Only the visual overlay is interpolated. */
export function AnimatedFigure(props: AnimatedFigureProps): JSX.Element {
  const element = useRef<HTMLSpanElement>(null);
  const overlay = useRef<HTMLSpanElement>(null);
  const mounted = useRef(false);
  const { value, text, format } = props;
  useLayoutEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    const node = element.current;
    const counter = overlay.current;
    if (
      node === null ||
      counter === null ||
      value === null ||
      !Number.isFinite(value) ||
      value === 0 ||
      typeof KeyframeEffect !== "function" ||
      typeof Animation !== "function" ||
      document.hidden ||
      prefersReducedMotion()
    )
      return;
    // Long statements may contain hundreds of offscreen figures. Animate the ones opening in view.
    const bounds = node.getBoundingClientRect();
    if (bounds.height === 0 || bounds.top >= window.innerHeight || bounds.bottom <= 0) return;
    // A page entered from inside the app shows its figures at once: counting is part of the cold open only.
    if (node.closest('[data-arrival="entered"]') !== null) return;
    // A cell scrolled out of sight inside a wide table is offscreen too: only count what can be seen.
    if (!visibleSideways(node, bounds)) return;
    const style = getComputedStyle(node);
    const timing = timingFrom(style, "--duration-arrival", "--ease-arrival");
    if (timing.duration === 0) return;
    const effect = new KeyframeEffect(null, [], {
      ...timing,
      delay: motionMilliseconds(style.getPropertyValue("--section-arrival-delay")),
      fill: "both",
    });
    const clock = new Animation(effect, document.timeline);
    let frame = 0;
    const finish = (): void => {
      cancelAnimationFrame(frame);
      clock.cancel();
      node.removeAttribute("data-counting");
      counter.removeAttribute("data-figure-count");
    };
    const draw = (): void => {
      const progress = effect.getComputedTiming().progress ?? 0;
      if (progress >= 1 || document.hidden || prefersReducedMotion()) {
        finish();
        return;
      }
      counter.setAttribute("data-figure-count", format(value * progress));
      frame = requestAnimationFrame(draw);
    };
    node.setAttribute("data-counting", "");
    clock.play();
    draw();
    return finish;
  }, [value, text, format]);
  return (
    <span
      ref={element}
      class={`animated-figure ${props.class ?? ""}`}
      role={props.masked === true ? "img" : undefined}
      aria-label={props.masked === true ? "Amount hidden" : undefined}
    >
      <span class="figure-slot">
        <span class="figure-exact">{text}</span>
        <span ref={overlay} class="figure-count" aria-hidden="true" />
      </span>
    </span>
  );
}

/** Whether a figure lies inside every horizontally clipping ancestor, such as a scrolling table, and the viewport. */
function visibleSideways(node: Element, bounds: DOMRect): boolean {
  if (bounds.right <= 0 || bounds.left >= window.innerWidth) return false;
  for (let parent = node.parentElement; parent !== null; parent = parent.parentElement) {
    if (getComputedStyle(parent).overflowX === "visible") continue;
    const clip = parent.getBoundingClientRect();
    if (bounds.right <= clip.left || bounds.left >= clip.right) return false;
  }
  return true;
}

export function formatFigureCount(value: number): string {
  return String(Math.round(value));
}
