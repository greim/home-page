import { Box, Flex, IconButton } from "@chakra-ui/react";
import { useState } from "react";
import { LuChevronLeft, LuChevronRight } from "react-icons/lu";
import type { Background, Column } from "../common/model.ts";
import { useBoard } from "./board-context.ts";
import { carousel, columnsPerView, stripSlots } from "./carousel.ts";
import { AddColumnSlot, ColumnView } from "./column-view.tsx";
import { columnCorners, surface } from "./surface.ts";

const { gap } = surface;

/** Width of one column: the view's width, minus the gaps between columns, split evenly. */
const slotWidth = `calc((100% - ${columnsPerView - 1} * ${gap}) / ${columnsPerView})`;

/** Slides the strip so the column at `offset` sits at the left edge of the view. */
const slideTo = (offset: number) => `translateX(calc(${-offset} * (${slotWidth} + ${gap})))`;

const slideButtonSize = "24px";

/** Floats in the gap beside the outermost visible columns, level with their headings. */
function SlideButton(props: {
  side: "left" | "right";
  onClick: () => void;
}) {
  return (
    <IconButton
      aria-label={`Slide columns ${props.side}`}
      position="absolute"
      top={`calc(${gap} + 14px)`}
      {...(props.side === "left"
        ? { left: `calc((${gap} - ${slideButtonSize}) / 2)` }
        : { right: `calc((${gap} - ${slideButtonSize}) / 2)` })}
      zIndex="2"
      size="2xs"
      boxSize={slideButtonSize}
      minW={slideButtonSize}
      rounded="full"
      variant="surface"
      shadow="md"
      onClick={props.onClick}
    >
      {props.side === "left" ? <LuChevronLeft /> : <LuChevronRight />}
    </IconButton>
  );
}

export function ColumnStrip(props: {
  background: Background;
  columns: ReadonlyArray<Column>;
}) {
  const { background } = props;
  const { admin } = useBoard();
  const [rawOffset, setOffset] = useState(0);
  const slots = stripSlots(props.columns, admin);
  const view = carousel(rawOffset, slots.length);
  const columnIdAt = (i: number) => props.columns.at(i)?.id ?? null;

  return (
    // The surface fills the viewport and clips columns slid out of view.
    <Box
      position="relative"
      h="100vh"
      overflow="hidden"
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
      {view.canSlideLeft && <SlideButton side="left" onClick={() => setOffset(view.offset - 1)} />}
      {view.canSlideRight && (
        <SlideButton
          side="right"
          onClick={() => setOffset(view.offset + 1)}
        />
      )}
      {/* Statically positioned frame, inset from the viewport by the gap on every side. */}
      <Box m={gap} h={`calc(100% - 2 * ${gap})`}>
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
    </Box>
  );
}
