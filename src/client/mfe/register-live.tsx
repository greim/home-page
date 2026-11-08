/**
 * Imperative shell of an MFE's half of the framework: finds the page's manager
 * and renders views with this bundle's own React.
 */
import { Component, type ComponentType, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { type Registrar, registrarKey } from "./protocol.ts";
import { type MfeSideIo, registerMfe as registerWith, type Shell } from "./register.ts";

export type { Shell };

/**
 * What a view is given: the props its embedder passed, to decode with Effect Schema,
 * and the document it's shown in (the page's, or another window's), to style it there.
 */
export type ViewProps = { readonly props: unknown; readonly document: Document };

export type View = ComponentType<ViewProps>;

type BoundaryProps = { readonly onError: (message: string) => void; readonly children: ReactNode };

/** Reports a render error to the shell, which shows it in place of the view. */
class ReportErrors extends Component<BoundaryProps, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    this.props.onError(error instanceof Error ? error.message : String(error));
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

const io: MfeSideIo<View> = {
  findRegistrar: () => (globalThis as Record<symbol, Registrar | undefined>)[registrarKey],
  mount: (node, View, onError) => {
    const root = createRoot(node);
    return {
      render: (props) =>
        root.render(
          <ReportErrors onError={onError}>
            {/* Read on each render: the embedder may have moved the node to another window. */}
            <View props={props} document={node.ownerDocument} />
          </ReportErrors>,
        ),
      unmount: () => root.unmount(),
    };
  },
};

/**
 * Registers this bundle as MFE `id`. Call it once, in the MFE's entry point.
 * `factory` is given the shell to talk to, and returns the views it provides.
 * Register handlers inside `factory`, so they're there before any message.
 */
export const registerMfe = (
  id: string,
  factory: (shell: Shell) => Readonly<Record<string, View>>,
): void => registerWith(io, id, factory);
