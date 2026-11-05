import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { type AxisLabel, positionAxisLabels } from "./axisLabels";

/** Measure real SVG glyphs, including hidden candidates, without changing plotted data. */
export function useAxisLabels(labels: readonly AxisLabel[], left: number, right: number, enabled = true) {
  const group = useRef<SVGGElement>(null);
  const [measurement, setMeasurement] = useState<{ widths: Readonly<Record<string, number>>; gap: number }>({ widths: {}, gap: 12 });
  const signature = JSON.stringify(labels);
  useLayoutEffect(() => {
    const node = group.current;
    if (node === null || !enabled) return;
    const measure = (): void => {
      const widths: Record<string, number> = {};
      const texts = node.querySelectorAll<SVGTextElement>("text[data-axis-key]");
      for (const text of texts) {
        const key = text.dataset["axisKey"];
        const width = text.getComputedTextLength();
        // Closed disclosures may not have measurable glyphs yet. Keep safe estimates.
        if (key !== undefined && width > 0) widths[key] = width;
      }
      const first = texts[0];
      const measuredGap = first === undefined ? 12 : Number.parseFloat(getComputedStyle(first).fontSize);
      const gap = Number.isFinite(measuredGap) && measuredGap > 0 ? measuredGap : 12;
      setMeasurement(previous => previous.gap === gap && JSON.stringify(previous.widths) === JSON.stringify(widths) ? previous : { widths, gap });
    };
    measure();
    let frame: number | null = null;
    const schedule = (): void => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { frame = null; measure(); });
    };
    const observer = new ResizeObserver(schedule);
    if (node.ownerSVGElement !== null) observer.observe(node.ownerSVGElement);
    document.fonts.addEventListener("loadingdone", schedule);
    return () => {
      observer.disconnect();
      document.fonts.removeEventListener("loadingdone", schedule);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [signature, enabled]);
  return { group, labels: positionAxisLabels(labels, measurement.widths, left, right, measurement.gap) };
}
