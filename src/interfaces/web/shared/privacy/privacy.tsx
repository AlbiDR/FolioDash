import { type ComponentChildren, type JSX, createContext } from "preact";
import { useContext, useEffect, useState } from "preact/hooks";
import type { EuroCents } from "../../../../core/Money";
import { MASK, type PrivacyStorage, amountText, readPrivacyChoice, writePrivacyChoice } from "./privacyChoice";

const PrivacyContext = createContext(true);

export function usePrivacy(): boolean {
  return useContext(PrivacyContext);
}

export function PrivacyProvider(props: { readonly hidden: boolean; readonly children: ComponentChildren }): JSX.Element {
  return <PrivacyContext.Provider value={props.hidden}>{props.children}</PrivacyContext.Provider>;
}

/** An amount that follows the privacy choice. A hidden amount is announced as hidden, not read out. */
export function Amount(props: { readonly cents: EuroCents | null; readonly signed?: boolean; readonly empty?: string }): JSX.Element {
  const hidden = usePrivacy();
  if (props.cents === null) return <>{props.empty ?? "–"}</>;
  if (hidden) {
    return (
      <span class="masked" role="img" aria-label="Amount hidden">
        {MASK}
      </span>
    );
  }
  return <>{amountText(props.cents, false, props.signed === true)}</>;
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
      <span aria-hidden="true">{props.hidden ? "◉" : "○"}</span> {props.hidden ? "Amounts hidden" : "Amounts shown"}
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
