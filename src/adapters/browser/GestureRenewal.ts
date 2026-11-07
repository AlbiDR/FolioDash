export interface GestureRenewal {
  /** Whether a quiet renewal would be useful on the next click. */
  readonly needed: () => boolean;
  /** Starts it. Called synchronously from inside the click, because Google's window needs the gesture. */
  readonly renew: () => void;
}

interface ClickTarget {
  addEventListener(type: "click", listener: (event: Event) => void): void;
  removeEventListener(type: "click", listener: (event: Event) => void): void;
}

/**
 * Renews Google access on the person's next click, for whatever that click was for.
 *
 * Google's token window can open only from a user gesture, so renewing on a timer or at
 * load is blocked. A click handler runs after the page's own handlers (bubble phase), so a
 * click that forgets the device or already started a renewal finds nothing left to do. An
 * untrusted (scripted) click is ignored: it carries no gesture and would only be blocked.
 * Returns a function that stops listening.
 */
export function armGestureRenewal(target: ClickTarget, renewal: GestureRenewal, activation?: { readonly isActive: boolean }): () => void {
  const onClick = (event: Event): void => {
    if (!event.isTrusted || !renewal.needed()) return;
    renewal.renew();
  };
  target.addEventListener("click", onClick);
  // Opened from a tap or link that is still "active" (for example launching the installed app).
  if (activation?.isActive === true && renewal.needed()) renewal.renew();
  return () => { target.removeEventListener("click", onClick); };
}
