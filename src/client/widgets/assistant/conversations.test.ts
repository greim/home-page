import { assertEquals } from "@std/assert";
import { type Chat, emptyChat } from "./chat.ts";
import { makeConversations, storageKey } from "./conversations.ts";

const fakeStorage = (saved: ReadonlyMap<string, Chat> = new Map()) => {
  const loads: Array<string> = [];
  const saves: Array<[string, Chat]> = [];
  return {
    loads,
    saves,
    storage: {
      load: (key: string) => {
        loads.push(key);
        return saved.get(key) ?? emptyChat;
      },
      save: (key: string, chat: Chat) => void saves.push([key, chat]),
    },
  };
};

const panel = { is: "panel" } as const;
const widget = { is: "widget", widgetId: "w1" } as const;

Deno.test("each host has its own conversation, stored under its own key", () => {
  assertEquals(storageKey(panel), "home-page.assistant-chat");
  assertEquals(storageKey(widget), "home-page.assistant-chat.widget.w1");
});

Deno.test("a conversation is read from storage once, then kept", () => {
  const saved: Chat = { sessionId: "s", entries: [], busy: false };
  const fake = fakeStorage(new Map([[storageKey(panel), saved]]));
  const conversations = makeConversations(fake.storage);
  assertEquals(conversations.get(panel), saved);
  assertEquals(conversations.get(panel), saved);
  assertEquals(fake.loads, [storageKey(panel)]);
});

Deno.test("dispatching changes one conversation, saves it, and tells listeners", () => {
  const fake = fakeStorage();
  const conversations = makeConversations(fake.storage);
  let heard = 0;
  const stop = conversations.subscribe(() => heard++);
  conversations.dispatch(widget, { is: "send", text: "hi" });
  assertEquals(conversations.get(widget).entries, [{ is: "user", text: "hi" }]);
  assertEquals(conversations.get(panel).entries, []);
  assertEquals(fake.saves.map(([key]) => key), [storageKey(widget)]);
  assertEquals(heard, 1);
  stop();
  conversations.dispatch(widget, { is: "reset" });
  assertEquals(heard, 1);
});
