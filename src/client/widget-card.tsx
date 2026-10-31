import { Box, Button, chakra, Flex, HStack } from "@chakra-ui/react";
import { LuChevronDown, LuChevronRight, LuPlus } from "react-icons/lu";
import { newWidget, type Widget, widgetKinds } from "../common/model.ts";
import { action, ActionMenu } from "./admin-menu.tsx";
import { useBoard } from "./board-context.ts";
import { BookmarksWidget } from "./bookmarks-widget.tsx";
import { FormGridWidget } from "./form-grid-widget.tsx";
import { SnippetsWidget } from "./snippets-widget.tsx";

export type Neighbors = {
  readonly prevColumnId: string | null;
  readonly nextColumnId: string | null;
};

function WidgetBody(props: { columnId: string; widget: Widget }) {
  const { dispatch } = useBoard();
  const { widget } = props;
  switch (widget.is) {
    case "bookmarks":
      return (
        <BookmarksWidget
          widget={widget}
          onToggleFolder={(folderId) =>
            dispatch({
              is: "toggle-folder",
              columnId: props.columnId,
              widgetId: widget.id,
              folderId,
            })}
        />
      );
    case "snippets":
      return <SnippetsWidget widget={widget} />;
    case "form-grid":
      return <FormGridWidget widget={widget} />;
    default:
      return widget satisfies never;
  }
}

export function WidgetCard(props: {
  columnId: string;
  widget: Widget;
  index: number;
  count: number;
  neighbors: Neighbors;
}) {
  const { admin, dispatch, edit } = useBoard();
  const { columnId, widget, index, neighbors } = props;
  const move = (toColumnId: string, toIndex: number) =>
    dispatch({ is: "move-widget", columnId, widgetId: widget.id, toColumnId, toIndex });

  return (
    <Box>
      <Flex align="center" gap="1" mb="1">
        <chakra.button
          display="flex"
          alignItems="center"
          gap="1"
          flex="1"
          minW="0"
          cursor="pointer"
          fontSize="xs"
          fontWeight="semibold"
          textTransform="uppercase"
          letterSpacing="wider"
          color="fg.muted"
          aria-expanded={!widget.collapsed}
          onClick={() => dispatch({ is: "toggle-widget", columnId, widgetId: widget.id })}
        >
          {widget.collapsed ? <LuChevronRight /> : <LuChevronDown />}
          <chakra.span truncate>{widget.subheading || "Untitled"}</chakra.span>
        </chakra.button>
        {admin && (
          <ActionMenu
            label="Widget actions"
            actions={[
              action("edit", "Edit…", () => edit({ columnId, widget, insertAt: null })),
              action("up", "Move up", () => move(columnId, index - 1), {
                disabled: index === 0,
              }),
              action("down", "Move down", () => move(columnId, index + 1), {
                disabled: index === props.count - 1,
              }),
              action(
                "left",
                "Move to previous column",
                () => move(neighbors.prevColumnId ?? columnId, Infinity),
                { disabled: neighbors.prevColumnId === null },
              ),
              action(
                "right",
                "Move to next column",
                () => move(neighbors.nextColumnId ?? columnId, Infinity),
                { disabled: neighbors.nextColumnId === null },
              ),
              action(
                "delete",
                "Delete",
                () =>
                  confirm(`Delete "${widget.subheading}"?`) &&
                  dispatch({ is: "remove-widget", columnId, widgetId: widget.id }),
                { danger: true },
              ),
            ]}
          />
        )}
      </Flex>
      {!widget.collapsed && <WidgetBody columnId={columnId} widget={widget} />}
    </Box>
  );
}

/** Menu for choosing a widget type to create at `index`. */
export function AddWidget(props: {
  columnId: string;
  index: number;
  compact: boolean;
}) {
  const { edit } = useBoard();
  return (
    <HStack justify={props.compact ? "center" : "start"}>
      <ActionMenu
        label="Add widget"
        actions={widgetKinds.map((kind) =>
          action(kind.is, kind.name, () =>
            edit({
              columnId: props.columnId,
              widget: newWidget(kind.is, crypto.randomUUID()),
              insertAt: props.index,
            }))
        )}
        trigger={props.compact
          ? (
            // Colors are the column's own text color at reduced opacity, so they
            // stay visible on light, dark, and tinted columns alike.
            <Button size="2xs" variant="ghost" color="fg/55" width="full" h="4">
              <LuPlus /> insert widget
            </Button>
          )
          : (
            // Negative margin lines the icon up with the widgets' left edge.
            <Button size="sm" variant="ghost" color="fg/70" px="2" ms="-2">
              <LuPlus /> Add widget
            </Button>
          )}
      />
    </HStack>
  );
}
