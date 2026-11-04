import type { JSX } from "preact";

/** A segmented control, as in Apple's Stocks: one option is always selected. */
export function RangeSelector<Id extends string>(props: {
  readonly label: string;
  readonly options: readonly { readonly id: Id; readonly label: string }[];
  readonly value: Id;
  readonly onChange: (id: Id) => void;
}): JSX.Element {
  return (
    <div class="segmented range-selector" role="group" aria-label={props.label}
      style={{ "--segment-count": props.options.length, "--segment-index": Math.max(0, props.options.findIndex(option => option.id === props.value)) }}
      onKeyDown={(event) => {
        const index = props.options.findIndex(option => option.id === props.value);
        const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
        let target: number;
        if (event.key === "ArrowRight") target = (index + (rtl ? -1 : 1) + props.options.length) % props.options.length;
        else if (event.key === "ArrowLeft") target = (index + (rtl ? 1 : -1) + props.options.length) % props.options.length;
        else if (event.key === "Home") target = 0;
        else if (event.key === "End") target = props.options.length - 1;
        else return;
        const option = props.options[target];
        if (option === undefined) return;
        event.preventDefault();
        props.onChange(option.id);
        event.currentTarget.querySelectorAll<HTMLButtonElement>("button")[target]?.focus();
      }}>
      {props.options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={option.id === props.value}
          tabIndex={option.id === props.value ? 0 : -1}
          onClick={() => {
            props.onChange(option.id);
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
