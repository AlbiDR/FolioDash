import type { JSX } from "preact";

/** A segmented control, as in Apple's Stocks: one option is always selected. */
export function RangeSelector<Id extends string>(props: {
  readonly label: string;
  readonly options: readonly { readonly id: Id; readonly label: string }[];
  readonly value: Id;
  readonly onChange: (id: Id) => void;
}): JSX.Element {
  return (
    <div class="segmented" role="group" aria-label={props.label}>
      {props.options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={option.id === props.value}
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
