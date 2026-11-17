// Value labels sit on the right, inside the card, as in Apple's Stocks.
export const LAYOUT = {
  width: 720,
  height: 300,
  margin: { top: 12, right: 78, bottom: 28, left: 8 },
} as const;
/** The tallest the plot grows to fill a card, so a very tall neighbour cannot stretch it past a readable shape. */
export const FILL_MAX_HEIGHT = 560;
/** Nor taller than this share of its width: a time series stays a wide shape even when its neighbour is tall. */
export const FILL_MAX_RATIO = 0.8;
// Series share one line style and differ only by colour: they are the same measure from different sources.
// The palette repeats after this many series.
const STYLE_COUNT = 8;

export function styleClass(index: number, slot: number | null): string {
  return `series-${String((slot ?? index) % STYLE_COUNT)}`;
}
