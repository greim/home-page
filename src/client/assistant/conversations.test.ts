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

const window = "window";
const other = "other";

Deno.test("each conversation is stored under its own key (the window's as it always was)", () => {
  assertEquals(storageKey(window), "home-page.assistant-chat.window");
  assertEquals(storageKey(other), "home-page.assistant-chat.other");
});

Deno.test("a conversation is read from storage once, then kept", () => {
  const saved: Chat = { ...emptyChat, sessionId: "s" };
  const fake = fakeStorage(new Map([[storageKey(window), saved]]));
  const conversations = makeConversations(fake.storage);
  assertEquals(conversations.get(window), saved);
  assertEquals(conversations.get(window), saved);
  assertEquals(fake.loads, [storageKey(window)]);
});

Deno.test("dispatching changes one conversation, saves it, and tells listeners", () => {
  const fake = fakeStorage();
  const conversations = makeConversations(fake.storage);
  let heard = 0;
  const stop = conversations.subscribe(() => heard++);
  conversations.dispatch(window, { is: "send", text: "hi", images: 0 });
  assertEquals(conversations.get(window).entries, [{ is: "user", text: "hi" }]);
  assertEquals(conversations.get(other).entries, []);
  assertEquals(fake.saves.map(([key]) => key), [storageKey(window)]);
  assertEquals(heard, 1);
  stop();
  conversations.dispatch(window, { is: "reset" });
  assertEquals(heard, 1);
});
