import type { JSX } from "preact";
import { Presence } from "../../shared/ui/presence";
import type { Message } from "./account-text";

export function Result(props: { readonly message: Message | null }): JSX.Element | null {
  return (
    <Presence show={props.message !== null}>
      {props.message !== null && (
        <div
          class={props.message.good ? "review-adjustments notice-success" : "review-problem"}
          role={props.message.good ? "status" : "alert"}
        >
          <h3>{props.message.title}</h3>
          <p>{props.message.body}</p>
        </div>
      )}
    </Presence>
  );
}
