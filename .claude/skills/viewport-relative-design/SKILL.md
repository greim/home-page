---
name: viewport-relative-design
description: This app's viewport-relative design (root font size 1vw, everything sized in rem so the page scales with window width) and its one exception, px hairlines. Use when writing any CSS, styles or Chakra props, sizing an element, or building a widget's UI.
---

# Viewport-relative design

The whole page scales with the width of the window, text included. Resizing the window enlarges or
shrinks everything uniformly, so text never re-wraps and a layout looks the same at every width.

## How it works

The root font size is `1vw` (`rootFontSize` in `src/client/surface.ts`), so `1rem` is 16px (the
browser default) in a window 1600px wide. Chakra is built with this root in
`src/client/chakra-system.ts` (`makeSystem`), and the shell and every widget bundle make their
system from it.

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
- Think in the 1600px reference: a design at 24px is `1.5rem`.
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

## Known caveat

With the root font size in `vw`, browser zoom has almost no effect. If zoom ever matters, add a user
scale factor, e.g. `calc(1vw * var(--user-scale))`.
