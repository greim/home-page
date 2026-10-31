import { Badge, Button, Editable, Flex, Heading, Input, Stack, Theme } from "@chakra-ui/react";
import { Fragment, useState } from "react";
import { LuPlus } from "react-icons/lu";
import { type Column, newColumn } from "../common/model.ts";
import { action, ActionMenu } from "./admin-menu.tsx";
import { useBoard } from "./board-context.ts";
import { ColorPicker } from "./color-picker.tsx";
import { appearanceFor } from "./contrast.ts";
import { columnCorners, columnHeading, surface } from "./surface.ts";
import { AddWidget, type Neighbors, WidgetCard } from "./widget-card.tsx";

function ColumnHeader(props: {
  column: Column;
  index: number;
  count: number;
}) {
  const { admin, dispatch } = useBoard();
  const { column, index } = props;
  const insert = (at: number) =>
    dispatch({ is: "add-column", index: at, column: newColumn(crypto.randomUUID()) });

  return (
    <Flex
      position="sticky"
      top="0"
      zIndex="1"
      bg={column.color}
      align="center"
      gap="2"
      px={surface.columnPaddingX}
      pt={surface.columnPaddingTop}
      pb="2"
    >
      {admin
        ? (
          <Editable.Root
            key={column.heading}
            defaultValue={column.heading}
            size="sm"
            flex="1"
            minW="0"
            fontWeight="bold"
            onValueCommit={(e) =>
              dispatch({ is: "rename-column", columnId: column.id, heading: e.value })}
          >
            <Editable.Preview width="full" {...columnHeading} />
            <Editable.Input {...columnHeading} />
          </Editable.Root>
        )
        : (
          <Heading flex="1" minW="0" truncate {...columnHeading}>
            {column.heading}
          </Heading>
        )}
      {admin && column.hidden && <Badge>Hidden</Badge>}
      {admin && (
        <ColorPicker
          label="Column color"
          value={column.color}
          onChange={(color) => dispatch({ is: "set-column-color", columnId: column.id, color })}
        />
      )}
      {admin && (
        <ActionMenu
          label="Column actions"
          actions={[
            action("before", "Insert column before", () => insert(index)),
            action("after", "Insert column after", () => insert(index + 1)),
            action(
              "left",
              "Move left",
              () => dispatch({ is: "move-column", columnId: column.id, toIndex: index - 1 }),
              {
                disabled: index === 0,
              },
            ),
            action(
              "right",
              "Move right",
              () => dispatch({ is: "move-column", columnId: column.id, toIndex: index + 1 }),
              {
                disabled: index === props.count - 1,
              },
            ),
            action(
              "visibility",
              column.hidden ? "Show column" : "Hide column",
              () =>
                dispatch({
                  is: "set-column-hidden",
                  columnId: column.id,
                  hidden: !column.hidden,
                }),
            ),
            action(
              "delete",
              "Delete column",
              () =>
                confirm(`Delete "${column.heading}" and all its widgets?`) &&
                dispatch({ is: "remove-column", columnId: column.id }),
              { danger: true },
            ),
          ]}
        />
      )}
    </Flex>
  );
}

export function ColumnView(props: {
  column: Column;
  index: number;
  count: number;
  neighbors: Neighbors;
}) {
  const { admin } = useBoard();
  const { column } = props;
  return (
    // Theme switches Chakra's tokens to light or dark to suit the column's color.
    <Theme
      appearance={appearanceFor(column.color)}
      hasBackground={false}
      bg={column.color}
      h="full"
      css={columnCorners}
      overflowY="auto"
      overflowX="hidden"
      opacity={column.hidden ? 0.5 : 1}
    >
      <ColumnHeader column={column} index={props.index} count={props.count} />
      <Stack gap="4" px={surface.columnPaddingX} pb={surface.columnPaddingBottom}>
        {column.widgets.map((widget, i) => (
          <Fragment key={widget.id}>
            {admin && <AddWidget columnId={column.id} index={i} compact />}
            <WidgetCard
              columnId={column.id}
              widget={widget}
              index={i}
              count={column.widgets.length}
              neighbors={props.neighbors}
            />
          </Fragment>
        ))}
        <AddWidget columnId={column.id} index={column.widgets.length} compact={false} />
      </Stack>
    </Theme>
  );
}

/** Fills empty horizontal space with a way to append a column. */
export function AddColumnSlot(props: { index: number }) {
  const { dispatch } = useBoard();
  const [naming, setNaming] = useState(false);
  return (
    // Sits directly on the dark surface, so always uses dark-mode styling.
    <Theme
      appearance="dark"
      hasBackground={false}
      display="flex"
      h="full"
      alignItems="start"
      justifyContent="start"
      pt={surface.columnPaddingTop}
      px={surface.columnPaddingX}
      css={columnCorners}
      borderWidth="2px"
      borderStyle="dashed"
      borderColor="white"
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
                column: { ...newColumn(crypto.randomUUID()), heading: heading || "New Column" },
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
            color="white"
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
