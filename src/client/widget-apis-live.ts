/**
 * The widget APIs the page gives a widget's views: a client for each API its
 * registry entry lists, built for that widget (so the page, not the widget, says who's
 * calling), and kept for the widget's life. Layouts a widget applies through the layout
 * API replace the page's own at once.
 */
import { useMemo } from "react";
import { assistantPortMetaName } from "../common/assistant.ts";
import { findApi } from "../common/apis/all.ts";
import type { Widget } from "../common/model.ts";
import { useBoard } from "./board-context.ts";
import { hearAppliedLayouts } from "./layout-applied.ts";
import { apiBase, makeApiClient } from "./widget-api-client.ts";
import type { WidgetApis } from "./widget-kit/contract.ts";
import { registeredTypes, useWidgetHost } from "./widget-host.tsx";

const assistantPort = () =>
  document.querySelector(`meta[name="${assistantPortMetaName}"]`)?.getAttribute("content") ?? "";

/** The clients for `widget`'s APIs. */
export const useWidgetApis = (widget: Widget): WidgetApis => {
  const { registry } = useWidgetHost();
  const { dispatch } = useBoard();
  const entry = registeredTypes(registry).find((t) => t.id === widget.is);
  return useMemo(() => {
    const caller = { widgetType: widget.is, widgetId: widget.id };
    const apis = Object.fromEntries(
      (entry?.apis ?? []).flatMap((name) => {
        const api = findApi(name);
        return api === undefined ? [] : [[
          name,
          makeApiClient(api, apiBase(api.server, location, assistantPort()), caller, fetch),
        ]];
      }),
    );
    return hearAppliedLayouts(apis, (layout) => dispatch({ is: "replace-layout", layout }));
  }, [entry, widget.is, widget.id, dispatch]);
};
