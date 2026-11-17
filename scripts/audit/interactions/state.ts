// Shared state of one audit run: the report rows, the problems and the counters.
export interface RenderedControl {
  readonly id: string;
  readonly tag: string;
  readonly label: string;
  readonly family: string;
  readonly disabled: boolean;
  readonly signature: string;
  readonly duration: boolean;
  readonly animated: readonly string[];
}
export const report: { state: string; controls: readonly RenderedControl[] }[] = [];
export const counters = { assertions: 0, controlSamples: 0 };
export const problems: string[] = [];
