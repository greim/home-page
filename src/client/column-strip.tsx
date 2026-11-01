import { Box, Flex } from "@chakra-ui/react";
import { useState } from "react";
import { type Background, type Column, newColumn } from "../common/model.ts";
import { useBoard } from "./board-context.ts";
import { carousel, columnsPerView, revealOffset, stripSlots } from "./carousel.ts";
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
}) {
  const { background } = props;
  const { admin, dispatch } = useBoard();
  const [rawOffset, setOffset] = useState(0);
  const slots = stripSlots(props.columns, admin);
  const view = carousel(rawOffset, slots);
  // When columns are removed, the view slides left to stay full. Keep that as the
  // offset, so it doesn't slide back on its own when the slot count grows again.
  if (rawOffset !== view.offset) setOffset(view.offset);
  const columnIdAt = (i: number) => props.columns.at(i)?.id ?? null;
  // A column just added from the navigator, whose heading opens for editing.
  const [newColumnId, setNewColumnId] = useState<string | null>(null);

  const addColumn = (at: "start" | "end") => {
    const column = newColumn(crypto.randomUUID(), randomIcon());
    dispatch({ is: "add-column", index: at === "start" ? 0 : props.columns.length, column });
    setNewColumnId(column.id);
    // At the end, the new column takes the add-column slot's place.
    setOffset(at === "start" ? 0 : revealOffset(view.offset, slots.length - 1));
  };

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
      {
        /* Statically positioned frame, inset from the viewport by the gap on every side,
          and shortened to make room for the navigator when there is one. */
      }
      <Box
        m={gap}
        h={view.navigable
          ? `calc(100% - 2 * ${gap} - ${navigatorHeight})`
          : `calc(100% - 2 * ${gap})`}
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
                    index={slot.index}
                    count={props.columns.length}
                    editHeading={slot.column.id === newColumnId}
                    onHeadingEditEnd={() => setNewColumnId(null)}
                    neighbors={{
                      prevColumnId: slot.index === 0 ? null : columnIdAt(slot.index - 1),
                      nextColumnId: columnIdAt(slot.index + 1),
                    }}
                  />
                )
                : <AddColumnSlot index={slot.index} />}
            </Box>
          ))}
        </Flex>
      </Box>
      {view.navigable && (
        <ColumnNavigator
          slots={slots}
          offset={view.offset}
          onSlide={setOffset}
          onAdd={addColumn}
        />
      )}
    </Box>
  );
}
