/**
 * The React embedder: renders an MFE's view in place, keeps its props up to
 * date, and shows any failure instead of the view.
 */
import { Schema } from "effect";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { Manager } from "./manager-live.ts";

const RenderError = Schema.Struct({ renderError: Schema.String });
const isRenderError = Schema.is(RenderError);

export type MfeViewProps = {
  readonly manager: Manager;
  readonly mfe: string;
  readonly view: string;
  readonly props: unknown;
  /** Shown instead of the view when it can't be shown. */
  readonly fallback: (message: string) => ReactNode;
};

export const MfeView = ({ manager, mfe, view, props, fallback }: MfeViewProps) => {
  const host = useRef<HTMLDivElement>(null);
  const node = useRef<HTMLElement | null>(null);
  const latestProps = useRef(props);
  latestProps.current = props;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // A fresh node per mount: a closed channel is never reused, even under StrictMode.
    const mountNode = document.createElement("div");
    host.current?.append(mountNode);
    node.current = mountNode;
    setError(null);
    const stop = manager.receive(mfe, mountNode, (message) => {
      if (isRenderError(message)) {
        setError(message.renderError);
      }
      return null;
    });
    void manager.mount({ mfe, view, node: mountNode, props: latestProps.current }).then(
      (result) => {
        if (!result.ok) {
          setError(result.error.message);
        }
      },
    );
    return () => {
      stop();
      manager.unmount({ mfe, node: mountNode });
      mountNode.remove();
      node.current = null;
    };
  }, [manager, mfe, view]);

  useEffect(() => {
    // A failure here is the same one the mount reports, so it isn't shown twice.
    const mountNode = node.current;
    if (mountNode !== null) {
      void manager.update({ mfe, node: mountNode, props });
    }
  }, [manager, mfe, props]);

  return (
    <>
      <div ref={host} hidden={error !== null} />
      {error === null ? null : fallback(error)}
    </>
  );
};
