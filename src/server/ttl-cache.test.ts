import { assertEquals, assertRejects } from "@std/assert";
import { ttlCache } from "./ttl-cache.ts";

Deno.test("an answer is kept for its time, then loaded again", async () => {
  let time = 0;
  let loads = 0;
  const cached = ttlCache<number>(1000, 10, () => time);
  const load = () => Promise.resolve(++loads);
  assertEquals(await cached("a", load), 1);
  time = 999;
  assertEquals(await cached("a", load), 1);
  time = 1000;
  assertEquals(await cached("a", load), 2);
  assertEquals(await cached("b", load), 3);
});

Deno.test("callers share a load in progress", async () => {
  let loads = 0;
  const cached = ttlCache<number>(1000, 10, () => 0);
  const load = () => new Promise<number>((resolve) => setTimeout(() => resolve(++loads), 5));
  assertEquals(await Promise.all([cached("a", load), cached("a", load)]), [1, 1]);
});

Deno.test("a failed load isn't kept", async () => {
  const cached = ttlCache<number>(1000, 10, () => 0);
  await assertRejects(() => cached("a", () => Promise.reject(new Error("down"))));
  assertEquals(await cached("a", () => Promise.resolve(7)), 7);
});

Deno.test("it holds at most its most entries, dropping the oldest", async () => {
  let loads = 0;
  const cached = ttlCache<number>(1000, 2, () => 0);
  const load = () => Promise.resolve(++loads);
  await cached("a", load);
  await cached("b", load);
  await cached("c", load);
  assertEquals(await cached("b", load), 2);
  assertEquals(await cached("a", load), 4);
});
