import { assertEquals } from "@std/assert";
import type { ChatEvent } from "../../common/assistant.ts";
import { emptyLayout } from "../../common/model.ts";
import {
  type Chat,
  type ChatAction,
  chatReducer,
  emptyChat,
  isOurs,
  restoreChat,
  saveChat,
  summaryText,
  usageText,
  waitingOnUser,
} from "./chat.ts";

const play = (actions: ReadonlyArray<ChatAction>) => actions.reduce(chatReducer, emptyChat);

/** The service's events for a turn, numbered from `after` + 1 in log "L". */
const turn = (after: number, events: ReadonlyArray<ChatEvent>): ReadonlyArray<ChatAction> => [
  { is: "accepted", log: "L", after },
  ...events.map((event, i): ChatAction => ({
    is: "event",
    logged: { seq: after + i + 1, event, transient: false, sessionId: null },
  })),
];

const tool: ChatEvent = {
  is: "tool",
  toolUseId: "t1",
  name: "Read",
  label: "Reading layout.json",
  input: { file_path: "/repo/layout.json" },
};

Deno.test("a turn records the user's message, the agent's progress, and its outcome", () => {
  const chat = play([
    { is: "send", text: "Add a column", images: 0 },
    ...turn(0, [
      { is: "session", sessionId: "s1" },
      { is: "mode", mode: "default" },
      tool,
      { is: "tool-result", toolUseId: "t1", text: "{}", isError: false },
      { is: "rejected", message: "Expected 1" },
      { is: "applied", layout: emptyLayout },
      { is: "text", text: "Done." },
      { is: "error", message: "Hmm" },
    ]),
  ]);
  assertEquals(chat, {
    sessionId: "s1",
    busy: true,
    log: "L",
    seq: 8,
    mode: "default",
    draft: "",
    usage: null,
    model: null,
    entries: [
      { is: "user", text: "Add a column" },
      {
        is: "tool",
        toolUseId: "t1",
        name: "Read",
        label: "Reading layout.json",
        input: { file_path: "/repo/layout.json" },
        result: { text: "{}", isError: false },
      },
      { is: "rejected", message: "Expected 1" },
      { is: "applied" },
      { is: "assistant", text: "Done." },
      { is: "error", message: "Hmm" },
    ],
  });
  const done = chatReducer(chat, {
    is: "event",
    logged: {
      seq: 9,
      event: { is: "done", costUsd: 0.042, durationMs: 23_400 },
      transient: false,
      sessionId: "s1",
    },
  });
  assertEquals(done.busy, false);
  assertEquals(done.entries.at(-1), { is: "summary", text: "$0.04 · 23s" });
});

Deno.test("streamed text builds a draft, which the finished text (or a tool call) replaces", () => {
  const delta = (text: string): ChatAction => ({
    is: "event",
    // Transient events carry the last kept number, and don't move it on.
    logged: { seq: 1, event: { is: "delta", text }, transient: true, sessionId: null },
  });
  const writing = play([
    { is: "send", text: "Hi", images: 0 },
    ...turn(0, [tool]),
    delta("Hel"),
    delta("lo"),
  ]);
  assertEquals([writing.draft, writing.seq], ["Hello", 1]);
  const finished = chatReducer(writing, {
    is: "event",
    logged: { seq: 2, event: { is: "text", text: "Hello!" }, transient: false, sessionId: null },
  });
  assertEquals(finished.draft, "");
  assertEquals(finished.entries.at(-1), { is: "assistant", text: "Hello!" });
  const toolCalled = chatReducer(writing, {
    is: "event",
    logged: { seq: 2, event: { ...tool, toolUseId: "t2" }, transient: false, sessionId: null },
  });
  assertEquals(toolCalled.draft, "");
});

Deno.test("events already seen are ignored, so a reconnect can overlap", () => {
  const chat = play([
    { is: "send", text: "Hi", images: 0 },
    ...turn(3, [{ is: "text", text: "One" }]),
    {
      is: "event",
      logged: { seq: 4, event: { is: "text", text: "One" }, transient: false, sessionId: null },
    },
  ]);
  assertEquals(chat.entries.filter((e) => e.is === "assistant").length, 1);
});

Deno.test("permission requests wait, then show how they were settled", () => {
  const asked = [
    { is: "permission", requestId: "r1", tool: "Bash", detail: "git commit", canAlways: true },
    { is: "permission", requestId: "r2", tool: "Bash", detail: "git push", canAlways: false },
  ] as const;
  const chat = play([{ is: "send", text: "Commit", images: 0 }, ...turn(0, asked)]);
  assertEquals(chat.entries.at(1), { ...asked[0], state: "waiting" });
  assertEquals(waitingOnUser(chat), true);
  const settled = play([
    { is: "send", text: "Commit", images: 0 },
    ...turn(0, [
      ...asked,
      { is: "settled", requestId: "r1", outcome: "allowed" },
      { is: "settled", requestId: "r2", outcome: "denied" },
    ]),
  ]);
  assertEquals(
    settled.entries.flatMap((e) => e.is === "permission" ? [e.state] : []),
    ["allowed", "denied"],
  );
  assertEquals(waitingOnUser(settled), false);
});

Deno.test("questions wait, then show they were answered or are no longer needed", () => {
  const questions = [{
    question: "Tea?",
    header: "Drink",
    multiSelect: false,
    options: [{ label: "Yes", description: "" }],
  }];
  const states = (outcome: "answered" | "cancelled") =>
    play([
      { is: "send", text: "Ask", images: 0 },
      ...turn(0, [
        { is: "question", requestId: "r1", questions },
        { is: "settled", requestId: "r1", outcome },
      ]),
    ]).entries.flatMap((e) => e.is === "question" ? [e.state] : []);
  assertEquals(states("answered"), ["answered"]);
  assertEquals(states("cancelled"), ["cancelled"]);
});

Deno.test("a failed request is shown and ends the turn; a warning doesn't", () => {
  const failed = play([{ is: "send", text: "Hi", images: 0 }, {
    is: "failed",
    message: "offline",
  }]);
  assertEquals(failed.busy, false);
  assertEquals(failed.entries.at(-1), { is: "error", message: "offline" });
  const warned = play([{ is: "send", text: "Hi", images: 0 }, { is: "warning", message: "lost" }]);
  assertEquals(warned.busy, true);
  assertEquals(warned.entries.at(-1), { is: "error", message: "lost" });
});

Deno.test("a mode the user set is shown", () => {
  assertEquals(play([{ is: "mode", mode: "plan" }]).mode, "plan");
});

Deno.test("a past conversation replaces the current one, shown from its history", () => {
  const chat = play([
    { is: "send", text: "Hi", images: 0 },
    { is: "history", sessionId: "old", events: [{ is: "user", text: "Before" }, tool] },
  ]);
  assertEquals(chat.sessionId, "old");
  assertEquals(chat.busy, false);
  assertEquals(chat.entries.map((e) => e.is), ["user", "tool"]);
});

Deno.test("reset starts a new conversation", () => {
  const chat = play([
    { is: "send", text: "Hi", images: 0 },
    ...turn(0, [{ is: "session", sessionId: "s1" }, { is: "done", costUsd: null, durationMs: 1 }]),
    { is: "reset" },
  ]);
  assertEquals(chat, emptyChat);
});

Deno.test("summaries show cost when known and round time to whole seconds", () => {
  assertEquals(summaryText(1.5, 61_600), "$1.50 · 62s");
  assertEquals(summaryText(null, 200), "1s");
});

Deno.test("a saved chat is restored as it was, mid-turn too, but for its draft", () => {
  const chat = play([
    { is: "send", text: "Add a column", images: 0 },
    ...turn(2, [
      { is: "session", sessionId: "s1" },
      { is: "mode", mode: "plan" },
      tool,
      { is: "permission", requestId: "r1", tool: "Bash", detail: "ls", canAlways: false },
      { is: "question", requestId: "r2", questions: [] },
      { is: "applied", layout: emptyLayout },
      { is: "text", text: "Done." },
      { is: "rejected", message: "x" },
    ]),
  ]);
  assertEquals(restoreChat(saveChat(chat)), chat);
  assertEquals(restoreChat(saveChat({ ...chat, draft: "Half" })).draft, "");
});

Deno.test("entries this version can't show are dropped from a restored chat", () => {
  const saved = JSON.stringify({
    sessionId: "s1",
    entries: [{ is: "user", text: "Hi" }, { is: "activity", label: "Reading" }],
    busy: false,
  });
  assertEquals(restoreChat(saved).entries, [{ is: "user", text: "Hi" }]);
});

Deno.test("a chat saved mid-turn before the service kept a log is restored idle, marked cut off", () => {
  const saved = JSON.stringify({
    sessionId: "s1",
    entries: [{ is: "user", text: "Hi" }],
    busy: true,
  });
  const restored = restoreChat(saved);
  assertEquals(restored.busy, false);
  assertEquals(restored.sessionId, "s1");
  assertEquals(restored.entries.at(-1)?.is, "error");
});

Deno.test("nothing saved, or something unreadable, restores an empty chat", () => {
  assertEquals(restoreChat(null), emptyChat);
  assertEquals(restoreChat("not json"), emptyChat);
  assertEquals(restoreChat(JSON.stringify({ sessionId: 3, entries: [] })), emptyChat);
});

Deno.test("only this conversation's events are taken from the shared log", () => {
  const idle: Chat = { ...emptyChat, sessionId: "mine", seq: 3 };
  const theirs = chatReducer(idle, {
    is: "event",
    logged: { seq: 4, event: { is: "text", text: "Other" }, transient: false, sessionId: "other" },
  });
  // Not shown, but the log has been read past it.
  assertEquals([theirs.entries.length, theirs.seq], [0, 4]);
  const ours = chatReducer(idle, {
    is: "event",
    logged: { seq: 4, event: { is: "text", text: "Mine" }, transient: false, sessionId: "mine" },
  });
  assertEquals(ours.entries, [{ is: "assistant", text: "Mine" }]);
  const theirDraft = chatReducer(idle, {
    is: "event",
    logged: { seq: 3, event: { is: "delta", text: "x" }, transient: true, sessionId: "other" },
  });
  assertEquals(theirDraft.draft, "");
});

Deno.test("while a conversation waits on its turn, events not yet tied to one are its", () => {
  assertEquals(isOurs({ ...emptyChat, busy: true }, null), true);
  assertEquals(isOurs({ ...emptyChat, busy: true }, "new"), true);
  assertEquals(isOurs(emptyChat, null), false);
  assertEquals(isOurs(emptyChat, "any"), false);
  assertEquals(isOurs({ ...emptyChat, sessionId: "s", busy: true }, null), true);
  assertEquals(isOurs({ ...emptyChat, sessionId: "s" }, null), false);
});

Deno.test("a turn the agent begins itself makes the conversation busy until it's done", () => {
  const chat = chatReducer({ ...emptyChat, sessionId: "s1" }, {
    is: "event",
    logged: { seq: 1, event: { is: "started" }, transient: false, sessionId: "s1" },
  });
  assertEquals(chat.busy, true);
});

Deno.test("following a log starts from its position; an accepted message never moves back", () => {
  const attached = chatReducer(emptyChat, { is: "attached", log: "L", after: 9 });
  assertEquals([attached.log, attached.seq], ["L", 9]);
  assertEquals(chatReducer(attached, { is: "accepted", log: "L", after: 7 }).seq, 9);
  assertEquals(chatReducer(attached, { is: "accepted", log: "M", after: 2 }).seq, 2);
});

Deno.test("notices and the offer to reload are shown, and kept", () => {
  const logged = (seq: number, event: ChatEvent): ChatAction => ({
    is: "event",
    logged: { seq, event, transient: false, sessionId: "s1" },
  });
  const chat = play([
    { is: "send", text: "Fix it", images: 0 },
    { is: "accepted", log: "L", after: 0 },
    logged(1, { is: "session", sessionId: "s1" }),
    logged(2, { is: "done", costUsd: null, durationMs: 1 }),
    // After the turn, still this conversation's.
    logged(3, { is: "notice", text: "Restarting the server…", tone: "info" }),
    logged(4, { is: "reload" }),
  ]);
  assertEquals(chat.entries.slice(-2), [
    { is: "notice", text: "Restarting the server…", tone: "info" },
    { is: "reload" },
  ]);
  assertEquals(restoreChat(saveChat(chat)).entries, chat.entries);
});

Deno.test("attached images are noted under the message they went with", () => {
  const chat = play([{ is: "send", text: "Like this", images: 2 }]);
  assertEquals(chat.entries, [
    { is: "user", text: "Like this" },
    { is: "attachments", count: 2 },
  ]);
  // (Saved mid-turn with no log position, it's restored marked as cut off after these.)
  assertEquals(restoreChat(saveChat(chat)).entries.slice(0, 2), chat.entries);
});

Deno.test("usage is shown as reported, and the chosen model kept across conversations", () => {
  const chat = play([
    { is: "send", text: "Hi", images: 0 },
    ...turn(0, [{ is: "usage", costUsd: 1.234, contextPercent: 23.4, model: "claude-opus-5-5" }]),
    { is: "model", model: "opus" },
  ]);
  assertEquals(chat.usage, { costUsd: 1.234, contextPercent: 23.4, model: "claude-opus-5-5" });
  assertEquals(usageText(chat.usage!), "claude-opus-5-5 · 23% of context · $1.23 so far");
  assertEquals(usageText({ costUsd: null, contextPercent: null, model: "m" }), "m");
  assertEquals(chatReducer(chat, { is: "reset" }).model, "opus");
  assertEquals(chatReducer(chat, { is: "history", sessionId: "s", events: [] }).model, "opus");
  assertEquals(restoreChat(saveChat(chat)).model, "opus");
});
