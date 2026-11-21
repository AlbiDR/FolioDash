import type { RefObject } from "preact";
import { useLayoutEffect, useState } from "preact/hooks";
import { FILL_MAX_HEIGHT, FILL_MAX_RATIO, LAYOUT } from "./line-chart-layout";

/** The plot's measured width, and the height it may fill when its card is stretched beside taller neighbours. */
export function useChartSize(
  container: RefObject<HTMLElement | null>,
  plot: RefObject<SVGSVGElement | null>,
  fillHeight: boolean,
): { readonly width: number; readonly filledHeight: number | null } {
  const [width, setWidth] = useState<number>(LAYOUT.width);
  const [filledHeight, setFilledHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    const node = container.current;
    if (node === null) return;
    let frame: number | null = null;
    const initialStyle = getComputedStyle(node);
    const contentWidth =
      node.getBoundingClientRect().width -
      parseFloat(initialStyle.borderLeftWidth) -
      parseFloat(initialStyle.borderRightWidth) -
      parseFloat(initialStyle.paddingLeft) -
      parseFloat(initialStyle.paddingRight);
    let measuredWidth: number = contentWidth > 0 ? Math.max(200, Math.round(contentWidth)) : LAYOUT.width;
    let fillFrame: number | null = null;
    /** Spare height the stretched card has beyond the other content, which the plot may take. */
    const spare = (): number | null => {
      const svg = plot.current;
      const last = node.lastElementChild;
      if (svg === null || last === null) return null;
      const style = getComputedStyle(node);
      const box = node.getBoundingClientRect();
      const inner = node.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      const other =
        last.getBoundingClientRect().bottom -
        box.top -
        parseFloat(style.paddingTop) -
        svg.getBoundingClientRect().height;
      return Math.max(
        LAYOUT.height,
        Math.min(FILL_MAX_HEIGHT, Math.round(measuredWidth * FILL_MAX_RATIO), Math.floor(inner - other)),
      );
    };
    const fill = (): void => {
      if (!fillHeight) return;
      const target = spare();
      if (target === null) return;
      setFilledHeight((current) =>
        (current !== null && Math.abs(current - target) <= 2) || (current === null && target === LAYOUT.height)
          ? current
          : target,
      );
    };
    const observer = new ResizeObserver(([entry]) => {
      if (entry === undefined || entry.contentRect.width <= 0) return;
      const nextWidth = Math.max(200, Math.round(entry.contentRect.width));
      if (nextWidth === measuredWidth) {
        // A height-only change, such as a neighbour reflowing, may leave spare room to use or give back.
        if (fillHeight) {
          if (fillFrame !== null) cancelAnimationFrame(fillFrame);
          fillFrame = requestAnimationFrame(() => {
            fillFrame = null;
            fill();
          });
        }
        return;
      }
      measuredWidth = nextWidth;
      if (frame !== null) cancelAnimationFrame(frame);
      // Do not change the observed card's layout inside its resize delivery.
      frame = requestAnimationFrame(() => {
        frame = null;
        setWidth(nextWidth);
        if (!fillHeight) return;
        // A new width reflows the neighbours: measure again from the standard height so the plot can shrink as well as grow.
        setFilledHeight(null);
        if (fillFrame !== null) cancelAnimationFrame(fillFrame);
        fillFrame = requestAnimationFrame(() => {
          fillFrame = requestAnimationFrame(() => {
            fillFrame = null;
            fill();
          });
        });
      });
    });
    observer.observe(node);
    // Resolve the chart's initial width and fill together before the browser paints.
    setWidth(measuredWidth);
    fill();
    return () => {
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
      if (fillFrame !== null) cancelAnimationFrame(fillFrame);
    };
  }, [fillHeight]);
  return { width, filledHeight };
}
