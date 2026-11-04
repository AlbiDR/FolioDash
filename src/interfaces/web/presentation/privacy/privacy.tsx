import { type ComponentChildren, type JSX, createContext } from "preact";
import { useContext, useEffect, useState } from "preact/hooks";
import type { EuroCents } from "../../../../core/Money";
import { Icon } from "../../shared/ui/icons";
import { type PrivacyStorage, amountText, readPrivacyChoice, writePrivacyChoice } from "./privacyChoice";

const PrivacyContext = createContext(true);

export function usePrivacy(): boolean {
  return useContext(PrivacyContext);
}

export function PrivacyProvider(props: { readonly hidden: boolean; readonly children: ComponentChildren }): JSX.Element {
  return <PrivacyContext.Provider value={props.hidden}>{props.children}</PrivacyContext.Provider>;
}

/**
 * An amount that follows the privacy choice. Shown and hidden occupy the same
 * fixed width (set in CSS, never taken from the figure), so switching does not
 * move anything, and the width does not reveal how large the number is. A hidden
 * amount is announced as hidden, not read out.
 */
export function Amount(props: { readonly cents: EuroCents | null; readonly signed?: boolean; readonly empty?: string }): JSX.Element {
  const hidden = usePrivacy();
  const kind = props.signed === true ? "amount signed" : "amount";
  if (props.cents === null) return <span class={kind}>{props.empty ?? "-"}</span>;
  if (hidden) {
    return (
      <span class={`${kind} masked`} role="img" aria-label="Amount hidden">
        {amountText(props.cents, true, props.signed === true)}
      </span>
    );
  }
  return <span class={kind}>{amountText(props.cents, false, props.signed === true)}</span>;
}

export function PrivacyToggle(props: { readonly hidden: boolean; readonly onChange: (hidden: boolean) => void }): JSX.Element {
  return (
    <button
      type="button"
      class="privacy-toggle"
      aria-pressed={props.hidden}
      onClick={() => {
        props.onChange(!props.hidden);
      }}
    >
      <span key={props.hidden ? "hidden" : "shown"} class="privacy-icon"><Icon name={props.hidden ? "eye-off" : "eye"} size={18} /></span>
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
