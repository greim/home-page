/**
 * Whether the page shows night, and how it changes: slowly when the day itself
 * ends or begins, quickly when the user previews daytime in admin mode (to see
 * and edit column colors) or leaves admin mode, ending the preview.
 */
import type { Phase } from "../common/day-cycle.ts";

/**
 * Night mode shows at night, except while the user previews daytime in admin
 * mode. The preview lasts only while admin mode does.
 */
export const showsNight = (phase: Phase, admin: boolean, dayPreview: boolean): boolean =>
  phase === "night" && !(admin && dayPreview);

/** The day preview is offered only at night: by day the page already shows daytime. */
export const dayPreviewAvailable = (phase: Phase): boolean => phase === "night";

/** What the page shows, and why. */
export type NightView = {
  readonly night: boolean;
  readonly phase: Phase;
  /** The last change between day and night was the user's, so it's shown quickly. */
  readonly quick: boolean;
};

/**
 * The view after a render where the phase or what's shown may have changed. A
 * change in what's shown is the day's own (slow) if the phase changed with it,
 * and the user's (quick) if not. Otherwise the last change's speed stands, so a
 * transition already under way isn't cut short.
 */
export const nextNightView = (
  prev: NightView,
  next: { readonly night: boolean; readonly phase: Phase },
): NightView => ({
  ...next,
  quick: next.night === prev.night ? prev.quick : next.phase === prev.phase,
});
