import { assertEquals } from "@std/assert";
import { emptyLayout } from "../../../common/model.ts";
import {
  type ChatAction,
  chatReducer,
  emptyChat,
  restoreChat,
  saveChat,
  summaryText,
} from "./chat.ts";

const play = (actions: ReadonlyArray<ChatAction>) => actions.reduce(chatReducer, emptyChat);

Deno.test("a turn records the user's message, the agent's progress, and its outcome", () => {
  const chat = play([
    { is: "send", text: "Add a column" },
    { is: "event", event: { is: "session", sessionId: "s1" } },
    { is: "event", event: { is: "activity", label: "Reading layout.json" } },
    { is: "event", event: { is: "rejected", message: "Expected 1" } },
    { is: "event", event: { is: "applied", layout: emptyLayout } },
    { is: "event", event: { is: "text", text: "Done." } },
    { is: "event", event: { is: "error", message: "Hmm" } },
    { is: "event", event: { is: "done", costUsd: 0.042, durationMs: 23_400 } },
  ]);
  assertEquals(chat, {
    sessionId: "s1",
    busy: true,
    entries: [
      { is: "user", text: "Add a column" },
      { is: "activity", label: "Reading layout.json" },
      { is: "rejected", message: "Expected 1" },
      { is: "applied" },
      { is: "assistant", text: "Done." },
      { is: "error", message: "Hmm" },
      { is: "summary", text: "$0.04 · 23s" },
    ],
  });
  assertEquals(chatReducer(chat, { is: "finished" }).busy, false);
});

Deno.test("a failed request is shown and ends the turn", () => {
  const chat = play([{ is: "send", text: "Hi" }, { is: "failed", message: "offline" }]);
  assertEquals(chat.busy, false);
  assertEquals(chat.entries.at(-1), { is: "error", message: "offline" });
});

Deno.test("reset starts a new conversation", () => {
  const chat = play([
    { is: "send", text: "Hi" },
    { is: "event", event: { is: "session", sessionId: "s1" } },
    { is: "finished" },
    { is: "reset" },
  ]);
  assertEquals(chat, emptyChat);
});

Deno.test("summaries show cost when known and round time to whole seconds", () => {
  assertEquals(summaryText(1.5, 61_600), "$1.50 · 62s");
  assertEquals(summaryText(null, 200), "1s");
});

Deno.test("a saved chat is restored as it was", () => {
  const chat = play([
    { is: "send", text: "Add a column" },
    { is: "event", event: { is: "session", sessionId: "s1" } },
    { is: "event", event: { is: "activity", label: "Reading layout.json" } },
    { is: "event", event: { is: "rejected", message: "Expected 1" } },
    { is: "event", event: { is: "applied", layout: emptyLayout } },
    { is: "event", event: { is: "text", text: "Done." } },
    { is: "event", event: { is: "error", message: "Hmm" } },
    { is: "event", event: { is: "done", costUsd: 0.042, durationMs: 23_400 } },
    { is: "finished" },
  ]);
  assertEquals(restoreChat(saveChat(chat)), chat);
});

Deno.test("a chat saved mid-turn is restored idle, marked as cut off", () => {
  const chat = play([
    { is: "send", text: "Hi" },
    { is: "event", event: { is: "session", sessionId: "s1" } },
  ]);
  const restored = restoreChat(saveChat(chat));
  assertEquals(restored.busy, false);
  assertEquals(restored.sessionId, "s1");
  assertEquals(restored.entries.length, 2);
  assertEquals(restored.entries.at(-1)?.is, "error");
});

Deno.test("nothing saved, or something unreadable, restores an empty chat", () => {
  assertEquals(restoreChat(null), emptyChat);
  assertEquals(restoreChat("not json"), emptyChat);
  assertEquals(restoreChat(JSON.stringify({ sessionId: 3, entries: [] })), emptyChat);
});
