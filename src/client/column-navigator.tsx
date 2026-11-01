import { Box, chakra, HStack, Theme } from "@chakra-ui/react";
import { type ComponentProps, type ReactNode, useRef, useState } from "react";
import { LuEye, LuEyeOff, LuMove, LuPlus, LuTrash2 } from "react-icons/lu";
import { gapToIndex } from "../common/arrays.ts";
import type { Column } from "../common/model.ts";
import { useBoard } from "./board-context.ts";
import {
  columnsPerView,
  type DropTarget,
  inView,
  nearestGap,
  revealOffset,
  type Side,
  sideOf,
  sideShift,
  type Slot,
} from "./carousel.ts";
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
function Place(props: { side: Side; children: ReactNode }) {
  return (
    <Box
      position="relative"
      display="flex"
      flex="none"
      transform={`translateX(calc(${sideShift(props.side)} * ${outsideShift}))`}
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

/** Color of a drop target nearest a dragged column. */
const targetColor = "yellow.400";

/** Marks a place a dragged column can be dropped: before the column at `gap`. */
const dropTarget = (gap: number) => ({ "data-drop-gap": gap });

/** A drop target's symbol: "+" normally, or a dot while it's where a dragged column will go. */
function TargetSymbol(props: { targeted: boolean }) {
  return props.targeted ? <Box boxSize="6px" rounded="full" bg="currentColor" /> : <LuPlus />;
}

/** A dashed "+" box, like the add-column slot, that adds a column at one end. */
function AddThumbnail(props: {
  label: string;
  gap: number;
  targeted: boolean;
  onClick: () => void;
}) {
  const color = props.targeted ? targetColor : "white";
  return (
    <chakra.button
      {...dropTarget(props.gap)}
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
      color={color}
      borderWidth="2px"
      borderStyle="dashed"
      borderColor={color}
    >
      <TargetSymbol targeted={props.targeted} />
    </chakra.button>
  );
}

/** Radius of the disc atop each insert marker. */
const discRadius = `(3 / 8 * ${gap})`;

/**
 * A dashed line in the space before a thumbnail, topped by a "+" disc, that
 * inserts a column there. The disc's center sits on the outline's top edge.
 * `space` is the width of the space it's centered in, which grows where the
 * outline runs through it.
 */
function InsertMarker(props: {
  label: string;
  gap: number;
  space: string;
  targeted: boolean;
  onClick: () => void;
}) {
  const color = props.targeted ? targetColor : "white";
  return (
    <chakra.button
      {...dropTarget(props.gap)}
      title={props.label}
      aria-label={props.label}
      cursor="pointer"
      onClick={props.onClick}
      position="absolute"
      left={`calc(-1 * ${props.space} / 2)`}
      transform="translateX(-50%)"
      transition="left 300ms ease"
      top={`calc(-1 * ${outsideShift} + ${thumbOutlineWidth} / 2 - ${discRadius})`}
      bottom="0"
      w={`calc(2 * ${discRadius})`}
      display="flex"
      flexDirection="column"
      alignItems="center"
    >
      <Box
        flex="none"
        boxSize={`calc(2 * ${discRadius})`}
        rounded="full"
        bg={color}
        color="gray.900"
        display="flex"
        alignItems="center"
        justifyContent="center"
        fontSize="xs"
      >
        <TargetSymbol targeted={props.targeted} />
      </Box>
      <Box flex="1" borderLeftWidth="2px" borderStyle="dashed" borderColor={color} />
    </chakra.button>
  );
}

/** Pointer and keyboard handlers for a thumbnail's "move" handle. */
type MoveHandle = Pick<
  ComponentProps<"button">,
  "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel" | "onKeyDown"
>;

/** A small icon button in a thumbnail's admin icon row. */
function ThumbIcon(props: ComponentProps<typeof chakra.button> & { label: string }) {
  const { label, ...rest } = props;
  return (
    <chakra.button
      title={label}
      aria-label={label}
      display="flex"
      cursor="pointer"
      color="fg/60"
      _hover={{ color: "fg" }}
      fontSize="xs"
      rounded="xs"
      {...rest}
    />
  );
}

function ColumnThumbnail(props: {
  column: Column;
  admin: boolean;
  visible: boolean;
  moveHandle: MoveHandle;
  onClick: () => void;
  onDelete: () => void;
  onToggleHidden: () => void;
}) {
  const { column, visible, admin } = props;
  const label = column.heading;
  return (
    // Theme picks light or dark text to suit the column's color.
    <Theme
      appearance={appearanceFor(column.color)}
      hasBackground={false}
      position="relative"
      flex={`0 0 ${thumbWidth}`}
      h={thumbHeight}
      {...thumbCorners}
      bg={column.color}
      boxShadow={surface.thumbShadow}
      opacity={column.hidden ? 0.5 : 1}
    >
      <chakra.button
        title={label}
        aria-label={visible ? label : `Show ${label}`}
        aria-current={visible ? "true" : undefined}
        cursor={visible ? "default" : "pointer"}
        onClick={visible ? undefined : props.onClick}
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
          // Leave room for the icon row below.
          lineClamp={admin ? "1" : "2"}
        >
          {label}
        </chakra.span>
      </chakra.button>
      {admin && (
        <HStack position="absolute" left="2" bottom="1.5" gap="2">
          <ThumbIcon
            label={`Move ${label} (drag, or use arrow keys)`}
            cursor="grab"
            touchAction="none"
            _active={{ cursor: "grabbing" }}
            {...props.moveHandle}
          >
            <LuMove />
          </ThumbIcon>
          <ThumbIcon label={`Delete ${label}`} onClick={props.onDelete}>
            <LuTrash2 />
          </ThumbIcon>
          <ThumbIcon
            label={column.hidden ? `Show ${label}` : `Hide ${label}`}
            aria-pressed={column.hidden}
            onClick={props.onToggleHidden}
          >
            {column.hidden ? <LuEye /> : <LuEyeOff />}
          </ThumbIcon>
        </HStack>
      )}
    </Theme>
  );
}

/** Where each drop target in `root` sits along the x axis. */
const dropTargets = (root: HTMLElement | null): ReadonlyArray<DropTarget> =>
  [...(root?.querySelectorAll<HTMLElement>("[data-drop-gap]") ?? [])].map((el) => {
    const rect = el.getBoundingClientRect();
    return { gap: Number(el.dataset["dropGap"]), x: rect.left + rect.width / 2 };
  });

/** A column being dragged by its "move" handle, and the gap it'd be dropped into. */
type Drag = { readonly columnId: string; readonly from: number; readonly gap: number | null };

/**
 * A row of thumbnails, one per strip slot, along the bottom of the viewport. The
 * thumbnails of the columns in view sit centered inside a white outline; the rest
 * extend past it (and off screen, if there are many). Clicking one outside the
 * outline slides its column just into view. When the strip ends with the
 * add-column slot, its thumbnail adds a column at the end.
 *
 * In admin mode, columns are added, moved, hidden and deleted from here: dashed
 * "+" boxes at both ends and markers between thumbnails add columns, and each
 * thumbnail gets a row of icons. Dragging the "move" icon highlights the drop
 * target nearest the pointer; releasing moves the column there.
 */
export function ColumnNavigator(props: {
  slots: ReadonlyArray<Slot>;
  columnCount: number;
  offset: number;
  onSlide: (offset: number) => void;
  /** Adds a column before the column at `index` (or at the end). */
  onAdd: (index: number) => void;
}) {
  const { admin, dispatch } = useBoard();
  const { offset, slots, columnCount } = props;
  const [drag, setDrag] = useState<Drag | null>(null);
  const row = useRef<HTMLDivElement>(null);
  const targeted = (gap: number) => drag?.gap === gap;
  const endsWithColumn = slots.at(-1)?.is === "column";
  // The add-at-start box sits before the first thumbnail, so shift the row left by one.
  const lead = admin ? ` - ${thumbWidth} - ${thumbGap}` : "";

  const move = (columnId: string, toIndex: number) =>
    dispatch({ is: "move-column", columnId, toIndex });

  const moveHandle = (column: Column, index: number): MoveHandle => ({
    onPointerDown: (e) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag({ columnId: column.id, from: index, gap: null });
    },
    onPointerMove: (e) => {
      const gap = nearestGap(dropTargets(row.current), e.clientX);
      if (drag !== null && gap !== drag.gap) setDrag({ ...drag, gap });
    },
    onPointerUp: () => {
      if (drag !== null && drag.gap !== null) move(drag.columnId, gapToIndex(drag.from, drag.gap));
      setDrag(null);
    },
    onPointerCancel: () => setDrag(null),
    onKeyDown: (e) => {
      const delta = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
      if (delta === 0) return;
      e.preventDefault();
      move(column.id, Math.max(0, index + delta));
    },
  });

  return (
    <Box position="absolute" left="0" right="0" bottom={gap} h={thumbHeight}>
      <Box
        ref={row}
        // Above the outline, so the insert markers' discs sit on top of its line.
        position="relative"
        zIndex="1"
        display="flex"
        gap={`calc${thumbGap}`}
        h="full"
        // The thumbnail at `offset` starts where the centered view begins.
        ml={`calc(50% - ${viewWidth} / 2${lead})`}
        transform={`translateX(calc(${-offset} * (${thumbWidth} + ${thumbGap})))`}
        transition="transform 300ms ease"
      >
        {admin && (
          <Place side="left">
            <AddThumbnail
              label="Add column at start"
              gap={0}
              targeted={targeted(0)}
              onClick={() => props.onAdd(0)}
            />
          </Place>
        )}
        {slots.map((slot, i) => {
          const side = sideOf(offset, i);
          const prev = i === 0 ? undefined : slots.at(i - 1);
          return (
            <Place key={slot.is === "column" ? slot.column.id : "add-column"} side={side}>
              {admin && slot.is === "column" && prev?.is === "column" && (
                <InsertMarker
                  label={`Insert column before ${slot.column.heading}`}
                  gap={slot.index}
                  // The space between this thumbnail and the one before it.
                  space={`(${thumbGap} + ${
                    sideShift(side) - sideShift(sideOf(offset, i - 1))
                  } * ${outsideShift})`}
                  targeted={targeted(slot.index)}
                  onClick={() => props.onAdd(slot.index)}
                />
              )}
              {slot.is === "column"
                ? (
                  <ColumnThumbnail
                    column={slot.column}
                    admin={admin}
                    visible={inView(offset, i)}
                    moveHandle={moveHandle(slot.column, slot.index)}
                    onClick={() => props.onSlide(revealOffset(offset, i))}
                    onDelete={() =>
                      confirm(`Delete "${slot.column.heading}" and all its widgets?`) &&
                      dispatch({ is: "remove-column", columnId: slot.column.id })}
                    onToggleHidden={() =>
                      dispatch({
                        is: "set-column-hidden",
                        columnId: slot.column.id,
                        hidden: !slot.column.hidden,
                      })}
                  />
                )
                : (
                  <AddThumbnail
                    label="Add column at end"
                    gap={slot.index}
                    targeted={targeted(slot.index)}
                    onClick={() => props.onAdd(slot.index)}
                  />
                )}
            </Place>
          );
        })}
        {admin && endsWithColumn && (
          <Place side={sideOf(offset, slots.length)}>
            <AddThumbnail
              label="Add column at end"
              gap={columnCount}
              targeted={targeted(columnCount)}
              onClick={() => props.onAdd(columnCount)}
            />
          </Place>
        )}
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
