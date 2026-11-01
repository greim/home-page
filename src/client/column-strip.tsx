import { Box, Flex } from "@chakra-ui/react";
import { type ReactNode, useState } from "react";
import { type Background, type Column, newColumn } from "../common/model.ts";
import { useBoard } from "./board-context.ts";
import { adminButtonStyles } from "./admin-button.ts";
import {
  carousel,
  columnsPerView,
  frameHeight,
  revealOffset,
  showNavigator,
  stripSlots,
} from "./carousel.ts";
import { ColumnNavigator, navigatorHeight } from "./column-navigator.tsx";
import { AddColumnSlot, ColumnView } from "./column-view.tsx";
import { randomIcon } from "./icon-set.ts";
import { columnCorners, surface } from "./surface.ts";

const { gap } = surface;

/** Width of one column: the view's width, minus the gaps between columns, split evenly. */
const slotWidth = `calc((100% - ${columnsPerView - 1} * ${gap}) / ${columnsPerView})`;

/** Slides the strip so the column at `offset` sits at the left edge of the view. */
const slideTo = (offset: number) => `translateX(calc(${-offset} * (${slotWidth} + ${gap})))`;

export function ColumnStrip(props: {
  background: Background;
  columns: ReadonlyArray<Column>;
  /**
   * The admin bar, which positions itself along the top of the surface. In admin
   * mode the columns shrink to make room for it.
   */
  adminBar: ReactNode;
}) {
  const { background } = props;
  const { admin, dispatch } = useBoard();
  const [rawOffset, setOffset] = useState(0);
  const slots = stripSlots(props.columns, admin);
  const view = carousel(rawOffset, slots);
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

  // In admin mode the frame sits below the admin bar, half a gap from it.
  const frameTop = admin ? `calc(${surface.adminBarHeight} + ${gap} / 2)` : gap;

  return (
    // The surface fills the viewport and clips columns slid out of view.
    <Box
      position="relative"
      h="100vh"
      // clip, not hidden: focusing an input in an off-view column mustn't scroll the surface.
      overflow="clip"
      // Unlike hidden, clip doesn't contain the frame's top margin; flow-root does.
      display="flow-root"
      bgColor={background.color}
      isolation="isolate"
      css={adminButtonStyles}
    >
      {
        /* The tiled image, on its own layer (beneath everything) so its opacity
          lets the background color show through without fading the columns. */
      }
      {background.imageUrl !== null && (
        <Box
          position="absolute"
          inset="0"
          zIndex="-1"
          pointerEvents="none"
          bgImage={`url(${background.imageUrl})`}
          bgRepeat="repeat"
          opacity={background.opacity}
        />
      )}
      {props.adminBar}
      {
        /* Statically positioned frame, inset from the viewport by the gap on every
          side (or half a gap below the admin bar), and shortened to make room for
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
                  ...columnCorners,
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
    </Box>
  );
}
