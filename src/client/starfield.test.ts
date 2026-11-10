import { assert, assertEquals } from "@std/assert";
import { generateConstellations, generateStars, seededRandom, starPath } from "./starfield.ts";
import type { Line } from "./starfield.ts";

const options = {
  width: 1000,
  height: 560,
  minRadius: 1.5,
  maxRadius: 7,
  smallBias: 1,
  density: 0.0003,
  delayWindow: 30,
};
const field = generateStars({ ...options, random: seededRandom(42) });

Deno.test("seededRandom repeats for a seed and stays in [0, 1)", () => {
  const a = seededRandom(7);
  const b = seededRandom(7);
  const draws = Array.from({ length: 1000 }, () => a());
  assertEquals(draws.slice(0, 5), Array.from({ length: 5 }, () => b()));
  assert(draws.every((n) => n >= 0 && n < 1));
  assert(seededRandom(8)() !== seededRandom(7)());
});

Deno.test("generateStars fills the field to about its density", () => {
  // 1000 × 560 × 0.0003 = 168; a sparse field has room for every one.
  assertEquals(field.length, 168);
});

Deno.test("no two stars' containing circles overlap", () => {
  field.forEach((a, i) =>
    field.slice(i + 1).forEach((b) => assert(Math.hypot(a.x - b.x, a.y - b.y) >= a.r + b.r))
  );
});

Deno.test("every star is wholly inside the field", () => {
  for (const s of field) {
    assert(s.x - s.r >= 0 && s.x + s.r <= options.width);
    assert(s.y - s.r >= 0 && s.y + s.r <= options.height);
  }
});

Deno.test("sizes are spread logarithmically: more small stars than large", () => {
  assert(field.every((s) => s.r >= options.minRadius && s.r <= options.maxRadius));
  // Enough stars (1200) for the shares below to be steady.
  const big = generateStars({ ...options, width: 2000, height: 2000, random: seededRandom(3) });
  // Log-uniform: about half fall below the geometric middle, which is well below the plain middle.
  const geometricMiddle = Math.sqrt(options.minRadius * options.maxRadius);
  const plainMiddle = (options.minRadius + options.maxRadius) / 2;
  const below = (limit: number) => big.filter((s) => s.r < limit).length / big.length;
  assert(Math.abs(below(geometricMiddle) - 0.5) < 0.06, `${below(geometricMiddle)}`);
  assert(below(plainMiddle) > 0.65, `${below(plainMiddle)}`);
});

Deno.test("a small bias makes large stars rarer still", () => {
  const sized = (smallBias: number) =>
    generateStars({ ...options, smallBias, width: 2000, height: 2000, random: seededRandom(3) });
  const geometricMiddle = Math.sqrt(options.minRadius * options.maxRadius);
  const below = (stars: ReturnType<typeof sized>) =>
    stars.filter((s) => s.r < geometricMiddle).length / stars.length;
  // A bias of 2 puts √½ ≈ 0.71 below the geometric middle.
  const biased = sized(2);
  assert(Math.abs(below(biased) - Math.SQRT1_2) < 0.06, `${below(biased)}`);
  assert(biased.every((s) => s.r >= options.minRadius && s.r <= options.maxRadius));
});

Deno.test("stars are turned, tinted and delayed at random, delays within the window", () => {
  const spread = (values: ReadonlyArray<number>) => Math.max(...values) - Math.min(...values);
  assert(spread(field.map((s) => s.rotation)) > 300);
  assert(spread(field.map((s) => s.hue)) > 300);
  assert(field.every((s) => s.delay >= 0 && s.delay < options.delayWindow));
  assert(spread(field.map((s) => s.delay)) > 25);
});

Deno.test("a crowded field stops short rather than overlapping stars", () => {
  const crowded = generateStars({
    ...options,
    width: 50,
    height: 50,
    density: 1,
    random: seededRandom(1),
  });
  assert(crowded.length < 2500);
  crowded.forEach((a, i) =>
    crowded.slice(i + 1).forEach((b) => assert(Math.hypot(a.x - b.x, a.y - b.y) >= a.r + b.r))
  );
});

Deno.test("starPath is a closed ten-point outline in the unit circle", () => {
  const path = starPath();
  assert(path.startsWith("M0 -1L"));
  assert(path.endsWith("Z"));
  assertEquals(path.split("L").length, 10);
});

const constellationOptions = {
  count: 6,
  minStarRadius: 4,
  minStars: 3,
  maxStars: 7,
  maxLineLength: 150,
  loopChance: 0.5,
};
const sky = generateStars({ ...options, density: 0.0006, smallBias: 2, random: seededRandom(5) });
const constellations = generateConstellations(sky, {
  ...constellationOptions,
  random: seededRandom(6),
});
const allLines = constellations.flatMap((c) => c.lines);

Deno.test("constellations are made of 3 to 7 bright stars from the field, none shared", () => {
  assert(constellations.length > 0 && constellations.length <= constellationOptions.count);
  const members = constellations.flatMap((c) => c.stars);
  assertEquals(new Set(members).size, members.length);
  for (const c of constellations) {
    assert(c.stars.length >= 3 && c.stars.length <= 7, `${c.stars.length}`);
    assert(c.stars.every((s) => sky.includes(s) && s.r >= constellationOptions.minStarRadius));
  }
});

Deno.test("a constellation's lines join all its stars, each short enough", () => {
  for (const c of constellations) {
    // A tree, or a tree and one line closing a loop.
    assert(c.lines.length === c.stars.length - 1 || c.lines.length === c.stars.length);
    assert(c.lines.every((l) => c.stars.includes(l.from) && c.stars.includes(l.to)));
    assert(c.lines.every((l) => Math.hypot(l.from.x - l.to.x, l.from.y - l.to.y) <= 150));
    const reached = new Set([c.stars.at(0)]);
    for (let grew = true; grew;) {
      grew = false;
      for (const l of c.lines) {
        if (reached.has(l.from) !== reached.has(l.to)) {
          reached.add(l.from).add(l.to);
          grew = true;
        }
      }
    }
    assertEquals(reached.size, c.stars.length);
  }
});

Deno.test("no two constellation lines cross", () => {
  const cross = (l: Line, m: Line) => {
    const side = (a: Line["from"], b: Line["from"], c: Line["from"]) =>
      Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
    return side(l.from, l.to, m.from) * side(l.from, l.to, m.to) < 0 &&
      side(m.from, m.to, l.from) * side(m.from, m.to, l.to) < 0;
  };
  allLines.forEach((l, i) => allLines.slice(i + 1).forEach((m) => assert(!cross(l, m))));
});

Deno.test("some constellations close a loop", () => {
  // Across many fields, so the chance has room to show.
  const loops = Array.from({ length: 20 }, (_, seed) =>
    generateConstellations(
      generateStars({ ...options, density: 0.0006, smallBias: 2, random: seededRandom(seed) }),
      { ...constellationOptions, random: seededRandom(seed + 100) },
    )).flat().filter((c) => c.lines.length === c.stars.length);
  assert(loops.length > 0);
});

Deno.test("a field without bright stars has no constellations", () => {
  assertEquals(
    generateConstellations(sky, {
      ...constellationOptions,
      minStarRadius: 99,
      random: seededRandom(1),
    }),
    [],
  );
});
