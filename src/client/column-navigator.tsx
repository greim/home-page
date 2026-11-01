import { Box, chakra, Theme } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { LuPlus } from "react-icons/lu";
import { columnsPerView, inView, revealOffset, type Slot } from "./carousel.ts";
import { appearanceFor } from "./contrast.ts";
import { columnCorners, surface } from "./surface.ts";

const { gap, thumbWidth, thumbHeight, thumbOutlineWidth } = surface;

/** Space between neighboring thumbnails, and between the outline and the thumbnails beside it. */
const thumbGap = `(${gap} / 2)`;

/** Width of the thumbnails for the columns in view, including the gaps between them. */
const viewWidth = `(${columnsPerView} * ${thumbWidth} + ${columnsPerView - 1} * ${thumbGap})`;

/**
 * How far thumbnails outside the outline are pushed away from it, so that where
 * the outline runs between two thumbnails, each keeps a thumbGap from its line.
 */
const outsideShift = `(${thumbGap} + ${thumbOutlineWidth})`;

/** Holds a thumbnail, nudged away from the outline when it's outside it. */
function Place(props: { side: "left" | "in" | "right"; children: ReactNode }) {
  const shift = props.side === "left" ? "-1" : props.side === "right" ? "1" : "0";
  return (
    <Box
      display="flex"
      flex="none"
      transform={`translateX(calc(${shift} * ${outsideShift}))`}
      transition="transform 300ms ease"
    >
      {props.children}
    </Box>
  );
}

/** Space the navigator takes below the columns: one gap above it plus its own height. */
export const navigatorHeight = `(${gap} + ${thumbHeight})`;

const thumbCorners = {
  borderRadius: `calc(${gap} / 2)`,
  cornerShape: surface.cornerShape,
} as const;

/** A dashed "+" box, like the add-column slot, that adds a column at one end. */
function AddThumbnail(props: { label: string; onClick: () => void }) {
  return (
    <chakra.button
      title={props.label}
      aria-label={props.label}
      cursor="pointer"
      onClick={props.onClick}
      flex={`0 0 ${thumbWidth}`}
      h={thumbHeight}
      {...thumbCorners}
      display="flex"
      alignItems="center"
      justifyContent="center"
      color="white"
      borderWidth="2px"
      borderStyle="dashed"
      borderColor="white"
    >
      <LuPlus />
    </chakra.button>
  );
}

function Thumbnail(props: {
  slot: Slot;
  visible: boolean;
  onClick: () => void;
  onAdd: () => void;
}) {
  const { slot, visible } = props;
  const label = slot.is === "column" ? slot.column.heading : "Add column";
  const button = {
    title: label,
    "aria-label": visible ? label : `Show ${label}`,
    "aria-current": visible ? ("true" as const) : undefined,
    cursor: visible ? "default" : "pointer",
    onClick: visible ? undefined : props.onClick,
  };
  return slot.is === "column"
    ? (
      // Theme picks light or dark text to suit the column's color.
      <Theme
        appearance={appearanceFor(slot.column.color)}
        hasBackground={false}
        flex={`0 0 ${thumbWidth}`}
        h={thumbHeight}
        {...thumbCorners}
        bg={slot.column.color}
        boxShadow={surface.thumbShadow}
        opacity={slot.column.hidden ? 0.5 : 1}
      >
        <chakra.button
          {...button}
          w="full"
          h="full"
          display="flex"
          alignItems="start"
          px="2"
          py="1.5"
          overflow="hidden"
        >
          <chakra.span
            fontSize="2xs"
            lineHeight="short"
            color="fg/60"
            textAlign="start"
            lineClamp="2"
          >
            {slot.column.heading}
          </chakra.span>
        </chakra.button>
      </Theme>
    )
    : <AddThumbnail label="Add column at end" onClick={props.onAdd} />;
}

/**
 * A row of thumbnails, one per strip slot, along the bottom of the viewport. The
 * thumbnails of the columns in view sit centered inside a white outline; the rest
 * extend past it (and off screen, if there are many). Clicking one outside the
 * outline slides its column just into view. When the strip ends with the
 * add-column slot, its thumbnail and a matching one at the start add a column there.
 */
export function ColumnNavigator(props: {
  slots: ReadonlyArray<Slot>;
  offset: number;
  onSlide: (offset: number) => void;
  onAdd: (at: "start" | "end") => void;
}) {
  const { offset } = props;
  const canAdd = props.slots.at(-1)?.is === "add-column";
  // The add-at-start box sits before the first thumbnail, so shift the row left by one.
  const lead = canAdd ? ` - ${thumbWidth} - ${thumbGap}` : "";
  const side = (i: number) => i < offset ? "left" : inView(offset, i) ? "in" : "right";
  return (
    <Box position="absolute" left="0" right="0" bottom={gap} h={thumbHeight}>
      <Box
        display="flex"
        gap={`calc${thumbGap}`}
        h="full"
        // The thumbnail at `offset` starts where the centered view begins.
        ml={`calc(50% - ${viewWidth} / 2${lead})`}
        transform={`translateX(calc(${-offset} * (${thumbWidth} + ${thumbGap})))`}
        transition="transform 300ms ease"
      >
        {canAdd && (
          <Place side="left">
            <AddThumbnail
              label="Add column at start"
              onClick={() => props.onAdd("start")}
            />
          </Place>
        )}
        {props.slots.map((slot, i) => (
          <Place key={slot.is === "column" ? slot.column.id : "add-column"} side={side(i)}>
            <Thumbnail
              slot={slot}
              visible={inView(offset, i)}
              onClick={() =>
                props.onSlide(revealOffset(offset, i))}
              onAdd={() =>
                props.onAdd("end")}
            />
          </Place>
        ))}
      </Box>
      {/* The outline's line sits a thumbGap out from the visible thumbnails on every side. */}
      <Box
        position="absolute"
        pointerEvents="none"
        left={`calc(50% - ${viewWidth} / 2 - ${outsideShift})`}
        width={`calc(${viewWidth} + 2 * ${outsideShift})`}
        top={`calc(-1 * ${outsideShift})`}
        bottom={`calc(-1 * ${outsideShift})`}
        borderWidth={thumbOutlineWidth}
        borderStyle="solid"
        borderColor="rgba(255, 255, 255, 0.5)"
        {...columnCorners}
      />
    </Box>
  );
}
