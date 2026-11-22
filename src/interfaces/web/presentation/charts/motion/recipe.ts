/**
 * The small public boundary between chart components and the chart motion
 * stylesheet. Components choose a semantic recipe and supply their visual
 * order; they do not spell CSS class names or timing values themselves.
 */
export type ChartArrivalRecipe = "bar" | "ranking" | "ring-slice" | "marker";

const CLASSES: Readonly<Record<ChartArrivalRecipe, string>> = {
  bar: "motion-bar-rise",
  ranking: "motion-ranking-rise",
  "ring-slice": "motion-ring-slice",
  marker: "motion-marker-arrive",
};

export function chartArrivalClass(recipe: ChartArrivalRecipe): string {
  return CLASSES[recipe];
}

/** The style contract for all ordered chart reveals; timing remains in CSS tokens. */
export function chartArrivalOrder(index: number): Readonly<Record<"--motion-index", number>> {
  return { "--motion-index": Math.max(0, Math.floor(index)) };
}
