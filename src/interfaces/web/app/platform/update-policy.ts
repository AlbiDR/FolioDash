/**
 * When a newer version of the app may replace the open page by itself. Pure rules: the person
 * is only asked when swapping the page could cost them something or would be seen.
 */

/** How long after opening, with no touch or key yet, a swap is still invisible. */
export const FRESH_LAUNCH_MILLISECONDS = 15_000;
/** How often an open page asks whether a newer version exists, on top of resuming and coming back online. */
export const UPDATE_CHECK_MILLISECONDS = 30 * 60_000;

export interface UpdateMoment {
  /** An import or an expense draft is being worked on: never swap the page. */
  readonly locked: boolean;
  /** The page is in the background, so a reload cannot be seen. */
  readonly hidden: boolean;
  readonly millisecondsSinceLoad: number;
  readonly interacted: boolean;
}

export function mayApplyUpdateQuietly(moment: UpdateMoment): boolean {
  if (moment.locked) return false;
  if (moment.hidden) return true;
  return !moment.interacted && moment.millisecondsSinceLoad <= FRESH_LAUNCH_MILLISECONDS;
}
