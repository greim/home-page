/** The clock widget's logic: decoding its props, and formatting the time. */
import { Either, Schema } from "effect";
import { ClockConfig } from "./manifest.ts";

const ClockProps = Schema.Struct({ config: ClockConfig });

export const decodeConfig = (props: unknown): Either.Either<ClockConfig, string> =>
  Either.map(
    Either.mapLeft(
      Schema.decodeUnknownEither(ClockProps)(props),
      (e) => `This clock's settings are invalid: ${e.message}`,
    ),
    (p) => p.config,
  );

export type ClockFace = { readonly time: string; readonly date: string; readonly zone: string };

/** `locale` is the browser's when undefined. Fails for a time zone that doesn't exist. */
export const formatClock = (
  now: Date,
  timeZone: string | null,
  locale: string | undefined,
): Either.Either<ClockFace, string> =>
  Either.try({
    try: () => {
      const zone = timeZone ?? undefined;
      const time = new Intl.DateTimeFormat(locale, { timeStyle: "short", timeZone: zone });
      const date = new Intl.DateTimeFormat(locale, {
        weekday: "long",
        month: "long",
        day: "numeric",
        timeZone: zone,
      });
      return {
        time: time.format(now),
        date: date.format(now),
        zone: time.resolvedOptions().timeZone,
      };
    },
    catch: () => `"${timeZone}" isn't a time zone`,
  });

/** Milliseconds until the next minute starts, when the face next changes. */
export const untilNextMinute = (now: Date): number => 60_000 - (now.getTime() % 60_000);
