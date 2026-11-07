/**
 * Decisions behind the screenshot of the page sent with each message to the
 * admin assistant (taken in live.ts), so the agent can see what it's changing.
 */

/** The element screenshotted: the surface, columns and all. */
export const screenshotRootId = "surface";

/** Marks an element (with its contents) to leave out of screenshots, e.g. the admin bar. */
export const screenshotSkip = "data-screenshot-skip";

/** Widest screenshot worth sending: Claude scales larger images down anyway. */
export const maxScreenshotWidth = 1568;

/** Pixel ratio to capture at: the page's own CSS pixels, scaled down to fit maxScreenshotWidth. */
export const screenshotScale = (width: number): number =>
  width > maxScreenshotWidth ? maxScreenshotWidth / width : 1;

/** Leaves out elements marked with screenshotSkip. */
export const includeInScreenshot = (node: Node): boolean =>
  !(node.nodeType === 1 && (node as Element).hasAttribute(screenshotSkip));
