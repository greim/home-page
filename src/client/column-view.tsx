import { Box, Button, chakra, Flex, Heading, Input, Theme } from "@chakra-ui/react";
import { useRef, useState } from "react";
import { LuPlus } from "react-icons/lu";
import { columnColorCss } from "../common/column-color.ts";
import { type Column, newColumn } from "../common/model.ts";
import { adminButton } from "./admin-button.ts";
import { useBoard } from "./board-context.ts";
import { IconPicker, NamedIcon } from "./icon-picker.tsx";
import { randomIcon } from "./icon-set.ts";
import {
  columnCorners,
  columnHeading,
  columnHeadingBand,
  columnHeadingHeight,
  hiddenScrollbar,
  surface,
} from "./surface.ts";
import { WidgetCard } from "./widget-card.tsx";

/**
 * The column heading, which in admin mode turns into a text field when clicked:
 * Enter (or clicking away) saves it, Escape cancels.
 */
function ColumnHeading(props: {
  column: Column;
  /** Start out editing (with the text selected), e.g. for a column just added. */
  editing: boolean;
  onEditEnd: () => void;
}) {
  const { admin, dispatch } = useBoard();
  const { column } = props;
  const [editing, setEditing] = useState(props.editing);
  // Escape unmounts the field, which can blur it; that mustn't save.
  const done = useRef(false);

  const finish = (heading: string | null) => {
    if (done.current) return;
    done.current = true;
    if (heading !== null && heading !== column.heading) {
      dispatch({ is: "rename-column", columnId: column.id, heading });
    }
    setEditing(false);
    props.onEditEnd();
  };

  return editing
    ? (
      <chakra.input
        defaultValue={column.heading}
        aria-label="Column heading"
        autoFocus
        flex="1"
        minW="0"
        h={columnHeadingHeight}
        px="0"
        bg="transparent"
        outline="none"
        borderBottomWidth="2px"
        borderColor="currentColor"
        {...columnHeading}
        onFocus={(e) => {
          done.current = false;
          e.currentTarget.select();
        }}
        onClick={(e) => e.stopPropagation()}
        onBlur={(e) => finish(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") finish(e.currentTarget.value);
          if (e.key === "Escape") {
            // Not a step toward toggling admin mode.
            e.stopPropagation();
            finish(null);
          }
        }}
      />
    )
    : (
      <Heading
        flex="1"
        minW="0"
        truncate
        {...columnHeading}
        {...adminButton(admin, `Edit heading: ${column.heading}`)}
        onClick={admin
          ? (e) => {
            e.stopPropagation();
            setEditing(true);
          }
          : undefined}
      >
        {column.heading}
      </Heading>
    );
}

function ColumnHeader(props: {
  column: Column;
  editHeading: boolean;
  onHeadingEditEnd: () => void;
}) {
  const { admin, dispatch } = useBoard();
  const { column } = props;
  // Shares the heading's adaptive color.
  const icon = (
    <Box
      display="flex"
      color={columnHeading.color}
      {...adminButton(admin, "Change column icon")}
      onClick={admin ? (e) => e.stopPropagation() : undefined}
    >
      <NamedIcon name={column.icon} boxSize={surface.columnIconSize} />
    </Box>
  );

  return (
    <Flex
      position="sticky"
      top="0"
      zIndex="1"
      bgColor={columnColorCss(column.color)}
      {...columnHeadingBand}
      align="center"
      gap="2"
      mb="4"
      px={surface.columnPaddingX}
      pt={surface.columnPaddingTop}
      pb={surface.columnHeadingPaddingBottom}
    >
      {admin
        ? (
          <IconPicker
            portalled
            value={column.icon}
            onChange={(icon) => dispatch({ is: "set-column-icon", columnId: column.id, icon })}
          >
            {icon}
          </IconPicker>
        )
        : icon}
      <ColumnHeading
        column={column}
        editing={props.editHeading}
        onEditEnd={props.onHeadingEditEnd}
      />
    </Flex>
  );
}

/**
 * A column of widgets. Admin mode adds no controls: the heading, icon, widgets
 * and the background behind them become clickable instead (see admin-button.ts),
 * so the column looks and lays out exactly the same in both modes.
 */
export function ColumnView(props: {
  column: Column;
  editHeading: boolean;
  onHeadingEditEnd: () => void;
}) {
  const { admin, edit } = useBoard();
  const { column } = props;
  return (
    // Column text is always white: every column color shares one mid lightness,
    // so Chakra's dark tokens suit them all.
    <Theme
      appearance="dark"
      hasBackground={false}
      bg={columnColorCss(column.color)}
      color="white"
      textShadow={surface.columnTextShadow}
      h="full"
      css={{ ...columnCorners, ...hiddenScrollbar }}
      boxShadow={surface.columnInsetShadow}
      overflowY="auto"
      overflowX="hidden"
      opacity={column.hidden ? 0.5 : 1}
      {...adminButton(admin, `Edit column ${column.heading}`)}
      onClick={admin
        ? (e) => {
          // React bubbles clicks from portals (e.g. the icon picker) through here
          // too; only clicks on the column itself count.
          if (e.currentTarget.contains(e.target as Node)) {
            edit({ columnId: column.id, widgetId: null });
          }
        }
        : undefined}
    >
      <ColumnHeader
        column={column}
        editHeading={props.editHeading}
        onHeadingEditEnd={props.onHeadingEditEnd}
      />
      <Box px={surface.columnPaddingX} pb={surface.columnPaddingBottom}>
        {column.widgets.map((widget) => (
          <WidgetCard key={widget.id} columnId={column.id} widget={widget} />
        ))}
      </Box>
    </Theme>
  );
}

/** Fills empty horizontal space with a way to append a column. */
export function AddColumnSlot(props: { index: number }) {
  const { dispatch } = useBoard();
  const [naming, setNaming] = useState(false);
  return (
    // A dotted outline drawn on the surface in its ink.
    <Theme
      appearance="light"
      hasBackground={false}
      display="flex"
      h="full"
      alignItems="start"
      justifyContent="start"
      pt={surface.columnPaddingTop}
      px={surface.columnPaddingX}
      css={columnCorners}
      borderWidth="2px"
      borderStyle="dotted"
      borderColor={surface.ink}
    >
      {naming
        ? (
          <form
            style={{ width: "100%" }}
            onSubmit={(e) => {
              e.preventDefault();
              const heading = String(new FormData(e.currentTarget).get("heading") ?? "").trim();
              dispatch({
                is: "add-column",
                index: props.index,
                column: {
                  ...newColumn(crypto.randomUUID(), randomIcon()),
                  heading: heading || "New Column",
                },
              });
              setNaming(false);
            }}
          >
            <Input
              name="heading"
              size="sm"
              autoFocus
              placeholder="Column name, then Enter"
              onBlur={() => setNaming(false)}
              onKeyDown={(e) => e.key === "Escape" && setNaming(false)}
            />
          </form>
        )
        : (
          // Negative margin lines the icon up with the slot's padding edge.
          <Button
            size="sm"
            variant="ghost"
            color={surface.ink}
            px="2"
            ms="-2"
            onClick={() => setNaming(true)}
          >
            <LuPlus /> Add column
          </Button>
        )}
    </Theme>
  );
}
