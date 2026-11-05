import { Box, chakra, Text } from "@chakra-ui/react";
import { useMemo } from "react";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import type { Widget } from "../common/model.ts";
import { adminButton } from "./admin-button.ts";
import { useBoard } from "./board-context.ts";
import { MfeView } from "./mfe/mfe-view.tsx";
import { widgetHeading } from "./surface.ts";
import { widgetViewName, type WidgetViewProps } from "./widget-kit/contract.ts";
import { useWidgetHost } from "./widget-host.tsx";

/** Shown in place of a widget, or its editor, that can't be shown. */
export const WidgetProblem = (props: { message: string }) => (
  <Text fontSize="sm" color="fg.error">{props.message}</Text>
);

/** The widget's own view, rendered by its MFE bundle. */
function WidgetBody(props: { columnId: string; widget: Widget }) {
  const { dispatch } = useBoard();
  const { manager } = useWidgetHost();
  const { columnId, widget } = props;
  const viewProps: WidgetViewProps = useMemo(() => ({
    widgetId: widget.id,
    config: widget.config,
    saveConfig: (config: unknown) =>
      dispatch({ is: "set-widget-config", columnId, widgetId: widget.id, config }),
  }), [columnId, widget.id, widget.config, dispatch]);
  return (
    <MfeView
      manager={manager}
      mfe={widget.is}
      view={widgetViewName}
      props={viewProps}
      fallback={(message) => <WidgetProblem message={message} />}
    />
  );
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
          fontFamily="heading"
          letterSpacing="wider"
          {...widgetHeading}
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
