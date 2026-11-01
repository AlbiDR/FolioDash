import type { ComponentChildren, JSX } from "preact";
import { arc, pie } from "d3-shape";

export interface DonutSlice {
  readonly id: string;
  readonly label: string;
  readonly value: number;
}

const SIZE = 180;
const OUTER = 86;
const INNER = 58;

/**
 * A donut of shares with rounded segments. It draws proportions only, never an
 * amount, so it reads the same whether amounts are shown or hidden. The centre
 * takes whatever the caller puts there.
 */
export function Donut(props: {
  readonly slices: readonly DonutSlice[];
  readonly label: string;
  readonly centre?: ComponentChildren;
}): JSX.Element {
  const total = props.slices.reduce((sum, slice) => sum + slice.value, 0);
  const arcs = pie<DonutSlice>()
    .value((slice) => slice.value)
    .sort(null)
    .padAngle(props.slices.length > 1 ? 0.035 : 0)(props.slices as DonutSlice[]);
  const draw = arc<(typeof arcs)[number]>().innerRadius(INNER).outerRadius(OUTER).cornerRadius(7);
  return (
    <div class="donut">
      <svg viewBox={`0 0 ${String(SIZE)} ${String(SIZE)}`} role="img" aria-label={props.label}>
        <g transform={`translate(${String(SIZE / 2)} ${String(SIZE / 2)})`}>
          {total <= 0 ? (
            <circle r={(OUTER + INNER) / 2} fill="none" stroke="var(--surface-high)" stroke-width={OUTER - INNER} />
          ) : (
            arcs.map((slice, index) => (
              <path key={slice.data.id} class={`donut-slice series-${String(index % 8)}`} d={draw(slice) ?? ""} />
            ))
          )}
        </g>
      </svg>
      <div class="donut-centre">{props.centre}</div>
    </div>
  );
}
