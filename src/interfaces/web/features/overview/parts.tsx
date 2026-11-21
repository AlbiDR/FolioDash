import type { JSX } from "preact";
import type { EuroCents } from "../../../../core/values/money";
import { formatPercent } from "../../../../core/values/percent";
import { AnimatedFigure } from "../../presentation/animated-figure";
import { Amount } from "../../presentation/privacy/privacy";

/** A gain or loss reads as one in text too (the sign), so colour is never the only cue. */
export function tone(value: number | null): string {
  return value === null || value === 0 ? "" : value > 0 ? "gain" : "loss";
}

export function Signed(props: { readonly cents: EuroCents | null }): JSX.Element {
  return (
    <span class={tone(props.cents)}>
      <Amount cents={props.cents} signed />
    </span>
  );
}

/** A percentage in a rounded chip. Percentages reveal no amount, so privacy mode leaves them visible. */
export function Pill(props: { readonly ratio: number | null; readonly signed?: boolean }): JSX.Element {
  return (
    <span class={`pill ${props.signed === true ? tone(props.ratio) : ""}`}>
      <AnimatedFigure
        value={props.ratio}
        text={formatPercent(props.ratio, { signed: props.signed === true })}
        format={props.signed === true ? formatSignedPercent : formatPercent}
      />
    </span>
  );
}

export function Percent(props: { readonly ratio: number | null; readonly signed?: boolean }): JSX.Element {
  return (
    <span
      class={[props.signed === true ? tone(props.ratio) : "", props.ratio === null ? "empty" : ""]
        .filter((name) => name !== "")
        .join(" ")}
    >
      <AnimatedFigure
        value={props.ratio}
        text={formatPercent(props.ratio, { signed: props.signed === true })}
        format={props.signed === true ? formatSignedPercent : formatPercent}
      />
    </span>
  );
}

function formatSignedPercent(value: number): string {
  return formatPercent(value, { signed: true });
}
