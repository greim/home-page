import { HStack, Slider, Stack, Text } from "@chakra-ui/react";
import {
  chromaGradient,
  type ColumnColor,
  hueGradient,
  maxChroma,
  withChroma,
  withHue,
} from "../common/column-color.ts";

/** One slider, its track painted with the colors it ranges over. */
function ColorSlider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** How the value reads beside the label. */
  display: string;
  track: string;
  onChange: (value: number) => void;
}) {
  return (
    <Slider.Root
      size="sm"
      min={props.min}
      max={props.max}
      step={props.step}
      value={[props.value]}
      onValueChange={(details) => props.onChange(details.value.at(0) ?? props.value)}
    >
      <HStack justify="space-between">
        <Slider.Label>{props.label}</Slider.Label>
        <Text fontSize="xs" color="fg.muted" fontVariantNumeric="tabular-nums">
          {props.display}
        </Text>
      </HStack>
      <Slider.Control>
        <Slider.Track bgImage={props.track} h="2.5" />
        <Slider.Thumbs />
      </Slider.Control>
    </Slider.Root>
  );
}

/**
 * Picks a column color: any hue and chroma at the column lightness, reported
 * as the sliders move. Chroma stops at the most the hue can show, and changing the hue
 * lowers it if the new hue can't reach it.
 */
export function ColorPicker(props: {
  label: string;
  value: ColumnColor;
  onChange: (color: ColumnColor) => void;
}) {
  const { value, onChange } = props;
  return (
    <Stack gap="3" w="64" role="group" aria-label={props.label}>
      <ColorSlider
        label="Hue"
        value={value.h}
        min={0}
        max={359}
        step={1}
        display={`${Math.round(value.h)}°`}
        track={hueGradient()}
        onChange={(h) => onChange(withHue(value, h))}
      />
      <ColorSlider
        label="Chroma"
        value={value.c}
        min={0}
        max={maxChroma(value.h)}
        step={0.0005}
        display={value.c.toFixed(3)}
        track={chromaGradient(value.h)}
        onChange={(c) => onChange(withChroma(value, c))}
      />
    </Stack>
  );
}
