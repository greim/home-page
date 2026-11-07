import { assert, assertEquals } from "@std/assert";
import { generateStars, seededRandom, starPath } from "./starfield.ts";

const options = {
  width: 1000,
  height: 560,
  minRadius: 1.5,
  maxRadius: 7,
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
