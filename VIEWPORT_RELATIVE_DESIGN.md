# Viewport-Relative Design

## What is Viewport-Relative Design?

It's a layout in which the sizes of all page elements are relative to the width of the viewport,
including font sizes and any other dimensional lengths. So for example, if the user increases the
width of the browser window, the whole page scales both horizontally and vertically.

As a result, resizing the viewport never causes text to re-wrap, resulting in a greater amount of
predictability when making layout and design choices that accommodate different browser viewport
sizes.

## Technique

The key CSS capabilities enabling this are the `vw` and `rem` length units.

Here's a simplified illustration of how it's done:

```css
html {
  /** Sets our REM base unit. */
  font-size: 1vw;
}
body {
  /** Locks in font sizes to scale with viewport width. */
  font-size: 1rem;
}
#left-column {
  /** Locks in page layout to scale with viewport width. */
  width: 20rem;
}
#right-column {
  /** Locks in page layout to scale with viewport width. */
  width: 80rem;
}
```

## Usage in Home Page

I want to use viewport-relative design (VRD) for home page, but we need to do some research first.

One of the issues with VRD is that it's all-or-nothing. If some elements are sized in absolute units
(ems, points, pixels, etc) those elements won't scale with the design and the whole effect is
ruined. _Everything_ has to be sized in REMs, or else relative units. This collides with Chakra UI,
which controls much of its own CSS internal styling.

Hence the research: Is it possible to override Chakra's styling so that buttons, icons, etc, accept
our REM sizings instead of using its own internal absolute units? How is this done?

## Research Findings

**Short answer: yes, and Chakra v3 mostly needs no overriding.** (Audited @chakra-ui/react 3.37.0.)

- **Already rem, scales automatically:** spacing, sizes, font sizes, text styles (incl. line
  heights) and radii. Component recipes size themselves with these tokens (e.g. Button `md` is
  `h: "10"`, `px: "4"`, `_icon: { width: "5" }`), so buttons, icon buttons, inputs and menus scale.
  react-icons default to `1em`, so icons follow font size.
- **Still px:** border widths, focus rings/outlines, shadows, blurs, breakpoints, popover/menu
  `gutter` (set in JS, ~8px), and a few components we don't use (progress-circle, qr-code, slider,
  color-picker area). Keep hairline borders in px so they stay crisp; override shadows/blurs via
  theme tokens and gutters via `positioning={{ gutter }}` if needed.
- **How:** replace `defaultSystem` with a custom system that sets the root size relative to a
  reference width, so Chakra's defaults look exactly as designed at that width:

  ```ts
  const system = createSystem(
    defaultConfig,
    defineConfig({
      globalCss: { html: { fontSize: "calc(100vw * 16 / 1600)" } }, // 1rem = 16px at 1600px wide
    }),
  );
  ```

- **Our own work:** convert the px values in `src/client/surface.ts` (gaps, padding, thumbnail
  sizes, admin bar height, assistant panel width) and stray ones like `boxSize="6px"` to rem/tokens.
- **Caveat:** with root font size in `vw`, browser zoom has almost no effect. If zoom matters, add a
  user scale factor, e.g. `calc(1vw * var(--user-scale))`.

## The Plan

### Make the app use VRD and make it skinnable

Specifically, _non-admin mode elements_ should be skinnable. Admin mode elements that use Chakra
such as the column content editor, etc., don't need to be skinnable.

The app already is partly skinnable, via background colors, etc. I'd like to modify that system to
use VRD, and extend it. Lengths in the skin config will generally be _unitless_. When set into the
CSS, they'll be set using `rem`.

Skin parameters (defaults are my best guess):

| Parameter              | Description                                                                                                                                                                                                                                                                                                     | Default               |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Text spacing           | Internally this will set `line-height` controlling all text on the page. Best practice is it should be set as a _unitless_ value in the CSS directly — no `rem` or percentage unit.                                                                                                                             | 1.7                   |
| Layout spacing         | The space between two columns. Note: other lengths are, and should continue to be, fractions of this. Unitless in the config, `rem` in the CSS.                                                                                                                                                                 | 1.6                   |
| Corner rounding        | The `border-radius` of column rectangles. Note: other lengths are, and should continue to be, fractions of this. Unitless in the config, `rem` in the CSS.                                                                                                                                                      | 1.6                   |
| Column shadow          | The `box-shadow` of column rectangles and column thumbnails. A tuple of blur, distance, opacity, and light angle (degrees west of overhead). Blur and distance are set as `rem` in the CSS.                                                                                                                     | (1.92, 1.0, 0.5, 35°) |
| Heading font           | The `font-family` of headings.                                                                                                                                                                                                                                                                                  | Open Sans             |
| Body font              | The `font-family` of non-heading body text.                                                                                                                                                                                                                                                                     | Open Sans             |
| Code font              | The `font-family` of code/monospace text.                                                                                                                                                                                                                                                                       | Source Code Pro       |
| Column padding         | The amount of padding inside a column. Currently, the vertical and horizontal padding of a column aren't the same number. This value will control both, but a corrective will be applied to maintain the difference. Note that the corrective is not multiplicative, but additive. Applied as `rem` in the CSS. | 1.2                   |
| Column heading weight  | A number applied as `font-weight` to column headings.                                                                                                                                                                                                                                                           | 500                   |
| Column heading opacity | A number applied as `opacity` to column headings.                                                                                                                                                                                                                                                               | 0.5                   |
| Widget heading weight  | A number applied as `font-weight` to widget headings.                                                                                                                                                                                                                                                           | 500                   |
| Widget heading opacity | A number applied as `opacity` to widget headings.                                                                                                                                                                                                                                                               | 0.5                   |

### Give the Assistant the Ability to Screenshot the App

For the assistant to re-skin the app for you, it needs to be able to easily screenshot it. There
should be a way to screenshot the page from within the browser. Research how. If impossible, skip
this feature.

## Implementation Notes

**VRD and skin.** The root font size is `1vw` (`rootFontSize` in `src/client/surface.ts`), so 1rem
is 16px in a 1600px-wide window. The skin is the `skin` field of the layout (`Skin` in
`src/common/model.ts`). Each field defaults on its own, so older layouts and partial skins decode.
`src/client/skin.ts` turns it into `--skin-*` CSS variables, which `surface.ts` styles refer to.

- Column padding: horizontal = `columnPadding`, top = `columnPadding - 0.25`, bottom =
  `columnPadding + 0.25` (rem).
- Corner rounding: columns use it; the navigator thumbnails and the admin bar use half of it.
- Column shadow: a single shadow `0 <distance>rem <blur>rem rgba(0,0,0,<opacity>)`. Thumbnails get
  the same shadow scaled by 0.4.
- Heading opacity applies to the heading's text color (`color-mix` with `fg`), not CSS `opacity`, so
  admin-mode hover outlines on headings aren't faded too.
- Fonts are `{ is: "system", name: string | null, fallback }` or `{ is: "google", name, fallback }`,
  where `fallback` is a generic family (`sans-serif`, `serif`, `monospace`, …). The Google Fonts URL
  isn't stored; it's derived from the names (`src/client/fonts.ts`), requesting every weight 100–900
  upright and italic. Google leaves out the weights a font lacks, and the browser downloads only the
  faces the page uses. Names are limited to letters, digits, spaces and hyphens, so they can't
  inject CSS or URL parameters. Fonts saved as CSS strings (the first version of the skin) still
  decode, as system fonts. The defaults are Open Sans (headings and body) and Source Code Pro
  (code), both from Google.
- Fonts work by pointing Chakra's `--chakra-fonts-*` variables at the skin's fonts on the surface.
  Gotcha: Chakra's `<Theme>` (used by every column) re-declares all its tokens, so the override is
  re-applied on `.chakra-theme` elements.

**Screenshots.** Taking a screenshot from within the browser is possible. Options considered:

- `getDisplayMedia()` captures real pixels, but it asks for permission (a tab picker) every time.
- Server-side headless Chrome needs a browser process and a second login-free copy of the page.
- DOM rendering with `modern-screenshot` (chosen) redraws the DOM through an SVG `foreignObject`. It
  needs no permission, works with same-origin background images and squircle corners, and takes well
  under a second.

With each message to the assistant, the client captures the surface as a JPEG, leaving out the admin
bar and scaling the image to at most 1568px wide. The JPEG is sent base64-encoded with the request
and saved as `screenshot.jpg` in the agent's workspace. The prompt notes when it's there, and the
agent reads it with its Read tool. Limitation: it's taken once per message, so the agent can't see
the effect of its own changes until the next message.
