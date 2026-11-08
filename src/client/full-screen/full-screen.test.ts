import { assertEquals, assertStrictEquals } from "@std/assert";
import { defaultLayout, type Layout } from "../../common/model.ts";
import {
  canPullBack,
  close,
  closed,
  closeModal,
  type FullScreenState,
  type FullScreenView,
  open,
  pipClosed,
  prune,
  pullBack,
  tornOff,
  viewKey,
} from "./full-screen.ts";

type State = FullScreenState<string>;

const assistant: FullScreenView = { is: "assistant" };
const settings: FullScreenView = { is: "settings" };
const editor: FullScreenView = { is: "column-editor", columnId: "c1", widgetId: null };
const widget: FullScreenView = { is: "widget", widgetId: "w1" };

const none: State = closed;

Deno.test("a view opens as a modal", () => {
  assertEquals(open(none, settings), { modal: settings, pip: null });
});

Deno.test("nothing else opens while a modal is open", () => {
  const state: State = { modal: settings, pip: null };
  assertStrictEquals(open(state, assistant), state);
});

Deno.test("tearing off moves the modal's view to the PiP window, replacing what was there", () => {
  const torn = tornOff<string>({ modal: settings, pip: { view: assistant, window: "a" } }, "b");
  assertEquals(torn, { modal: null, pip: { view: settings, window: "b" } });
  assertStrictEquals(tornOff(none, "b"), none);
});

Deno.test("with a view in the PiP window, another can open as a modal", () => {
  const state: State = { modal: null, pip: { view: assistant, window: "a" } };
  assertEquals(open(state, settings), { modal: settings, pip: state.pip });
});

Deno.test("opening the view that's in the PiP window pulls it back", () => {
  const state: State = { modal: null, pip: { view: editor, window: "a" } };
  // The same column's editor, whichever widget it's opened on.
  assertEquals(open(state, { is: "column-editor", columnId: "c1", widgetId: "w9" }), {
    modal: editor,
    pip: null,
  });
});

Deno.test("the PiP window pulls its view back only while no modal is open", () => {
  const free: State = { modal: null, pip: { view: assistant, window: "a" } };
  assertEquals(canPullBack(free), true);
  assertEquals(pullBack(free), { modal: assistant, pip: null });

  const blocked: State = { modal: settings, pip: { view: assistant, window: "a" } };
  assertEquals(canPullBack(blocked), false);
  assertStrictEquals(pullBack(blocked), blocked);
  assertStrictEquals(pullBack(none), none);
});

Deno.test("closing the modal leaves the PiP window", () => {
  const state: State = { modal: settings, pip: { view: assistant, window: "a" } };
  assertEquals(closeModal(state), { modal: null, pip: state.pip });
});

Deno.test("a view closes wherever it is", () => {
  const state: State = { modal: settings, pip: { view: editor, window: "a" } };
  assertEquals(close(state, settings), { modal: null, pip: state.pip });
  assertEquals(close(state, editor), { modal: settings, pip: null });
  assertEquals(close(state, widget), state);
});

Deno.test("only the current PiP window's closing empties it", () => {
  const state: State = { modal: null, pip: { view: assistant, window: "b" } };
  assertStrictEquals(pipClosed(state, "a"), state);
  assertEquals(pipClosed(state, "b"), { modal: null, pip: null });
});

Deno.test("views are told apart by what they show", () => {
  assertEquals(viewKey(assistant), "assistant");
  assertEquals(viewKey(settings), "settings");
  assertEquals(viewKey(editor), "column-editor:c1");
  assertEquals(viewKey(widget), "widget:w1");
  assertEquals(viewKey({ is: "permissions", widgetType: "map" }), "permissions:map");
});

Deno.test("views about a column or widget that's gone are closed", () => {
  const layout: Layout = {
    ...defaultLayout,
    columns: [{
      ...defaultLayout.columns.at(0)!,
      id: "c1",
      widgets: [{ id: "w1", is: "clock", config: {} }],
    }],
  };
  const open: State = { modal: editor, pip: { view: widget, window: "a" } };
  assertStrictEquals(prune(open, layout), open);
  assertStrictEquals(
    prune({ modal: settings, pip: null }, { ...layout, columns: [] }).modal,
    settings,
  );
  const permissions: FullScreenView = { is: "permissions", widgetType: "map" };
  assertStrictEquals(
    prune({ modal: permissions, pip: null }, { ...layout, columns: [] }).modal,
    permissions,
  );
  assertEquals(prune(open, { ...layout, columns: [] }), { modal: null, pip: null });
  assertEquals(
    prune({ modal: assistant, pip: { view: widget, window: "a" } }, {
      ...layout,
      columns: [{ ...layout.columns.at(0)!, widgets: [] }],
    }),
    { modal: assistant, pip: null },
  );
});
