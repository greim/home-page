/**
 * The "Export" menu (copy or save), and the brief note that says how it went. The card and
 * the full-screen view each have one, around their own trigger button.
 */
import { Text } from "@chakra-ui/react";
import { Effect } from "effect";
import { type ReactElement, useRef, useState } from "react";
import { type ExportAction, ExportPopover } from "../../widget-kit/export-popover.tsx";
import {
  clipboardData,
  type CopyFormat,
  copyFormatLabels,
  copyFormats,
  fileData,
  type HtmlParser,
} from "./convert.ts";
import { downloadText, writeClipboard } from "./dom.ts";
import type { Source } from "./source.ts";

export type CopyResult = "Copied!" | "Copy failed" | "Saved!";

const formats = copyFormats.map((value) => ({ value, label: copyFormatLabels[value] }));

const flashMs = 900;

/** The last export's result, shown for a moment: and a function to export. */
export const useExport = (source: Source | null, parse: HtmlParser) => {
  const [flash, setFlash] = useState<CopyResult | null>(null);
  const timer = useRef<number | null>(null);
  const show = (result: CopyResult) => {
    setFlash(result);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => setFlash(null), flashMs);
  };
  const exportAs = (action: ExportAction, format: CopyFormat, from: Element) => {
    if (source === null) return;
    if (action === "save") {
      const file = fileData(format, source, parse);
      downloadText(from, `textualizer.${file.extension}`, file.mime, file.text);
      show("Saved!");
      return;
    }
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
    ).then(show);
  };
  return { flash, exportAs };
};

/** The popover, opened by `trigger` (a button). */
export function ExportMenu(props: {
  trigger: ReactElement;
  onExport: (action: ExportAction, format: CopyFormat, from: Element) => void;
  /** Out of the column, so it isn't clipped; not in a full-screen view, which may be torn off. */
  portalled: boolean;
}) {
  return <ExportPopover {...props} formats={formats} />;
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
