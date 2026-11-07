/**
 * Reading, validating and saving the persisted layout, over the injected
 * {@link ServerIo} pipes. Shared by the layout API and the admin assistant.
 */
import { Effect, Either, Schema } from "effect";
import { defaultLayout, Layout } from "../common/model.ts";
import { CorruptData, ServerIo } from "./http.ts";

type StoredText = { found: true; text: string } | { found: false };

/** Parses and validates layout JSON; the error says what's wrong with it. */
export const decodeLayoutJson = (raw: string): Either.Either<Layout, string> =>
  Either.flatMap(
    Either.try({ try: (): unknown => JSON.parse(raw), catch: String }),
    (parsed) =>
      Either.mapLeft(
        Schema.decodeUnknownEither(Layout)(parsed),
        (error) => error.message,
      ),
  );

/** How a layout is written to disk: plain, pretty-printed JSON. */
export const layoutText = (layout: Layout): string => JSON.stringify(layout, null, 2) + "\n";

/** The saved layout, or the default one if nothing has been saved yet. */
export const readLayout = Effect.gen(function* () {
  const io = yield* ServerIo;
  const stored = yield* io.readLayoutFile.pipe(
    Effect.map((t): StoredText => ({ found: true, text: t })),
    Effect.catchIf(
      (e) => e.cause instanceof Deno.errors.NotFound,
      () => Effect.succeed<StoredText>({ found: false }),
    ),
  );
  if (!stored.found) {
    return defaultLayout;
  }
  const layout = decodeLayoutJson(stored.text);
  if (Either.isLeft(layout)) {
    return yield* new CorruptData({
      message: `Stored layout is invalid: ${layout.left}`,
    });
  }
  return layout.right;
});

/** Atomically replaces the saved layout. */
export const writeLayout = (layout: Layout) =>
  Effect.gen(function* () {
    const io = yield* ServerIo;
    yield* io.writeLayoutTempFile(layoutText(layout));
    yield* io.commitLayoutTempFile;
  });
