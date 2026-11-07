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

const widget = "w1";
const other = "w2";

Deno.test("each widget has its own conversation, stored under its own key", () => {
  assertEquals(storageKey(widget), "home-page.assistant-chat.widget.w1");
  assertEquals(storageKey(other), "home-page.assistant-chat.widget.w2");
});

Deno.test("a conversation is read from storage once, then kept", () => {
  const saved: Chat = { sessionId: "s", entries: [], busy: false };
  const fake = fakeStorage(new Map([[storageKey(widget), saved]]));
  const conversations = makeConversations(fake.storage);
  assertEquals(conversations.get(widget), saved);
  assertEquals(conversations.get(widget), saved);
  assertEquals(fake.loads, [storageKey(widget)]);
});

Deno.test("dispatching changes one conversation, saves it, and tells listeners", () => {
  const fake = fakeStorage();
  const conversations = makeConversations(fake.storage);
  let heard = 0;
  const stop = conversations.subscribe(() => heard++);
  conversations.dispatch(widget, { is: "send", text: "hi" });
  assertEquals(conversations.get(widget).entries, [{ is: "user", text: "hi" }]);
  assertEquals(conversations.get(other).entries, []);
  assertEquals(fake.saves.map(([key]) => key), [storageKey(widget)]);
  assertEquals(heard, 1);
  stop();
  conversations.dispatch(widget, { is: "reset" });
  assertEquals(heard, 1);
});
