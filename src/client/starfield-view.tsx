/**
 * The starfield over the page in night mode: an SVG covering the whole window,
 * which never takes clicks. Its stars come out one by one as night falls, and
 * the whole field fades away by day.
 */
import { chakra } from "@chakra-ui/react";
import { useMemo, useState } from "react";
import { night as nightStyle } from "./surface.ts";
import { generateStars, starPath } from "./starfield.ts";

/** The field is this many units wide, and as tall as the window's shape makes it. */
const fieldWidth = 1000;

const starId = "starfield-star";

const starStyles = `
  .starfield-star { opacity: 0; animation: starfield-in ${nightStyle.starFadeSeconds}s linear forwards; }
  @keyframes starfield-in { to { opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { .starfield-star { animation: none; opacity: 1; } }
`;

/** The window's shape: height over width. Fixed when the field's made; the SVG covers any change. */
const windowAspect = () =>
  globalThis.innerWidth > 0 ? globalThis.innerHeight / globalThis.innerWidth : 9 / 16;

export function Starfield(props: { night: boolean }) {
  // A fresh field each time night falls, so its stars come out anew.
  const [nightsFallen, setNightsFallen] = useState(0);
  const [wasNight, setWasNight] = useState(props.night);
  if (props.night !== wasNight) {
    setWasNight(props.night);
    if (props.night) setNightsFallen((n) => n + 1);
  }
  const height = useMemo(() => Math.round(fieldWidth * windowAspect()), [nightsFallen]);
  const stars = useMemo(
    () =>
      generateStars({
        width: fieldWidth,
        height,
        minRadius: 1.5,
        maxRadius: 7,
        density: 0.0003,
        delayWindow: nightStyle.starDelayWindowSeconds,
        random: Math.random,
      }),
    [nightsFallen, height],
  );

  return (
    <chakra.svg
      key={nightsFallen}
      aria-hidden
      position="absolute"
      inset="0"
      w="full"
      h="full"
      zIndex="2"
      pointerEvents="none"
      viewBox={`0 0 ${fieldWidth} ${height}`}
      preserveAspectRatio="xMidYMid slice"
      opacity={props.night ? nightStyle.starfieldOpacity : 0}
      transition={`opacity ${nightStyle.transition}`}
    >
      <style>{starStyles}</style>
      <defs>
        <path id={starId} d={starPath()} />
      </defs>
      {props.night || nightsFallen > 0
        ? stars.map((s, i) => (
          <use
            key={i}
            href={`#${starId}`}
            className="starfield-star"
            transform={`translate(${s.x} ${s.y}) rotate(${s.rotation}) scale(${s.r})`}
            fill={`oklch(0.95 0.035 ${s.hue})`}
            style={{ animationDelay: `${s.delay}s` }}
          />
        ))
        : null}
    </chakra.svg>
  );
}
