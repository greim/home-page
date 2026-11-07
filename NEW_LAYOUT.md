# New layout

This app is largely inspired by its predecessor, which also used
[viewport relative design](./VIEWPORT_RELATIVE_DESIGN.md):

![screenshot](./look-at-this-layout.png)

This doc explores the adoption of that look and feel for this home page. Note
that a lot of implementation details for that design can be inferred from
[its CSS](./look-at-this-layout.css)

## Highlights

### The time widget

Shows a sun/moon icon plus the date in this format:

> YYYY / MMM / D / H:SS a

Sun displays between 9:00 AM AND 5:00 PM, moon between 5:00 PM and 9:00 AM. This
should replace the existing time widget.

### Only "bookmark" widgets have headings and collapsibility

### The "workday" widget

An animated progress bar with 3 time-related states:

- Workday — Tracks progress from 9:00 AM - 5:00 PM on weekdays
- After Hours — Tracks progress from 5:00 PM to 9:00 AM between successive
  weekdays
- Weekend — Tracks progress from 5:00 PM Friday to 9:00 AM Monday

### Night mode

At night, the layout gradually transitions to night.

![screenshot](./look-at-this-layout-dark.png)

### Monospace font

Everything uses `font-family: monospace`.

### List styles

List styles use CSS to draw box-drawing characters.

## How does this reconcile with skinnability?

I want to remove most skinnability features. The only things that remain
customizable are column background colors, and even then, I want to limit how
that works. They must be implemented using
[OKLCH colors](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/color_value/oklch).
For example, the four colors in the screenshot are:

```
oklch(0.63553 0.0185455 104.283)
oklch(0.63553 0.0110218 222.288)
oklch(0.63553 0.0238316 322.557)
oklch(0.63553 0.0252648 23.606)
```

We'll limit colors to this template: `oklch(0.63553 ${c} ${h})`. The user can
only adjust the `c` and `h` components of this template. Foreground color is
always white. These colors will still transition to `#4a4a4a` in night mode. The
reason for using OKLCH is its perceptual uniformity. Different OKLCH colors
desaturate uniformly toward the same shade of gray.

## How does this reconcile with column icons?

We keep that feature. Columns continue to have custom icons.

## How does this reconcile with the admin bar and the column thumbnails?

The columns should still shorten to accommodate these elements, the way they do
in the current layout.
