/**
 * Whether the user has let a widget type send data to the outside services its
 * manifest declares (its `permissions`). Until they have, the page shows neither
 * the widget nor its full-screen view (its settings form, which only edits the
 * config, does load). The answer is kept in this browser, once per widget type,
 * along with what it was an answer to: if the widget later declares different
 * services, the user is asked again. This is the functional core: the decisions,
 * and the stored text. Reading and writing it is in permissions-live.ts.
 */
import { Either, Schema } from "effect";
import type { Permissions } from "../common/widgets.ts";

export type PermissionState =
  /** The widget sends nothing anywhere: nothing to ask. */
  | { readonly is: "not-needed" }
  | { readonly is: "granted" }
  | { readonly is: "declined" }
  /** Not asked yet, or (`changed`) asked about other services than it now declares. */
  | { readonly is: "unanswered"; readonly changed: boolean };

/** Where a widget type's answer is kept in the browser's localStorage. */
export const permissionKey = (widgetType: string): string => `home-page.permissions.${widgetType}`;

const Stored = Schema.parseJson(Schema.Struct({
  answer: Schema.Literal("yes", "no"),
  /** What was answered: the services, as `servicesSeen` puts them. */
  services: Schema.String,
}));

/** The services as the user saw them, to tell whether they've changed since. */
const servicesSeen = (permissions: Permissions): string =>
  JSON.stringify(permissions.services.map((s) => [s.name, s.sends, s.privacyPolicy, s.terms]));

/** The stored text for an answer to `permissions`. */
export const answerText = (permissions: Permissions, yes: boolean): string =>
  Schema.encodeSync(Stored)({ answer: yes ? "yes" : "no", services: servicesSeen(permissions) });

/** Where a widget type stands, from what it declares and what's stored (null for nothing). */
export const permissionState = (
  permissions: Permissions | null,
  stored: string | null,
): PermissionState => {
  if (permissions === null) return { is: "not-needed" };
  if (stored === null) return { is: "unanswered", changed: false };
  const decoded = Schema.decodeUnknownEither(Stored)(stored);
  if (Either.isLeft(decoded)) return { is: "unanswered", changed: false };
  if (decoded.right.services !== servicesSeen(permissions)) {
    return { is: "unanswered", changed: true };
  }
  return decoded.right.answer === "yes" ? { is: "granted" } : { is: "declined" };
};

/** Whether the widget's views may load. */
export const allowed = (state: PermissionState): boolean =>
  state.is === "not-needed" || state.is === "granted";
