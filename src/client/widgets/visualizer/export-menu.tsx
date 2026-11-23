/**
 * The "Export" menu for a chart (copy or save), and the brief note that says how it went. The
 * card and the full-screen view each have one, around their own trigger button.
 */
import { Text } from "@chakra-ui/react";
import { Effect } from "effect";
import { type ReactElement, useRef, useState } from "react";
import { type ExportAction, ExportPopover } from "../../widget-kit/export-popover.tsx";
import type { Chart, Version } from "./charts.ts";
import { type CopyFormat, copyFormatLabels, copyFormats } from "./copy.ts";
import { copyChart, saveChart } from "./copy-live.ts";

export type CopyResult = "Copied!" | "Saved!" | "Copy failed" | "Save failed";

const formats = copyFormats.map((value) => ({ value, label: copyFormatLabels[value] }));

const flashMs = 900;

/** The last export's result, shown for a moment, and a function to export. */
export const useExport = (chart: Chart | null, version: Version | null) => {
  const [flash, setFlash] = useState<CopyResult | null>(null);
  const timer = useRef<number | null>(null);
  const exportAs = (action: ExportAction, format: CopyFormat, from: Element) => {
    if (chart === null || version === null) return;
    void Effect.runPromise(
      (action === "copy" ? copyChart : saveChart)(format, chart, version, from).pipe(
        Effect.match({
          onSuccess: (): CopyResult => action === "copy" ? "Copied!" : "Saved!",
          onFailure: (): CopyResult => action === "copy" ? "Copy failed" : "Save failed",
        }),
      ),
    ).then((result) => {
      setFlash(result);
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => setFlash(null), flashMs);
    });
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
      color={flash.endsWith("failed") ? "red.300" : "green.300"}
      textShadow="none"
      role="status"
      zIndex="1"
    >
      {flash}
    </Text>
  );
}
