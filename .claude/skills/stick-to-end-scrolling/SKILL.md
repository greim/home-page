---
name: stick-to-end-scrolling
description: How to make a growing scroll area (chat transcript, log, agent output) behave like a terminal — stuck to the end while the user is there, still once they scroll away — using a column-reverse flex scroller instead of scripting. Use when building or fixing any auto-scrolling list, chat or output view.
---

# Terminal-style scrolling (stick to the end)

Wanted behavior: if the view is scrolled to the end, it stays at the end as content grows;
if the user scrolls away, new content never moves their view; scrolling back to the end
re-pins it.

## Do this: a column-reverse scroller

```tsx
<Box flex="1" minH="0" overflowY="auto" display="flex" flexDirection="column-reverse">
  <Stack flexShrink="0" mb="auto">…content…</Stack>
</Box>
```

- `column-reverse` makes the scroll origin the bottom, so the browser itself keeps the view
  pinned while the user is at the end, and scroll anchoring holds the view still once they
  scroll away. No effect, no listener, nothing to race the layout.
- Use a single child, so the DOM order stays natural (no reversing entries; selection and
  reading order are unaffected).
- `flexShrink="0"` stops the child being squeezed to the viewport height.
- `mb="auto"` keeps short content at the top rather than the bottom.
- The scroller needs a bounded height (`minH="0"` inside a flex column, or a fixed height).

## Don't do this

Scripted pinning fails intermittently ("new stuff often still gets pushed below the fold"):

- `scrollIntoView` / `scrollTop = scrollHeight` in a `useEffect` runs before or between
  other renders that add or expand content, and it never lets go when the user scrolls up.
- A `ResizeObserver` plus an `onScroll` "at end" flag is better but still racy: a scroll
  event between a large content jump and the re-pin flips the flag and unpins the view.

Used by the assistant's transcript (src/client/assistant/assistant-panel.tsx) and the page
configurator's chat (src/client/widgets/page-configurator/page-configurator.tsx).
