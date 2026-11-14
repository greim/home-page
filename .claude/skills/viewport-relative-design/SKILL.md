---
name: viewport-relative-design
description: This app's adaptable viewport-relative design (layout regimes: a whole number of columns per window width, root font size a fixed fraction of the width within each regime, everything sized in rem) and its one exception, px hairlines. Use when writing any CSS, styles or Chakra props, sizing an element, or building a widget's UI.
---

# Adaptable viewport-relative design

Within a layout regime the whole page scales with the width of the window, text included, so text
never re-wraps and the layout looks the same at every width in that regime. Crossing a regime
boundary changes the number of columns and the size of `1rem`.

## How it works

A regime is a range of window widths showing a whole number of columns (`src/client/regimes.ts`). A
column is 24rem and a gap 1rem, so `n` columns span `25n + 1` rem. The root font size is
`calc(100vw / (25n + 1))`, set per regime by media queries (`regimeRootFontSizes`, used by
`makeSystem` in `src/client/chakra-system.ts`; the shell and every widget bundle make their system
from it). At `500n + 20` px wide (the middle of the regime) columns are 480px, gaps 20px and `1rem`
is 20px. Boundaries sit midway between neighbouring optimal widths (770px, 1270px, 1770px, ...), up
to 12 columns. `useColumnsPerView` re-reads the regime on resize; the carousel functions take
`columnsPerView` as an argument. Browser zoom works: zooming in narrows the CSS viewport, which
moves it to a regime with fewer columns.

Chakra v3 sizes its own spacing, sizes, font sizes, line heights and radii in rem, so its components
(buttons, inputs, menus) scale with no overrides. react-icons default to `1em`, so icons follow the
font size.

## The rule: size everything in rem

It's all or nothing. One element sized in absolute units won't scale with the rest and breaks the
effect.

- Use `rem`, Chakra tokens (`p="4"`, `h="10"`, `fontSize="sm"`), `em` for things that should follow
  local font size, or unitless values (`lineHeight`, flex ratios). Percentages and `vw`/`vh` are
  fine where they mean what you want.
- **Never** use `px`, `pt` or other absolute units for widths, heights, padding, margins, gaps, font
  sizes, radii, positions or the blur and offset of a shadow that occupies visual space.
- Think in the 20px reference (`1rem` at the middle of a regime): a design at 30px is `1.5rem`.
- Put shared page lengths in `surface` in `src/client/surface.ts` instead of repeating literals.
- Set `line-height` unitless (e.g. `textSpacing` in `surface.ts`), never in rem or %.

## The exception: hairlines stay px

A hairline is the thinnest line the screen can draw cleanly, and it's 1px whatever the scale. Keep
hairlines in px so they stay crisp. They're subtle accents, not layout. Typical uses:

- **Inset / outset text:** `text-shadow: -1px -1px 0 rgba(0,0,0,0.3)` (or `1px 1px` for outset)
- **Grooves:** `border-top: 1px solid rgba(0,0,0,0.3)` plus
  `box-shadow: 0 1px 0 rgba(255,255,255,0.3)`
- **Bevels:** `box-shadow: 1px 1px 0 rgba(0,0,0,0.3)`

The same goes for thin borders, outlines and focus rings (`1px`/`2px`, `outlineOffset="2px"`).

## Things in Chakra that are still px

Border widths, focus rings, shadows, blurs, breakpoints, and the popover/menu `gutter` (set in JS,
about 8px). Borders and rings are hairlines and are fine. If a shadow, blur or gutter visibly
doesn't scale, override it: shadows and blurs through theme tokens, gutters with
`positioning={{ gutter }}`.

The picture-in-picture window is the exception to regimes: it uses a fixed 16px root
(`windowRootFontSize`) and reflows instead of scaling.
