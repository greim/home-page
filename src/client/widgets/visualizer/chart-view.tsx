/** A chart's SVG, shown at the width it's given, on the charts' own dark surface. */
import { chakra, type HTMLChakraProps } from "@chakra-ui/react";
import { useLayoutEffect, useRef } from "react";
import { palette } from "./palette.ts";
import { cleanSvg } from "./svg-live.ts";

export function ChartSvg(
  { svg, label, ...rest }: { svg: string; label: string } & HTMLChakraProps<"div">,
) {
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const clean = cleanSvg(svg);
    box.current?.replaceChildren(...(clean === null ? [] : [clean]));
  }, [svg]);
  return (
    <chakra.div
      bg={palette.surface}
      color={palette.text}
      css={{ "& svg": { display: "block", width: "100%", height: "100%" } }}
      aria-label={label}
      role="figure"
      {...rest}
      ref={box}
    />
  );
}
