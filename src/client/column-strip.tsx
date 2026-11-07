import { Box, Flex } from "@chakra-ui/react";
import { type ReactNode, useEffect, useState } from "react";
import { type Column, newColumn } from "../common/model.ts";
import { adminModeKey, useBoard } from "./board-context.ts";
import { adminButtonStyles } from "./admin-button.ts";
import {
  carousel,
  columnsPerView,
  frameHeight,
  leadingColumnId,
  offsetOfColumn,
  revealOffset,
  showNavigator,
  stripSlots,
} from "./carousel.ts";
import { ColumnNavigator, navigatorHeight } from "./column-navigator.tsx";
import { AddColumnSlot, ColumnView } from "./column-view.tsx";
import { randomIcon } from "./icon-set.ts";
import { screenshotRootId } from "./screenshot.ts";
import { Starfield } from "./starfield-view.tsx";
import {
  columnCorners,
  columnCornersTransition,
  night as nightStyle,
  pageTypography,
  surface,
  surfaceColors,
} from "./surface.ts";

const { gap } = surface;

/** Width of one column: the view's width, minus the gaps between columns, split evenly. */
const slotWidth = `calc((100% - ${columnsPerView - 1} * ${gap}) / ${columnsPerView})`;

/** Where the column at the left edge of the view is remembered, so a reload keeps the view. */
const leadingColumnKey = "home-page.leading-column";

/** Storage can be unavailable (e.g. private windows); the view then starts at the beginning. */
const loadLeadingColumn = (): string | null => {
  try {
    return localStorage.getItem(leadingColumnKey);
  } catch {
    return null;
  }
};

const storeLeadingColumn = (columnId: string | null) => {
  try {
    if (columnId === null) localStorage.removeItem(leadingColumnKey);
    else localStorage.setItem(leadingColumnKey, columnId);
  } catch {
    // Not saved: the view just won't survive a reload.
  }
};

/** Slides the strip so the column at `offset` sits at the left edge of the view. */
const slideTo = (offset: number) => `translateX(calc(${-offset} * (${slotWidth} + ${gap})))`;

export function ColumnStrip(props: {
  columns: ReadonlyArray<Column>;
  /**
   * The admin bar, which positions itself along the top of the surface. In admin
   * mode the columns shrink to make room for it.
   */
  adminBar: ReactNode;
}) {
  const { admin, dispatch, night, nightPace } = useBoard();
  const slots = stripSlots(props.columns, admin);
  const [rawOffset, setOffset] = useState(() => offsetOfColumn(loadLeadingColumn(), slots));
  const view = carousel(rawOffset, slots);
  const leadingId = leadingColumnId(view.offset, slots);
  useEffect(() => storeLeadingColumn(leadingId), [leadingId]);
  // When columns are removed, the view slides left to stay full. Keep that as the
  // offset, so it doesn't slide back on its own when the slot count grows again.
  if (rawOffset !== view.offset) setOffset(view.offset);
  const navigator = showNavigator(view, admin);
  // A column just added from the navigator, whose heading opens for editing.
  const [newColumnId, setNewColumnId] = useState<string | null>(null);

  /** Adds a column before the one at `index`, and slides it into view. */
  const addColumn = (index: number) => {
    const column = newColumn(crypto.randomUUID(), randomIcon());
    dispatch({ is: "add-column", index, column });
    setNewColumnId(column.id);
    // The navigator only adds columns in admin mode, where every column has a
    // slot, so the new column's slot index is its column index.
    setOffset(revealOffset(view.offset, index));
  };

  // Columns hang from the top of the window. In admin mode they sit below the
  // admin bar instead, half a gap from it.
  const frameTop = admin ? `calc(${surface.adminBarHeight} + ${gap} / 2)` : "0px";

  return (
    // The surface fills the viewport and clips columns slid out of view.
    <Box
      id={screenshotRootId}
      position="relative"
      h="100vh"
      // clip, not hidden: focusing an input in an off-view column mustn't scroll the surface.
      overflow="clip"
      // Unlike hidden, clip doesn't contain the frame's top margin; flow-root does.
      display="flow-root"
      bgColor={surface.bg}
      transition={`background-color ${nightPace}`}
      isolation="isolate"
      css={{ ...surfaceColors(night), ...adminButtonStyles, ...pageTypography }}
    >
      {props.adminBar}
      {
        /* Statically positioned frame, flush with the top of the viewport (or half
          a gap below the admin bar) and inset by the gap on its other sides, and shortened to make room for
          the navigator when it's shown. It animates as the admin bar comes and goes. */
      }
      <Box
        m={gap}
        mt={frameTop}
        h={frameHeight({ top: frameTop, bottom: gap }, navigator ? [navigatorHeight] : [])}
        transition={`margin-top ${surface.adminTransition}, height ${surface.adminTransition}`}
        _motionReduce={{ transition: "none" }}
      >
        <Flex
          h="full"
          gap={gap}
          transform={slideTo(view.offset)}
          transition="transform 300ms ease"
          isolation="isolate"
        >
          {slots.map((slot) => (
            <Box
              key={slot.is === "column" ? slot.column.id : "add-column"}
              flex={`0 0 ${slotWidth}`}
              maxW={slotWidth}
              h="full"
              position="relative"
              // Shadows go on a layer beneath every column (z-index -1 within the
              // isolated strip), so no column's shadow falls across its neighbor.
              _before={slot.is === "column"
                ? {
                  content: '""',
                  position: "absolute",
                  inset: "0",
                  ...columnCorners(admin),
                  transition: columnCornersTransition,
                  zIndex: "-1",
                  boxShadow: surface.columnShadow,
                }
                : {}}
            >
              {slot.is === "column"
                ? (
                  <ColumnView
                    column={slot.column}
                    editHeading={slot.column.id === newColumnId}
                    onHeadingEditEnd={() => setNewColumnId(null)}
                  />
                )
                : <AddColumnSlot index={slot.index} />}
            </Box>
          ))}
        </Flex>
      </Box>
      {navigator && (
        <ColumnNavigator
          slots={slots}
          columnCount={props.columns.length}
          offset={view.offset}
          onSlide={setOffset}
          onAdd={addColumn}
        />
      )}
      {
        /* How to toggle admin mode, in the bottom-left corner. */
      }
      <Box
        position="absolute"
        left="1"
        bottom="1"
        px="1.5"
        py="0.5"
        fontSize="66%"
        lineHeight="1"
        color={surface.ink}
        pointerEvents="none"
        userSelect="none"
      >
        Press {adminModeKey} to {admin ? "exit" : "enter"} admin mode
      </Box>
      <Starfield night={night} pace={nightPace} fresh={nightPace === nightStyle.transition} />
    </Box>
  );
}
