import type { JSX } from "preact";
import { AnimatedFigure } from "../animated-figure";
import { formatPercent } from "../../../../core/values/percent";
import { chartArrivalClass, chartArrivalOrder } from "./motion/recipe";

export interface PerformanceRow {
  readonly key: string;
  readonly href: string;
  readonly label: string;
  /** A ratio, for example 0.135 for +13,5 %. */
  readonly ratio: number;
  readonly dim?: boolean;
}

/**
 * Horizontal bars around a centre line, one per fund, longest gain first. It
 * shows percentages only, so it needs no privacy handling. Each row links to the
 * fund.
 */
function formatPerformance(value: number): string {
  return formatPercent(value, { signed: true });
}

export function PerformanceBars(props: { readonly rows: readonly PerformanceRow[] }): JSX.Element {
  const largest = Math.max(0.0001, ...props.rows.map((row) => Math.abs(row.ratio)));
  return (
    <ul class="perf">
      {props.rows.map((row, index) => {
        const length = (Math.abs(row.ratio) / largest) * 50;
        return (
          <li key={row.key}>
            <a class={`perf-row${row.dim === true ? " dim" : ""}`} href={row.href}>
              <span class="perf-name">{row.label}</span>
              <span class="perf-track" aria-hidden="true">
                <span
                  class={`perf-bar ${chartArrivalClass("ranking")} ${row.ratio >= 0 ? "gain" : "loss"}`}
                  style={{
                    width: `${length.toFixed(2)}%`,
                    left: row.ratio >= 0 ? "50%" : `${(50 - length).toFixed(2)}%`,
                    ...chartArrivalOrder(index),
                  }}
                />
              </span>
              <span class={`perf-value ${row.ratio >= 0 ? "gain" : "loss"}`}>
                <AnimatedFigure value={row.ratio} text={formatPerformance(row.ratio)} format={formatPerformance} />
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
