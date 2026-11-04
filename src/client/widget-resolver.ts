/** How the page's MFE manager finds widget bundles: by looking them up in the registry. */
import { Either } from "effect";
import { type Registry, widgetBundleUrl } from "../common/widgets.ts";
import type { Resolver } from "./mfe/manager-live.ts";

/**
 * Waits for the registry, then looks up a widget's bundle URL in it. Throwing
 * is how a resolver fails: the manager reports it as a resolver failure.
 */
export const registryResolver =
  (registry: Promise<Either.Either<Registry, string>>): Resolver => async (id) =>
    Either.getOrThrowWith(
      Either.flatMap(await registry, (r) => widgetBundleUrl(r, id)),
      (message) => new Error(message),
    );
