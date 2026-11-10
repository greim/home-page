import { Box, Text } from "@chakra-ui/react";
import { useMemo } from "react";
import type { Widget } from "../common/model.ts";
import { adminButton } from "./admin-button.ts";
import { useBoard } from "./board-context.ts";
import { MfeView } from "./mfe/mfe-view.tsx";
import { widgetSection } from "./surface.ts";
import {
  fullScreenViewName,
  type FullScreenViewProps,
  widgetViewName,
  type WidgetViewProps,
} from "./widget-kit/contract.ts";
import { allowed } from "./permissions.ts";
import { usePermissions } from "./permissions-live.ts";
import { PermissionNotice } from "./permissions-view.tsx";
import { widgetLabel } from "./widget-draft.ts";
import { registeredTypes, useWidgetHost } from "./widget-host.tsx";
import { useWidgetApis } from "./widget-apis-live.ts";

/** Shown in place of a widget, or its editor, that can't be shown. */
export const WidgetProblem = (props: { message: string }) => (
  <Text fontSize="sm" color="fg.error">{props.message}</Text>
);

/** The widget's own view, rendered by its MFE bundle. */
function WidgetBody(props: { columnId: string; widget: Widget }) {
  const { dispatch, schedule, open } = useBoard();
  const { manager } = useWidgetHost();
  const { columnId, widget } = props;
  const apis = useWidgetApis(widget);
  const viewProps: WidgetViewProps = useMemo(() => ({
    widgetId: widget.id,
    config: widget.config,
    saveConfig: (config: unknown) =>
      dispatch({ is: "set-widget-config", columnId, widgetId: widget.id, config }),
    schedule,
    apis,
    openFullScreen: () => open({ is: "widget", widgetId: widget.id }),
  }), [columnId, widget.id, widget.config, dispatch, schedule, apis, open]);
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

/** The widget's full-screen view (rendered by its MFE bundle), for its modal or PiP window. */
export function WidgetFullScreen(props: { columnId: string; widget: Widget }) {
  const { dispatch, schedule } = useBoard();
  const { manager } = useWidgetHost();
  const { columnId, widget } = props;
  const apis = useWidgetApis(widget);
  const viewProps: FullScreenViewProps = useMemo(() => ({
    widgetId: widget.id,
    config: widget.config,
    saveConfig: (config: unknown) =>
      dispatch({ is: "set-widget-config", columnId, widgetId: widget.id, config }),
    schedule,
    apis,
  }), [columnId, widget.id, widget.config, dispatch, schedule, apis]);
  return (
    <MfeView
      manager={manager}
      mfe={widget.is}
      view={fullScreenViewName}
      props={viewProps}
      fallback={(message) => <WidgetProblem message={message} />}
    />
  );
}

/**
 * A widget in its column: a section, divided from the one above it. The widget
 * draws all of it, heading included, if it has one. In admin mode its contents go
 * inert (links, inputs and toggles stop responding) and clicking anywhere on it
 * opens the column content editor with it selected. Nothing is added or removed,
 * so the layout is the same in both modes.
 */
export function WidgetCard(props: { columnId: string; widget: Widget }) {
  const { admin, open } = useBoard();
  const { registry } = useWidgetHost();
  const permissionOf = usePermissions();
  const { columnId, widget } = props;
  const types = registeredTypes(registry);
  const name = widgetLabel(widget, types);
  const type = types.find((t) => t.id === widget.is);
  // Until the registry says what a widget sends, none of its code loads.
  const permission = type === undefined
    ? (registry.is === "loading" ? null : { is: "not-needed" } as const)
    : permissionOf(type.id, type.permissions);

  return (
    <Box
      {...widgetSection}
      {...adminButton(admin, `Edit widget ${name}`)}
      onClick={admin
        ? (e) => {
          // Don't also open the column itself.
          e.stopPropagation();
          open({ is: "column-editor", columnId, widgetId: widget.id });
        }
        : undefined}
    >
      {
        /* Inert content can't be hit, so clicks on it land on the box above. The permission
          notice is the page's own, not the widget's, so its Review button works in admin mode too. */
      }
      <Box inert={admin && permission !== null && allowed(permission)}>
        {permission === null
          ? null
          : allowed(permission)
          ? <WidgetBody columnId={columnId} widget={widget} />
          : (
            <PermissionNotice
              title={type?.title ?? name}
              state={permission}
              onReview={() => open({ is: "permissions", widgetType: widget.is })}
            />
          )}
      </Box>
    </Box>
  );
}
