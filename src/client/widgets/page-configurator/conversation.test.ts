import { assertEquals } from "@std/assert";
import {
  conversationText,
  emptyConversation,
  inputFor,
  maxHistory,
  readConversation,
  withAnswer,
  withEntry,
} from "./conversation.ts";

Deno.test("a message is sent with the conversation before it and the last notes", () => {
  const asked = withEntry(emptyConversation, { is: "user", text: "Add a news column" });
  const answered = withAnswer(asked, {
    reply: "Added it.",
    changed: true,
    notes: "Offered to add BBC too",
    handOff: null,
  });
  const applied = withEntry(answered, { is: "page", text: "Applied: Added column “News”." });
  assertEquals(inputFor(applied, "Yes, add BBC"), {
    message: "Yes, add BBC",
    history: [
      { from: "user", text: "Add a news column" },
      { from: "configurator", text: "Added it." },
      { from: "page", text: "Applied: Added column “News”." },
    ],
    notes: "Offered to add BBC too",
  });
});

Deno.test("only the latest turns are sent", () => {
  let conversation = emptyConversation;
  for (let i = 0; i < maxHistory + 5; i++) {
    conversation = withEntry(conversation, { is: "user", text: `${i}` });
  }
  const { history } = inputFor(conversation, "next");
  assertEquals([history.length, history.at(0)?.text], [maxHistory, "5"]);
});

Deno.test("a conversation is kept as text, and an unreadable one starts afresh", () => {
  const conversation = withAnswer(emptyConversation, {
    reply: "That needs a new widget.",
    changed: false,
    notes: "",
    handOff: "Write a stock ticker widget",
  });
  assertEquals(readConversation(conversationText(conversation)), conversation);
  assertEquals(readConversation(null), emptyConversation);
  assertEquals(readConversation("{"), emptyConversation);
  assertEquals(readConversation('{"entries":3}'), emptyConversation);
});
