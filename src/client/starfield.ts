/**
 * The night sky laid over the page in night mode (see NEW_LAYOUT.md): randomly
 * placed, sized, turned and tinted stars, each fading in after its own delay.
 */

export type Star = {
  /** Center, in the field's units. */
  readonly x: number;
  readonly y: number;
  /** Radius of the circle containing the star. */
  readonly r: number;
  /** Turn, in degrees. */
  readonly rotation: number;
  /** Hue of its faint tint, in degrees (OKLCH). */
  readonly hue: number;
  /** Seconds before it starts to fade in. */
  readonly delay: number;
};

export type StarfieldOptions = {
  /** The field's size, in its own units (e.g. 1000 wide, and as tall as the window's shape). */
  readonly width: number;
  readonly height: number;
  /** Smallest and largest star radius. */
  readonly minRadius: number;
  readonly maxRadius: number;
  /** Stars per square unit of field. */
  readonly density: number;
  /** Delays are spread evenly over this many seconds. */
  readonly delayWindow: number;
  /** Uniform random numbers in [0, 1), e.g. Math.random, or seededRandom for repeatable fields. */
  readonly random: () => number;
};

/** Tries at a free place for each star before giving up on it, so crowded fields still finish. */
const attemptsPerStar = 30;

/**
 * A star's radius, drawn log-uniformly between the smallest and largest: as many
 * stars from 1 to 2 as from 2 to 4, so small stars far outnumber large ones.
 */
const logUniform = (u: number, min: number, max: number): number =>
  Math.exp(Math.log(min) + u * (Math.log(max) - Math.log(min)));

/**
 * A field of stars, none of whose containing circles overlap. Each star is
 * wholly inside the field, randomly turned and tinted, with a random delay.
 * Fewer than asked for if the field fills up.
 */
export const generateStars = (o: StarfieldOptions): ReadonlyArray<Star> => {
  const target = Math.round(o.width * o.height * o.density);
  const stars: Array<Star> = [];
  for (let i = 0; i < target; i++) {
    const r = logUniform(o.random(), o.minRadius, o.maxRadius);
    for (let attempt = 0; attempt < attemptsPerStar; attempt++) {
      const x = r + o.random() * (o.width - 2 * r);
      const y = r + o.random() * (o.height - 2 * r);
      const free = stars.every((s) => Math.hypot(s.x - x, s.y - y) >= s.r + r);
      if (free) {
        stars.push({
          x,
          y,
          r,
          rotation: o.random() * 360,
          hue: o.random() * 360,
          delay: o.random() * o.delayWindow,
        });
        break;
      }
    }
  }
  return stars;
};

/** A repeatable source of uniform random numbers in [0, 1) (mulberry32). */
export const seededRandom = (seed: number): () => number => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * An SVG path for a five-pointed star in the unit circle, point up, for
 * scaling to each star's radius.
 */
export const starPath = (innerRatio = 0.45): string => {
  const points = Array.from({ length: 10 }, (_, i) => {
    const angle = ((-90 + i * 36) * Math.PI) / 180;
    const radius = i % 2 === 0 ? 1 : innerRatio;
    const round = (n: number) => Math.round(n * 1000) / 1000;
    return `${round(radius * Math.cos(angle))} ${round(radius * Math.sin(angle))}`;
  });
  return `M${points.join("L")}Z`;
};
