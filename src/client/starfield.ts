/**
 * The night sky laid over the page in night mode: randomly placed, sized,
 * turned and tinted stars, each fading in after its own delay, a few of the
 * brightest joined into constellations by faint lines.
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
  /**
   * How strongly sizes lean toward the smallest: 1 spreads them log-uniformly,
   * and each step higher makes large stars rarer still.
   */
  readonly smallBias: number;
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
 * A star's radius, drawn between the smallest and largest on a log scale. With no
 * bias there are as many stars from 1 to 2 as from 2 to 4, so small stars already
 * far outnumber large ones; a bias above 1 pushes the draw further toward small.
 */
const starRadius = (u: number, min: number, max: number, bias: number): number =>
  Math.exp(Math.log(min) + u ** bias * (Math.log(max) - Math.log(min)));

/**
 * A field of stars, none of whose containing circles overlap. Each star is
 * wholly inside the field, randomly turned and tinted, with a random delay.
 * Fewer than asked for if the field fills up.
 */
export const generateStars = (o: StarfieldOptions): ReadonlyArray<Star> => {
  const target = Math.round(o.width * o.height * o.density);
  const stars: Array<Star> = [];
  for (let i = 0; i < target; i++) {
    const r = starRadius(o.random(), o.minRadius, o.maxRadius, o.smallBias);
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

export type Line = { readonly from: Star; readonly to: Star };

export type Constellation = {
  readonly stars: ReadonlyArray<Star>;
  /** Connect all its stars, and never cross each other or another constellation's. */
  readonly lines: ReadonlyArray<Line>;
};

export type ConstellationOptions = {
  /** How many to try for; fewer if the field hasn't the bright stars for them. */
  readonly count: number;
  /** Only stars at least this big join constellations. */
  readonly minStarRadius: number;
  /** Fewest and most stars in each. */
  readonly minStars: number;
  readonly maxStars: number;
  /** The longest line between two of its stars. */
  readonly maxLineLength: number;
  /** The chance a constellation of four or more gets one line closing a loop. */
  readonly loopChance: number;
  readonly random: () => number;
};

const distance = (a: Star, b: Star) => Math.hypot(a.x - b.x, a.y - b.y);

/** Which side of the line through a and b point c lies on (+, − or 0 if on it). */
const side = (a: Star, b: Star, c: Star) =>
  Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));

/** Whether two lines cross. Lines meeting only at a shared star don't. */
const crosses = (l: Line, m: Line): boolean => {
  const shared = [l.from, l.to].some((s) => s === m.from || s === m.to);
  return !shared &&
    side(l.from, l.to, m.from) * side(l.from, l.to, m.to) < 0 &&
    side(m.from, m.to, l.from) * side(m.from, m.to, l.to) < 0;
};

/** The narrowest angle, in degrees, a line makes with others leaving the same star. */
const narrowestAngle = (line: Line, others: ReadonlyArray<Line>): number => {
  const direction = (from: Star, to: Star) => Math.atan2(to.y - from.y, to.x - from.x);
  const angles = others.flatMap((o) =>
    [line.from, line.to].flatMap((star) => {
      const away = (l: Line) => l.from === star ? l.to : l.to === star ? l.from : undefined;
      const a = away(line);
      const b = away(o);
      if (a === undefined || b === undefined) return [];
      const turn = Math.abs(direction(star, a) - direction(star, b)) * 180 / Math.PI;
      return [Math.min(turn, 360 - turn)];
    })
  );
  return Math.min(180, ...angles);
};

/** Lines closing a loop must open at least this wide from their neighbors, so they read as separate. */
const minLoopAngle = 25;

/**
 * A few constellations among the field's brightest stars. Each grows from a
 * random bright star by joining the nearest bright star to any already in it
 * (Prim's algorithm, so its lines are its minimum spanning tree, which never
 * crosses itself), and may get one more line closing a loop. A constellation
 * whose lines would cross another's is dropped. No star is in two.
 */
export const generateConstellations = (
  stars: ReadonlyArray<Star>,
  o: ConstellationOptions,
): ReadonlyArray<Constellation> => {
  const free = new Set(stars.filter((s) => s.r >= o.minStarRadius));
  const constellations: Array<Constellation> = [];
  const attempts = o.count * 10;
  for (let attempt = 0; attempt < attempts && constellations.length < o.count; attempt++) {
    const seed = [...free].at(Math.floor(o.random() * free.size));
    if (seed === undefined) break;
    const size = o.minStars + Math.floor(o.random() * (o.maxStars - o.minStars + 1));
    const members: Array<Star> = [seed];
    const lines: Array<Line> = [];
    while (members.length < size) {
      let nearest: Line | undefined;
      for (const from of members) {
        for (const to of free) {
          if (members.includes(to) || distance(from, to) > o.maxLineLength) continue;
          if (nearest === undefined || distance(from, to) < distance(nearest.from, nearest.to)) {
            nearest = { from, to };
          }
        }
      }
      if (nearest === undefined) break;
      members.push(nearest.to);
      lines.push(nearest);
    }
    const others = constellations.flatMap((c) => c.lines);
    if (
      members.length < o.minStars ||
      lines.some((l) => others.some((m) => crosses(l, m)))
    ) {
      free.delete(seed);
      continue;
    }
    if (members.length >= 4 && o.random() < o.loopChance) {
      const loops = members.flatMap((from, i) => members.slice(i + 1).map((to) => ({ from, to })))
        .filter((l) =>
          distance(l.from, l.to) <= o.maxLineLength &&
          !lines.some((m) =>
            (m.from === l.from && m.to === l.to) || (m.from === l.to && m.to === l.from)
          ) &&
          ![...lines, ...others].some((m) => crosses(l, m)) &&
          narrowestAngle(l, lines) >= minLoopAngle
        );
      const loop = loops.at(Math.floor(o.random() * loops.length));
      if (loop !== undefined) lines.push(loop);
    }
    members.forEach((s) => free.delete(s));
    constellations.push({ stars: members, lines });
  }
  return constellations;
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
