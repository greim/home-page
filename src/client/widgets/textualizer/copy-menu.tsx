/**
 * The "Copy as…" menu, and the brief note that says how a copy went. The card and
 * the full-screen view each have one, around their own trigger button.
 */
import { Menu, Portal, Text } from "@chakra-ui/react";
import { Effect } from "effect";
import { type ReactElement, useRef, useState } from "react";
import {
  clipboardData,
  type CopyFormat,
  copyFormatLabels,
  copyFormats,
  type HtmlParser,
} from "./convert.ts";
import { writeClipboard } from "./dom.ts";
import type { Source } from "./source.ts";

export type CopyResult = "Copied!" | "Copy failed";

const flashMs = 900;

/** The last copy's result, shown for a moment: and a function to copy. */
export const useCopy = (source: Source | null, parse: HtmlParser) => {
  const [flash, setFlash] = useState<CopyResult | null>(null);
  const timer = useRef<number | null>(null);
  const copy = (format: CopyFormat, from: Element) => {
    if (source === null) return;
    void Effect.runPromise(
      Effect.tryPromise({
        try: () => writeClipboard(from, clipboardData(format, source, parse)),
        catch: String,
      }).pipe(
        Effect.match({
          onSuccess: (): CopyResult => "Copied!",
          onFailure: (): CopyResult => "Copy failed",
        }),
      ),
    ).then((result) => {
      setFlash(result);
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => setFlash(null), flashMs);
    });
  };
  return { flash, copy };
};

/** The menu, opened by `trigger` (a button). */
export function CopyMenu(props: {
  trigger: ReactElement;
  onCopy: (format: CopyFormat, from: Element) => void;
  /** Out of the column, so it isn't clipped; not in a full-screen view, which may be torn off. */
  portalled: boolean;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <Menu.Root
      onSelect={(e) => {
        const format = copyFormats.find((f) => f === e.value);
        if (format !== undefined && trigger.current !== null) props.onCopy(format, trigger.current);
      }}
    >
      <Menu.Trigger ref={trigger} asChild>{props.trigger}</Menu.Trigger>
      <Portal disabled={!props.portalled}>
        <Menu.Positioner>
          <Menu.Content minW="8rem">
            {copyFormats.map((format) => (
              <Menu.Item key={format} value={format}>{copyFormatLabels[format]}</Menu.Item>
            ))}
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}

/** The note after a copy, over the bottom of whatever positioned box it's in. */
export function CopyFlash({ flash }: { flash: CopyResult | null }) {
  if (flash === null) return null;
  return (
    <Text
      position="absolute"
      bottom="0.6rem"
      left="50%"
      transform="translateX(-50%)"
      pointerEvents="none"
      whiteSpace="nowrap"
      fontSize="0.75rem"
      px="0.6em"
      py="0.25em"
      borderRadius="0.3em"
      bg="black"
      color={flash === "Copy failed" ? "red.300" : "green.300"}
      textShadow="none"
      role="status"
      zIndex="1"
    >
      {flash}
    </Text>
  );
}
