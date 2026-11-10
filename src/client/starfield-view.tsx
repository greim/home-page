/**
 * The starfield over the page in night mode: an SVG covering the whole window,
 * which never takes clicks. Its stars come out one by one as night falls, each
 * constellation's faint lines once all its stars are out, and the whole field
 * fades away by day.
 */
import { chakra } from "@chakra-ui/react";
import { useMemo, useState } from "react";
import { night as nightStyle } from "./surface.ts";
import { generateConstellations, generateStars, starPath } from "./starfield.ts";

/** The field is this many units wide, and as tall as the window's shape makes it. */
const fieldWidth = 1000;

const starId = "starfield-star";

const starStyles = `
  .starfield-star { opacity: 0; animation: starfield-in ${nightStyle.starFadeSeconds}s linear forwards; }
  @keyframes starfield-in { to { opacity: 1; } }
  .starfield-line { opacity: 0; animation: starfield-line-in ${nightStyle.starFadeSeconds}s linear forwards; }
  @keyframes starfield-line-in { to { opacity: ${nightStyle.constellationLineOpacity}; } }
  @media (prefers-reduced-motion: reduce) {
    .starfield-star { animation: none; opacity: 1; }
    .starfield-line { animation: none; opacity: ${nightStyle.constellationLineOpacity}; }
  }
`;

/** The window's shape: height over width. Fixed when the field's made; the SVG covers any change. */
const windowAspect = () =>
  globalThis.innerWidth > 0 ? globalThis.innerHeight / globalThis.innerWidth : 9 / 16;

export function Starfield(props: {
  night: boolean;
  /** How quickly the field fades in or out (a CSS transition's duration and easing). */
  pace: string;
  /**
   * Whether night is really falling, so a fresh field's stars come out one by one;
   * otherwise (the user ending a daytime preview) the stars there were come back.
   */
  fresh: boolean;
}) {
  // A fresh field each time night falls, so its stars come out anew.
  const [nightsFallen, setNightsFallen] = useState(0);
  const [wasNight, setWasNight] = useState(props.night);
  // Stars stay once out, faded with the field by day, so they can come back as they were.
  const [starsOut, setStarsOut] = useState(props.night);
  if (props.night !== wasNight) {
    setWasNight(props.night);
    if (props.night && props.fresh) setNightsFallen((n) => n + 1);
    if (props.night) setStarsOut(true);
  }
  const height = useMemo(() => Math.round(fieldWidth * windowAspect()), [nightsFallen]);
  const stars = useMemo(
    () =>
      generateStars({
        width: fieldWidth,
        height,
        minRadius: 1.5,
        maxRadius: 7,
        smallBias: 2,
        density: 0.0006,
        delayWindow: nightStyle.starDelayWindowSeconds,
        random: Math.random,
      }),
    [nightsFallen, height],
  );
  const constellations = useMemo(
    () =>
      generateConstellations(stars, {
        count: 6,
        minStarRadius: 4,
        minStars: 3,
        maxStars: 7,
        maxLineLength: 150,
        loopChance: 0.4,
        random: Math.random,
      }).map((c) => ({
        lines: c.lines,
        // Drawn once its last star has half come out.
        delay: Math.max(...c.stars.map((s) => s.delay)) + nightStyle.starFadeSeconds / 2,
      })),
    [stars],
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
      transition={`opacity ${props.pace}`}
    >
      <style>{starStyles}</style>
      <defs>
        <path id={starId} d={starPath()} />
      </defs>
      {starsOut
        ? constellations.map((c, i) => (
          <g key={i} className="starfield-line" style={{ animationDelay: `${c.delay}s` }}>
            {c.lines.map((l, j) => (
              <line
                key={j}
                x1={l.from.x}
                y1={l.from.y}
                x2={l.to.x}
                y2={l.to.y}
                stroke="white"
                strokeWidth="1px"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
        ))
        : null}
      {starsOut
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
