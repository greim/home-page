import { assertEquals } from "@std/assert";
import {
  historyText,
  maxKept,
  type PastResearch,
  readHistory,
  withoutResearch,
  withResearch,
} from "./history.ts";

const past = (id: string, createdAt: number): PastResearch => ({
  id,
  topic: `topic ${id}`,
  createdAt,
  report: { title: id, summary: "s", sections: [], sources: [] },
});

Deno.test("history round-trips through its text, and unreadable text is empty", () => {
  const history = [past("a", 2), past("b", 1)];
  assertEquals(readHistory(historyText(history)), history);
  assertEquals(readHistory(null), []);
  assertEquals(readHistory("{nope"), []);
  assertEquals(readHistory('[{"id":1}]'), []);
});

Deno.test("new research goes on top, and one with the same ID is replaced", () => {
  const added = withResearch([past("a", 1)], past("b", 2));
  assertEquals(added.map((h) => h.id), ["b", "a"]);
  assertEquals(withResearch(added, { ...past("a", 3), topic: "again" }).map((h) => h.topic), [
    "again",
    "topic b",
  ]);
});

Deno.test("only the newest maxKept are kept", () => {
  let history: ReadonlyArray<PastResearch> = [];
  for (let i = 0; i <= maxKept; i++) history = withResearch(history, past(`r${i}`, i));
  assertEquals(history.length, maxKept);
  assertEquals(history.some((h) => h.id === "r0"), false);
});

Deno.test("research is removed by ID", () => {
  assertEquals(withoutResearch([past("a", 1), past("b", 2)], "a").map((h) => h.id), ["b"]);
});
