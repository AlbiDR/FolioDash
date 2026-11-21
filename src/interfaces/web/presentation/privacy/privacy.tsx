import { type ComponentChildren, type JSX, createContext } from "preact";
import { useContext, useEffect, useState } from "preact/hooks";
import { type EuroCents, toEuroCents, ZERO_CENTS } from "../../../../core/values/money";
import { AnimatedFigure } from "../animated-figure";
import { Icon } from "../../shared/ui/icons";
import { type PrivacyStorage, amountText, readPrivacyChoice, writePrivacyChoice } from "./privacy-choice";

const PrivacyContext = createContext(true);

export function usePrivacy(): boolean {
  return useContext(PrivacyContext);
}

export function PrivacyProvider(props: {
  readonly hidden: boolean;
  readonly children: ComponentChildren;
}): JSX.Element {
  return <PrivacyContext.Provider value={props.hidden}>{props.children}</PrivacyContext.Provider>;
}

/**
 * An amount that follows the privacy choice. Shown and hidden occupy the same
 * fixed width (set in CSS, never taken from the figure), so switching does not
 * move anything, and the width does not reveal how large the number is. A hidden
 * amount is announced as hidden, not read out.
 */
export function Amount(props: {
  readonly cents: EuroCents | null;
  readonly signed?: boolean;
  readonly empty?: string;
}): JSX.Element {
  const hidden = usePrivacy();
  const kind = props.signed === true ? "amount signed" : "amount";
  const signed = props.signed === true;
  const masked = hidden && props.cents !== null;
  return (
    <AnimatedFigure
      class={`${kind}${props.cents === null ? " empty" : masked ? " masked" : ""}`}
      value={hidden ? null : props.cents}
      text={props.cents === null ? (props.empty ?? "-") : amountText(props.cents, hidden, signed)}
      format={signed ? formatSignedFrame : formatFrame}
      masked={masked}
    />
  );
}

function formatFrame(value: number): string {
  return amountText(toEuroCents(Math.round(value)) ?? ZERO_CENTS, false);
}

function formatSignedFrame(value: number): string {
  return amountText(toEuroCents(Math.round(value)) ?? ZERO_CENTS, false, true);
}

export function PrivacyToggle(props: {
  readonly hidden: boolean;
  readonly onChange: (hidden: boolean) => void;
}): JSX.Element {
  return (
    <button
      type="button"
      class="privacy-toggle"
      aria-pressed={props.hidden}
      onClick={() => {
        props.onChange(!props.hidden);
      }}
    >
      <span key={props.hidden ? "hidden" : "shown"} class="privacy-icon">
        <Icon name={props.hidden ? "eye-off" : "eye"} size={18} />
      </span>
      <span class="toggle-label">{props.hidden ? "Amounts hidden" : "Amounts shown"}</span>
      <span class="visually-hidden">. Press to {props.hidden ? "show" : "hide"} amounts.</span>
    </button>
  );
}

/** Keeps the choice in state and remembers it. */
export function usePrivacyChoice(open: () => PrivacyStorage): [boolean, (hidden: boolean) => void] {
  const [hidden, setHidden] = useState(() => readPrivacyChoice(open));
  useEffect(() => {
    writePrivacyChoice(open, hidden);
  }, [hidden, open]);
  return [hidden, setHidden];
}
