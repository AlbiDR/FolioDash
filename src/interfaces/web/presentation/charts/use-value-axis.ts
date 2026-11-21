import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { LAYOUT } from "./line-chart-layout";

export const VALUE_LABEL_GAP = 8;
const VALUE_LABEL_EDGE = 4;

/** Reserve only enough plot width for the visible value labels and their clearance. */
export function useValueAxis(labelKey: object) {
  const group = useRef<SVGGElement>(null);
  const [measurement, setMeasurement] = useState<{
    key: object;
    margin: number;
  } | null>(null);

  useLayoutEffect(() => {
    const node = group.current;
    if (node === null) return;
    const labels = [...node.querySelectorAll<SVGTextElement>("text")];
    const measure = (): void => {
      const width = Math.max(0, ...labels.map((label) => label.getComputedTextLength()));
      if (node.getClientRects().length === 0) return;
      const margin = Math.ceil(width) + VALUE_LABEL_GAP + VALUE_LABEL_EDGE;
      setMeasurement((previous) =>
        previous?.key === labelKey && previous.margin === margin ? previous : { key: labelKey, margin },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    for (const label of labels) observer.observe(label);
    document.fonts.addEventListener("loadingdone", measure);
    return () => {
      observer.disconnect();
      document.fonts.removeEventListener("loadingdone", measure);
    };
  }, [labelKey]);

  return {
    group,
    margin: measurement?.margin ?? LAYOUT.margin.right,
    ready: measurement?.key === labelKey,
  };
}
