# Stable Admin Layout

_Note: I've switched to a branch "stable-admin-layout" for this work._

## Proposal

Within a column, I want toggling in and out of admin mode to not change the layout or add/remove
elements, _at all_. What you see is what you get. All admin actions are initiated by clicks on
existing elements, such that the same content tree is rendered in either mode. No add/insert widget
buttons, menus with popouts, color selectors, etc.

This raises the question of how existing workflows are activated, since their controls go away.

### Column Create/Delete/Move

These actions will be done from the column navigator, which already has controls to append and
prepend. It now appears whenever admin mode is activated. Column thumbnails currently have a
heading, but the body is blank space. In admin mode, an icon row appears in the body. Icons include
"move", "delete", and "hide", described below.

**Workflows:**

- **Append/prepend column** — No changes to existing behavior.
- **Insert column** — Between each thumbnail, a dashed vertical line appears, using the same styles
  as the append/prepend box borders. The line being thin makes it a difficult target to click. Thus,
  the top of the line terminates in a disc, the center of which vertically aligns with the top edge
  of the selected-columns outline, for visual synergy. The disc's radius is 3/8 {gap}. The disc
  contains a "+" symbol. Clicking anywhere on this combined element inserts a new column at that
  position.
- **Move column** — Clicking and dragging the "move" icon in the thumbnail moves the column. The
  thumbnail itself is not animated with the drag. Rather, the nearest insert marker OR
  append/prepend box turns yellow and its "+" symbol changes to a dot, signifying that it's now a
  target. The column is only moved on drag release.
- **Delete column** — Clicking the "delete" icon in the thumbnail deletes the column.
- **Hide column** — Clicking the "hide" icon in the thumbnail hides the column.

### Column Attributes

- **Heading** — Clicking the heading causes it to change into an editable text field, focused and
  with its contents selected. Hitting enter from within this field saves the heading. Escaping from
  within the field cancels the change.
- **Icon** — Clicking the icon launches the icon selector.
- **Background** — Clicking anywhere on the background opens the _column content editor_, which
  includes controls for editing the background.

### Widgets

Clicking anywhere on a widget in admin mode launches the _column content editor_ with that widget
selected.

## The Column Content Editor

This is a modal dialog allowing you to edit any column attribute, or any widget in that column. It
has a three part layout:

1. A section at the top spanning the full horizontal width of the modal, for editing column
   attributes including heading, icon, and background.
2. A left column under the top section listing widgets. Widgets within this list can be dragged up
   and down to reorder, deleted, sent to another column, or selected.
3. A right column under the top section showing the currently-selected widget's editor. If no widget
   is selected this section is blank, with x/y centered text saying "select a widget to edit".

## Non-Buttons as Buttons

This spec asks you to treat some non-button elements as buttons. For example, clicking the column
heading to edit it. I'm okay with this, as long as we do the following:

1. Add `role="button"` to those elements while admin mode is active.
1. Add `tabindex="0"` to those elements while admin mode is active.
1. Add `aria-label="..."` to those elements while admin mode is active.
1. Style those elements to use `cursor: pointer` while admin mode is active. Perhaps the styling can
   select the `role` attribute.
