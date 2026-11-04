import type { ComponentChildren, JSX } from "preact";
import { arc, pie } from "d3-shape";

export interface DonutSlice {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly href?: string;
  readonly description?: string;
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
  readonly activeId?: string | null;
  readonly onHover?: (id: string | null) => void;
  readonly onFocus?: (id: string | null) => void;
}): JSX.Element {
  const total = props.slices.reduce((sum, slice) => sum + slice.value, 0);
  const arcs = pie<DonutSlice>()
    .value((slice) => slice.value)
    .sort(null)
    .padAngle(props.slices.length > 1 ? 0.035 : 0)(props.slices as DonutSlice[]);
  const draw = arc<(typeof arcs)[number]>().innerRadius(INNER).outerRadius(OUTER).cornerRadius(7);
  return (
    <div class="donut" data-inspecting={props.activeId != null}>
      <svg viewBox={`0 0 ${String(SIZE)} ${String(SIZE)}`} role={props.slices.some(slice => slice.href !== undefined) ? "group" : "img"} aria-label={props.label}>
        <g transform={`translate(${String(SIZE / 2)} ${String(SIZE / 2)})`}>
          {total <= 0 ? (
            <circle r={(OUTER + INNER) / 2} fill="none" stroke="var(--surface-high)" stroke-width={OUTER - INNER} />
          ) : (
            arcs.map((slice, index) => {
              const path = <path class={`donut-slice series-${String(index % 8)}`} data-active={props.activeId === slice.data.id} d={draw(slice) ?? ""} />;
              return slice.data.href === undefined ? <g key={slice.data.id}>{path}</g> : (
                <a
                  key={slice.data.id}
                  href={slice.data.href}
                  aria-label={slice.data.description ?? slice.data.label}
                  onPointerEnter={(event) => { if (event.pointerType !== "touch") props.onHover?.(slice.data.id); }}
                  onPointerLeave={() => props.onHover?.(null)}
                  onFocus={() => props.onFocus?.(slice.data.id)}
                  onBlur={() => props.onFocus?.(null)}
                >{path}</a>
              );
            })
          )}
        </g>
      </svg>
      <div class="donut-centre">{props.centre}</div>
    </div>
  );
}
