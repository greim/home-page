/**
 * The widget APIs a widget's views are given (see contract.ts), in React context:
 * `widgetView` and `fullScreenView` provide them, and `useWidgetApi` gets one. See
 * the `widget-apis` skill.
 *
 *   const geocode = useWidgetApi(geocodeApi);
 *   const found = await geocode.findPlace({ query });
 */
import { createContext, type ReactNode, useContext } from "react";
import type { AnyApi, ApiClient } from "../../common/widget-apis.ts";
import type { WidgetApis } from "./contract.ts";

const ApisContext = createContext<WidgetApis | null>(null);

/** Gives the components inside it these APIs: in views (the kit does it), and in tests (fakes). */
export const WidgetApisProvider = (props: { apis: WidgetApis; children: ReactNode }) => (
  <ApisContext.Provider value={props.apis}>{props.children}</ApisContext.Provider>
);

/** Why a view has no client for `api`, for the error shown in its place. */
export const missingApiMessage = (api: string, inView: boolean): string =>
  inView
    ? `This widget wasn't given the "${api}" API: list it under \`apis\` in its manifest ` +
      `(for "agent-runs", give it an agent), then rebuild the widgets.`
    : `The "${api}" API is only there in a widget's "widget" and "full-screen" views ` +
      `(not its editor, which loads before the user consents).`;

/** The client for `api`. Throws (a programming error, shown in the widget's card) if there's none. */
export const useWidgetApi = <D extends AnyApi>(api: D): ApiClient<D> => {
  const apis = useContext(ApisContext);
  const client = apis?.[api.name];
  if (client === undefined) throw new Error(missingApiMessage(api.name, apis !== null));
  return client as ApiClient<D>;
};
