import { Box, chakra } from "@chakra-ui/react";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import type { Widget } from "../common/model.ts";
import { adminButton } from "./admin-button.ts";
import { useBoard } from "./board-context.ts";
import { AssistantWidget } from "./assistant-panel.tsx";
import { BookmarksWidget } from "./bookmarks-widget.tsx";
import { FormGridWidget } from "./form-grid-widget.tsx";
import { SnippetsWidget } from "./snippets-widget.tsx";

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
    case "assistant":
      return <AssistantWidget />;
    default:
      return widget satisfies never;
  }
}

/**
 * A widget in its column. In admin mode its contents go inert (links, inputs and
 * toggles stop responding) and clicking anywhere on it opens the column content
 * editor with it selected. Nothing is added or removed, so the layout is the same
 * in both modes.
 */
export function WidgetCard(props: { columnId: string; widget: Widget }) {
  const { admin, dispatch, edit } = useBoard();
  const { columnId, widget } = props;
  const name = widget.subheading || "Untitled";

  return (
    <Box
      {...adminButton(admin, `Edit widget ${name}`)}
      onClick={admin
        ? (e) => {
          // Don't also open the column itself.
          e.stopPropagation();
          edit({ columnId, widgetId: widget.id });
        }
        : undefined}
    >
      {/* Inert content can't be hit, so clicks on it land on the box above. */}
      <Box inert={admin}>
        <chakra.button
          display="flex"
          alignItems="center"
          gap="1"
          w="full"
          mb="1"
          cursor="pointer"
          fontSize="md"
          fontWeight="semibold"
          letterSpacing="wider"
          color="fg.muted"
          aria-expanded={!widget.collapsed}
          onClick={() => dispatch({ is: "toggle-widget", columnId, widgetId: widget.id })}
        >
          {widget.collapsed ? <LuChevronRight /> : <LuChevronDown />}
          <chakra.span truncate>{name}</chakra.span>
        </chakra.button>
        {!widget.collapsed && <WidgetBody columnId={columnId} widget={widget} />}
      </Box>
    </Box>
  );
}
