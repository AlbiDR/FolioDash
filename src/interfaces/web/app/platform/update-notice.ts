import type { PrivacyStorage } from "../../presentation/privacy/privacy-choice";

const KEY = "foliodash.build.v1";

/**
 * Tells the person, once, that the app changed under them. The build label this device last ran is
 * remembered; a different label on the next start means an update happened, whether it was taken
 * by itself or by the button. A first start, or a store that cannot be used, says nothing.
 * Only the label is kept, never any figure.
 */
export function updateSeen(open: () => PrivacyStorage, build: string): string | null {
  try {
    const store = open();
    const before = store.getItem(KEY);
    if (before === build) return null;
    store.setItem(KEY, build);
    return before;
  } catch {
    return null;
  }
}
