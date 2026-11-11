/**
 * Imperative shell for talking to the assistant service from the page: sends
 * messages (with a screenshot of the page, and any images the user attached),
 * follows each turn's events, and relays the user's answers, stops, and mode and
 * model changes.
 */
import { Effect, Either } from "effect";
import { useEffect, useSyncExternalStore } from "react";
import {
  type Answer,
  assistantPortMetaName,
  type AttachedImage,
  type Capabilities,
  type PermissionMode,
  type SessionSummary,
} from "../../common/assistant.ts";
import type { Layout } from "../../common/model.ts";
import {
  answerAssistant,
  type ApiError,
  assistantBase,
  assistantState,
  followAssistant,
  interruptAssistant,
  listAssistantSessions,
  loadAssistantCapabilities,
  loadAssistantSession,
  sendToAssistant,
  setAssistantMode,
  setAssistantModel,
} from "../api.ts";
import { captureScreenshot, run } from "../live.ts";
import { screenshotRootId } from "../screenshot.ts";
import { type Chat, isOurs, restoreChat, saveChat } from "./chat.ts";
import type { ChatStorage, Conversations } from "./conversations.ts";

/** How long to wait before reconnecting to the service's log. */
const reconnectMs = 2000;

/** Browser storage for conversations. It can be unavailable (e.g. private windows). */
export const browserChatStorage: ChatStorage = {
  load: (key) => {
    try {
      return restoreChat(localStorage.getItem(key));
    } catch {
      return restoreChat(null);
    }
  },
  save: (key, chat) => {
    try {
      if (chat.entries.length === 0) localStorage.removeItem(key);
      else localStorage.setItem(key, saveChat(chat));
    } catch {
      // Not saved: the conversation still works, it just won't survive a reload.
    }
  },
};

/** Resolves once the browser has painted what's been rendered so far. */
const afterPaint = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

/**
 * The page as the user sees it, for the agent to look at; null if that fails. Taking it
 * keeps the main thread busy for a while, so it waits until the page has painted (the
 * user's message shown and the box cleared) before starting.
 */
const screenshot = async () => {
  await afterPaint();
  const surface = document.getElementById(screenshotRootId);
  return Effect.runPromise(
    surface === null ? Effect.succeed(null) : captureScreenshot(surface).pipe(
      Effect.tapError((e) => Effect.sync(() => console.warn("Couldn't take a screenshot:", e))),
      Effect.orElseSucceed(() => null),
    ),
  );
};

/** The assistant service's address, from the port the page's `<meta>` gives. */
export const serviceBase = (): string =>
  assistantBase(
    location,
    document.querySelector(`meta[name="${assistantPortMetaName}"]`)?.getAttribute("content") ??
      "",
  );

/** The repo's past conversations, newest first. */
export const loadSessions = (): Promise<Either.Either<ReadonlyArray<SessionSummary>, ApiError>> =>
  run(listAssistantSessions(serviceBase()));

/** Claude Code's slash commands, skills and models in the repo. */
export const loadCapabilities = (): Promise<Either.Either<Capabilities, ApiError>> =>
  run(loadAssistantCapabilities(serviceBase()));

export type Assistant = {
  readonly chat: Chat;
  readonly send: (message: string, images: ReadonlyArray<AttachedImage>) => void;
  readonly answer: (requestId: string, answer: Answer) => void;
  /** Stops the running turn. */
  readonly stop: () => void;
  readonly setMode: (mode: PermissionMode) => void;
  /** Uses this model from now on (null: Claude Code's default). */
  readonly setModel: (model: string | null) => void;
  /** Switches to a past conversation, to continue it. */
  readonly resume: (sessionId: string) => void;
  /** Starts a new conversation. */
  readonly reset: () => void;
};

/**
 * A hook for a conversation, by its id. `onApplied` hears about each layout the
 * assistant applies, so the page can show it.
 */
export const makeUseAssistant = (
  conversations: Conversations,
  onApplied: (layout: Layout) => void,
) => {
  // Conversations whose events are being read, so each is read only once.
  const following = new Set<string>();

  /**
   * Reads the service's log for a conversation for as long as the page is open, so it
   * sees its turns, including ones the agent begins itself between the user's messages.
   * Reconnects when the connection drops; when the service has restarted (a new log), a
   * reply still in progress is lost, and it says so.
   */
  const follow = async (id: string) => {
    if (following.has(id)) return;
    following.add(id);
    while (true) {
      const state = await run(assistantState(serviceBase()));
      if (Either.isRight(state)) {
        const { log, latest } = state.right;
        if (conversations.get(id).log !== log) {
          if (conversations.get(id).busy && conversations.get(id).log !== null) {
            conversations.dispatch(id, {
              is: "failed",
              message: "The assistant service restarted, so this reply was cut off.",
            });
          }
          conversations.dispatch(id, { is: "attached", log, after: latest });
        }
        await run(
          followAssistant(serviceBase(), log, conversations.get(id).seq, (logged) => {
            const before = conversations.get(id);
            conversations.dispatch(id, { is: "event", logged });
            // Each layout this conversation's turns apply reaches the page once.
            if (
              logged.event.is === "applied" && logged.seq > before.seq &&
              isOurs(before, logged.sessionId)
            ) {
              onApplied(logged.event.layout);
            }
          }, false),
        );
      }
      await new Promise((resolve) => setTimeout(resolve, reconnectMs));
    }
  };

  return (id: string): Assistant => {
    const chat = useSyncExternalStore(conversations.subscribe, () => conversations.get(id));
    const dispatch = (action: Parameters<Conversations["dispatch"]>[1]) =>
      conversations.dispatch(id, action);
    const warnIfFailed = (what: string) => (result: Either.Either<unknown, ApiError>) => {
      if (Either.isLeft(result)) {
        dispatch({ is: "warning", message: `${what}: ${result.left.message}` });
      }
    };

    // Read its events from now on (picking up a turn still running after a reload).
    useEffect(() => void follow(id), []);

    const send = (message: string, images: ReadonlyArray<AttachedImage>) => {
      dispatch({ is: "send", text: message, images: images.length });
      screenshot().then((screenshot) =>
        run(
          sendToAssistant(serviceBase(), {
            message,
            sessionId: chat.sessionId,
            screenshot,
            images,
          }),
        )
      ).then((result) => {
        if (Either.isLeft(result)) {
          dispatch({ is: "failed", message: result.left.message });
          return;
        }
        dispatch({ is: "accepted", ...result.right });
      });
    };

    return {
      chat,
      send,
      answer: (requestId, given) =>
        void run(answerAssistant(serviceBase(), requestId, given)).then(
          warnIfFailed("Your answer didn't reach the assistant"),
        ),
      stop: () =>
        void run(interruptAssistant(serviceBase())).then(warnIfFailed("Couldn't stop it")),
      setMode: (mode) =>
        void run(setAssistantMode(serviceBase(), mode, chat.sessionId)).then((result) =>
          Either.isRight(result)
            ? dispatch({ is: "mode", mode })
            : warnIfFailed("Couldn't change the mode")(result)
        ),
      setModel: (model) =>
        void run(setAssistantModel(serviceBase(), model)).then((result) =>
          Either.isRight(result)
            ? dispatch({ is: "model", model })
            : warnIfFailed("Couldn't change the model")(result)
        ),
      resume: (sessionId) =>
        void run(loadAssistantSession(serviceBase(), sessionId)).then((result) =>
          Either.isRight(result)
            ? dispatch({ is: "history", sessionId, events: result.right })
            : warnIfFailed("Couldn't load that conversation")(result)
        ),
      reset: () => dispatch({ is: "reset" }),
    };
  };
};
