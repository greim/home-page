/** Decodes the props a widget's views are given, into its own config type. */
import { Either, Schema } from "effect";
import { Schedule } from "../../common/day-cycle.ts";

const Callback = Schema.declare(
  (u: unknown): u is (value: unknown) => void => typeof u === "function",
  { identifier: "Function" },
);

const sharedFields = {
  widgetId: Schema.String,
  config: Schema.Unknown,
  saveConfig: Callback,
  schedule: Schedule,
};

const RawFullScreenProps = Schema.Struct({ ...sharedFields, closeFullScreen: Callback });

const RawWidgetProps = Schema.Struct({ ...sharedFields, openFullScreen: Callback });

const RawEditorProps = Schema.Struct({
  widgetId: Schema.String,
  config: Schema.Unknown,
  reportDraft: Callback,
});

type SharedProps<A> = {
  readonly widgetId: string;
  readonly config: A;
  readonly saveConfig: (config: A) => void;
  /** When the user's day starts and ends (see day-cycle.ts). */
  readonly schedule: Schedule;
};

export type FullScreenProps<A> = SharedProps<A> & {
  /** Closes the full-screen view, e.g. once something has been chosen in it. */
  readonly closeFullScreen: () => void;
};

export type WidgetProps<A> = SharedProps<A> & {
  /**
   * Opens the widget's full-screen view as a modal over the page. Call it only from a
   * user action (a click), and only if the widget provides one (`fullScreenView`).
   */
  readonly openFullScreen: () => void;
};

export type Draft<A> =
  | { readonly ok: true; readonly config: A }
  | { readonly ok: false; readonly errorMessage: string };

export type EditorProps<A> = {
  readonly widgetId: string;
  readonly config: A;
  readonly reportDraft: (draft: Draft<A>) => void;
};

const describe = (error: { readonly message: string }) => error.message;

const decodeConfig = <A, I>(schema: Schema.Schema<A, I>, config: unknown) =>
  Either.mapLeft(
    Schema.decodeUnknownEither(schema)(config),
    (e) => `This widget's settings are invalid: ${describe(e)}`,
  );

/** Encodes a config for saving. A config the widget built itself always encodes. */
const encoder = <A, I>(schema: Schema.Schema<A, I>) => Schema.encodeSync(schema);

const decodeShared = <A, I>(
  schema: Schema.Schema<A, I>,
  raw: Schema.Schema.Type<typeof RawWidgetProps> | Schema.Schema.Type<typeof RawFullScreenProps>,
): Either.Either<SharedProps<A>, string> =>
  Either.map(decodeConfig(schema, raw.config), (config) => ({
    widgetId: raw.widgetId,
    config,
    saveConfig: (next: A) => raw.saveConfig(encoder(schema)(next)),
    schedule: raw.schedule,
  }));

export const decodeFullScreenProps = <A, I>(
  schema: Schema.Schema<A, I>,
  props: unknown,
): Either.Either<FullScreenProps<A>, string> =>
  Either.flatMap(
    Either.mapLeft(Schema.decodeUnknownEither(RawFullScreenProps)(props), describe),
    (raw) =>
      Either.map(decodeShared(schema, raw), (shared) => ({
        ...shared,
        closeFullScreen: () => raw.closeFullScreen(undefined),
      })),
  );

export const decodeWidgetProps = <A, I>(
  schema: Schema.Schema<A, I>,
  props: unknown,
): Either.Either<WidgetProps<A>, string> =>
  Either.flatMap(
    Either.mapLeft(Schema.decodeUnknownEither(RawWidgetProps)(props), describe),
    (raw) =>
      Either.map(decodeShared(schema, raw), (shared) => ({
        ...shared,
        openFullScreen: () => raw.openFullScreen(undefined),
      })),
  );

export const decodeEditorProps = <A, I>(
  schema: Schema.Schema<A, I>,
  props: unknown,
): Either.Either<EditorProps<A>, string> =>
  Either.flatMap(
    Either.mapLeft(Schema.decodeUnknownEither(RawEditorProps)(props), describe),
    (raw) =>
      Either.map(decodeConfig(schema, raw.config), (config) => ({
        widgetId: raw.widgetId,
        config,
        reportDraft: (draft: Draft<A>) =>
          raw.reportDraft(draft.ok ? { ok: true, config: encoder(schema)(draft.config) } : draft),
      })),
  );
