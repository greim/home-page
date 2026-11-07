import { Box, chakra, HStack, Popover, Portal, Theme } from "@chakra-ui/react";
import { type ComponentProps, type ReactNode, useRef, useState } from "react";
import { LuEye, LuEyeOff, LuMove, LuPalette, LuPlus, LuTrash2 } from "react-icons/lu";
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
import { ColorPicker } from "./color-picker.tsx";
import { appearanceFor } from "./contrast.ts";
import { smallCorners, surface } from "./surface.ts";

const { gap, thumbWidth, thumbHeight, thumbOutlineWidth } = surface;

/** Space between the outline and the thumbnails beside it. */
const outlinePad = `(${gap} / 2)`;

/** How far the outline's outer edge sits from the visible thumbnails on every side. */
const outlineInset = `(${outlinePad} + ${thumbOutlineWidth})`;

/** Horizontal sizes along the row, which spreads out in admin mode to make room for markers. */
type Spacing = {
  /** Space between neighboring thumbnails. */
  readonly thumbGap: string;
  /** Width of the thumbnails for the columns in view, including the gaps between them. */
  readonly viewWidth: string;
  /**
   * How far thumbnails outside the outline are pushed away from it, so that where
   * the outline runs between two thumbnails, each keeps an outlinePad from its line.
   */
  readonly outsideShift: string;
};

const spacingFor = (admin: boolean): Spacing => {
  const thumbGap = admin ? gap : `(${gap} / 2)`;
  return {
    thumbGap,
    viewWidth: `(${columnsPerView} * ${thumbWidth} + ${columnsPerView - 1} * ${thumbGap})`,
    outsideShift: `(2 * ${outlinePad} + ${thumbOutlineWidth} - ${thumbGap})`,
  };
};

/** Holds a thumbnail, nudged `shift` away from the outline when it's outside it. */
function Place(props: { side: Side; shift: string; children: ReactNode }) {
  return (
    <Box
      position="relative"
      display="flex"
      flex="none"
      transform={`translateX(calc(${sideShift(props.side)} * ${props.shift}))`}
      transition="transform 300ms ease"
    >
      {props.children}
    </Box>
  );
}

/** Space the navigator takes below the columns: one gap above it plus its own height. */
export const navigatorHeight = `(${gap} + ${thumbHeight})`;

const thumbCorners = smallCorners;

/** Color of a drop target nearest a dragged column. */
const targetColor = "yellow.400";

/** Marks a place a dragged column can be dropped: before the column at `gap`. */
const dropTarget = (gap: number) => ({ "data-drop-gap": gap });

/** A drop target's symbol: "+" normally, or a dot while it's where a dragged column will go. */
function TargetSymbol(props: { targeted: boolean }) {
  return props.targeted ? <Box boxSize="0.375rem" rounded="full" bg="currentColor" /> : <LuPlus />;
}

/** A dashed "+" box, like the add-column slot, that adds a column at one end. */
function AddThumbnail(props: {
  label: string;
  gap: number;
  targeted: boolean;
  onClick: () => void;
}) {
  const color = props.targeted ? targetColor : surface.ink;
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
 * A dashed line in the space before a thumbnail, with a "+" disc at its middle,
 * that inserts a column there. The line spans the thumbnails' height.
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
  const color = props.targeted ? targetColor : surface.ink;
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
      top="0"
      bottom="0"
      w={`calc(2 * ${discRadius})`}
      display="flex"
      justifyContent="center"
    >
      <Box borderLeftWidth="2px" borderStyle="dashed" borderColor={color} />
      <Box
        position="absolute"
        top="50%"
        transform="translateY(-50%)"
        boxSize={`calc(2 * ${discRadius})`}
        rounded="full"
        bg={color}
        color={surface.bg}
        display="flex"
        alignItems="center"
        justifyContent="center"
        fontSize="xs"
      >
        <TargetSymbol targeted={props.targeted} />
      </Box>
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

/**
 * A thumbnail's palette icon, which opens the column color swatches just above
 * the navigator. Picks apply at once, so the column itself is the preview.
 */
function ColorButton(props: { label: string; value: string; onChange: (color: string) => void }) {
  return (
    <Popover.Root positioning={{ placement: "top" }} lazyMount unmountOnExit>
      <Popover.Trigger asChild>
        <ThumbIcon label={`Change ${props.label} background color`}>
          <LuPalette />
        </ThumbIcon>
      </Popover.Trigger>
      <Portal>
        <Popover.Positioner>
          <Popover.Content width="auto">
            <Popover.Arrow>
              <Popover.ArrowTip />
            </Popover.Arrow>
            <Popover.Body p="3">
              <ColorPicker
                label={`${props.label} background color`}
                value={props.value}
                onChange={props.onChange}
              />
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
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
  onColor: (color: string) => void;
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
          <ColorButton label={label} value={column.color} onChange={props.onColor} />
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
 * thumbnails of the columns in view sit centered inside an outline; the rest
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
  const { thumbGap, viewWidth, outsideShift } = spacingFor(admin);
  const [drag, setDrag] = useState<Drag | null>(null);
  const row = useRef<HTMLDivElement>(null);
  const targeted = (gap: number) => drag?.gap === gap;
  const endsWithColumn = slots.at(-1)?.is === "column";

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
        // Above the outline, so the insert markers sit on top of its line.
        position="relative"
        zIndex="1"
        display="flex"
        gap={`calc(${thumbGap})`}
        h="full"
        // The thumbnail at `offset` starts where the centered view begins.
        ml={`calc(50% - ${viewWidth} / 2)`}
        transform={`translateX(calc(${-offset} * (${thumbWidth} + ${thumbGap})))`}
        // Spacing animates along with the outline when admin mode toggles.
        transition="transform 300ms ease, margin-left 300ms ease, gap 300ms ease"
      >
        {admin && (
          // Out of the flow, just before the first thumbnail, so adding it doesn't
          // shift the row (which would fight the row's spacing transition).
          <Box
            position="absolute"
            right="100%"
            top="0"
            bottom="0"
            display="flex"
            mr={`calc(${thumbGap})`}
          >
            <Place side="left" shift={outsideShift}>
              <AddThumbnail
                label="Add column at start"
                gap={0}
                targeted={targeted(0)}
                onClick={() => props.onAdd(0)}
              />
            </Place>
          </Box>
        )}
        {slots.map((slot, i) => {
          const side = sideOf(offset, i);
          const prev = i === 0 ? undefined : slots.at(i - 1);
          return (
            <Place
              key={slot.is === "column" ? slot.column.id : "add-column"}
              side={side}
              shift={outsideShift}
            >
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
                    onColor={(color) =>
                      dispatch({ is: "set-column-color", columnId: slot.column.id, color })}
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
          <Place side={sideOf(offset, slots.length)} shift={outsideShift}>
            <AddThumbnail
              label="Add column at end"
              gap={columnCount}
              targeted={targeted(columnCount)}
              onClick={() => props.onAdd(columnCount)}
            />
          </Place>
        )}
      </Box>
      {/* The outline's line sits an outlinePad out from the visible thumbnails on every side. */}
      <Box
        position="absolute"
        pointerEvents="none"
        left={`calc(50% - ${viewWidth} / 2 - ${outlineInset})`}
        width={`calc(${viewWidth} + 2 * ${outlineInset})`}
        top={`calc(-1 * ${outlineInset})`}
        bottom={`calc(-1 * ${outlineInset})`}
        transition="left 300ms ease, width 300ms ease"
        borderWidth={thumbOutlineWidth}
        borderStyle="solid"
        borderColor={surface.ink}
        // 10% less rounded than a column.
        borderRadius={`calc(${surface.cornerRadius} * 0.9)`}
      />
    </Box>
  );
}
