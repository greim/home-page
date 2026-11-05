/** What widget cards and the column editor need to host widgets: the manager, and the registry. */
import { Either } from "effect";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import type { Registry } from "../common/widgets.ts";
import type { Manager } from "./mfe/manager-live.ts";

export type RegistryState =
  | { readonly is: "loading" }
  | { readonly is: "ready"; readonly registry: Registry }
  | { readonly is: "failed"; readonly message: string };

export type WidgetHost = { readonly manager: Manager; readonly registry: RegistryState };

const WidgetHostContext = createContext<WidgetHost | null>(null);

export function WidgetHostProvider(props: {
  manager: Manager;
  registry: Promise<Either.Either<Registry, string>>;
  children: ReactNode;
}) {
  const [registry, setRegistry] = useState<RegistryState>({ is: "loading" });
  useEffect(() => {
    void props.registry.then((loaded) =>
      setRegistry(
        Either.isRight(loaded)
          ? { is: "ready", registry: loaded.right }
          : { is: "failed", message: loaded.left },
      )
    );
  }, [props.registry]);
  return (
    <WidgetHostContext.Provider value={{ manager: props.manager, registry }}>
      {props.children}
    </WidgetHostContext.Provider>
  );
}

export const useWidgetHost = (): WidgetHost => {
  const host = useContext(WidgetHostContext);
  if (host === null) {
    throw new Error("useWidgetHost must be used within WidgetHostProvider");
  }
  return host;
};

/** The widget types to offer, and their names; none while the registry loads or if it failed. */
export const registeredTypes = (state: RegistryState): Registry["widgets"] =>
  state.is === "ready" ? state.registry.widgets : [];
