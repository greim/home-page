/** Decodes the props a widget's views are given, into its own config type. */
import { Either, Schema } from "effect";

const Callback = Schema.declare(
  (u: unknown): u is (value: unknown) => void => typeof u === "function",
  { identifier: "Function" },
);

const RawWidgetProps = Schema.Struct({
  widgetId: Schema.String,
  config: Schema.Unknown,
  saveConfig: Callback,
});

const RawEditorProps = Schema.Struct({
  widgetId: Schema.String,
  config: Schema.Unknown,
  reportDraft: Callback,
});

export type WidgetProps<A> = {
  readonly widgetId: string;
  readonly config: A;
  readonly saveConfig: (config: A) => void;
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

export const decodeWidgetProps = <A, I>(
  schema: Schema.Schema<A, I>,
  props: unknown,
): Either.Either<WidgetProps<A>, string> =>
  Either.flatMap(
    Either.mapLeft(Schema.decodeUnknownEither(RawWidgetProps)(props), describe),
    (raw) =>
      Either.map(decodeConfig(schema, raw.config), (config) => ({
        widgetId: raw.widgetId,
        config,
        saveConfig: (next: A) => raw.saveConfig(encoder(schema)(next)),
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
