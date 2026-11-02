/**
 * Turns the layout's skin into CSS custom properties. The page sets them once,
 * near its root, and the styles in surface.ts refer to them, so a skin change
 * restyles everything without re-rendering it.
 */
import type { Shadow, Skin } from "../common/model.ts";
import { fontStack } from "./fonts.ts";

/** Drops floating-point noise, e.g. 0.4 * 1.6 = 0.6400000000000001. */
const round = (n: number) => Math.round(n * 10000) / 10000;

/** How much smaller navigator thumbnails' shadows are than the columns'. */
export const thumbShadowScale = 0.4;

/** How much smaller the inset shadow of code boxes (e.g. snippets) is than the column shadow. */
export const insetShadowScale = 0.2;

/** How much lighter the inset shadow of code boxes is than the column shadow. */
export const insetShadowOpacity = 0.7;

/**
 * How much lighter the faint inset shadow (e.g. the assistant widget's chat and
 * prompt) is than the column shadow: the code boxes' inset, but subtler.
 */
export const faintInsetShadowOpacity = 0.3;

/** How much smaller the faint inset shadow is than the column shadow: half the code boxes'. */
export const faintInsetShadowScale = insetShadowScale / 2;

/** How much lighter the assistant widget's chat history shadow is than the faint inset shadow. */
export const chatInsetShadowOpacity = 0.5;

/**
 * Code is set tighter than text: it keeps this share of text's spacing beyond
 * solid (a line height of 1). Text at 1.7 gives code 1.4; text at 1 gives 1.
 */
export const codeSpacingShare = 4 / 7;

export const codeTextSpacing = (textSpacing: number): number =>
  round(1 + (textSpacing - 1) * codeSpacingShare);

/** The difference between a column's top and bottom padding and its `columnPadding`. */
export const columnPaddingSkew = 0.25;

const rem = (n: number) => `${round(n)}rem`;

/** e.g. 0.5 → "50%" */
const percent = (fraction: number) => `${round(fraction * 100)}%`;

/**
 * A box-shadow for `shadow`, scaled. It falls away from the light: right by
 * distance × sin(angle) and down by distance × cos(angle).
 */
export const shadowCss = (shadow: Shadow, scale: number, inset = false): string => {
  const radians = shadow.angle * Math.PI / 180;
  const distance = shadow.distance * scale;
  return `${inset ? "inset " : ""}${rem(distance * Math.sin(radians))} ${
    rem(distance * Math.cos(radians))
  } ${rem(shadow.blur * scale)} rgba(0, 0, 0, ${round(shadow.opacity)})`;
};

export const skinVars = (skin: Skin): Record<`--skin-${string}`, string> => ({
  "--skin-text-spacing": String(skin.textSpacing),
  "--skin-code-text-spacing": String(codeTextSpacing(skin.textSpacing)),
  "--skin-gap": rem(skin.layoutSpacing),
  "--skin-corner-radius": rem(skin.cornerRounding),
  "--skin-column-shadow": shadowCss(skin.columnShadow, 1),
  "--skin-thumb-shadow": shadowCss(skin.columnShadow, thumbShadowScale),
  "--skin-inset-shadow": shadowCss(
    { ...skin.columnShadow, opacity: skin.columnShadow.opacity * insetShadowOpacity },
    insetShadowScale,
    true,
  ),
  "--skin-faint-inset-shadow": shadowCss(
    { ...skin.columnShadow, opacity: skin.columnShadow.opacity * faintInsetShadowOpacity },
    faintInsetShadowScale,
    true,
  ),
  "--skin-chat-inset-shadow": shadowCss(
    {
      ...skin.columnShadow,
      opacity: skin.columnShadow.opacity * faintInsetShadowOpacity * chatInsetShadowOpacity,
    },
    faintInsetShadowScale,
    true,
  ),
  "--skin-heading-font": fontStack(skin.headingFont),
  "--skin-body-font": fontStack(skin.bodyFont),
  "--skin-code-font": fontStack(skin.codeFont),
  "--skin-column-padding-x": rem(skin.columnPadding),
  "--skin-column-padding-top": rem(Math.max(0, skin.columnPadding - columnPaddingSkew)),
  "--skin-column-padding-bottom": rem(skin.columnPadding + columnPaddingSkew),
  "--skin-column-heading-weight": String(skin.columnHeadingWeight),
  "--skin-column-heading-alpha": percent(skin.columnHeadingOpacity),
  "--skin-widget-heading-weight": String(skin.widgetHeadingWeight),
  "--skin-widget-heading-alpha": percent(skin.widgetHeadingOpacity),
});
