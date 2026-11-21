import { assertEquals } from "@std/assert";
import {
  acceptedWith,
  bannerTitle,
  checked,
  defaultMessage,
  failed,
  finished,
  initialPendingState,
  nextSuggestion,
  noSuggestions,
  showsBanner,
  started,
  suggested,
  typed,
} from "./pending-layout.ts";

Deno.test("the banner shows for changes, and for problems, and not otherwise", () => {
  assertEquals(showsBanner(initialPendingState), false);
  assertEquals(showsBanner(checked(initialPendingState, "clean")), false);
  assertEquals(showsBanner(checked(initialPendingState, "modified")), true);
  assertEquals(showsBanner(checked(initialPendingState, "new")), true);
  assertEquals(showsBanner(failed(initialPendingState, "git is busy")), true);
});

Deno.test("a layout never accepted is told apart from one that changed", () => {
  assertEquals(bannerTitle(checked(initialPendingState, "modified")), "You've changed your layout");
  assertEquals(
    bannerTitle(checked(initialPendingState, "new")),
    "Your layout isn't saved as a version yet",
  );
});

Deno.test("an accept or discard works, then ends in nothing pending or in a problem", () => {
  const working = started(checked(initialPendingState, "modified"));
  assertEquals(working, { ...initialPendingState, pending: "modified", working: true });
  assertEquals(finished(), { ...initialPendingState, pending: "clean" });
  assertEquals(failed(working, "locked"), {
    ...initialPendingState,
    pending: "modified",
    problem: "locked",
  });
  // Starting again forgets the old problem; a good check does too.
  assertEquals(started(failed(working, "locked")).problem, null);
  assertEquals(checked(failed(working, "locked"), "modified").problem, null);
});

Deno.test("the default message names when the change was accepted", () => {
  assertEquals(defaultMessage(new Date(2026, 10, 21, 15, 28)), "Layout changes, Nov 21, 3:28 PM");
});

Deno.test("a suggested message stands until the user writes their own", () => {
  const first = suggested(initialPendingState, "Add news");
  assertEquals(first.message, "Add news");
  const mine = typed(first, "My own words");
  assertEquals(mine, { ...first, message: "My own words", typed: true });
  assertEquals(suggested(mine, "Rename Misc"), mine);
  // Accepting or discarding starts over.
  assertEquals(finished().message, "");
  assertEquals(finished().typed, false);
});

Deno.test("a change is accepted with its message, or the default when that's blank", () => {
  const now = new Date(2026, 10, 21, 15, 28);
  assertEquals(acceptedWith(suggested(initialPendingState, "  Add news "), now), "Add news");
  assertEquals(acceptedWith(initialPendingState, now), defaultMessage(now));
  assertEquals(acceptedWith(typed(initialPendingState, "   "), now), defaultMessage(now));
});

Deno.test("Claude is asked once a change has held still, and once per change", () => {
  const a = "-x\n+y\n";
  const b = "-x\n+z\n";
  const one = nextSuggestion(noSuggestions, a);
  assertEquals(one.ask, false); // first sight: the user may still be editing
  const two = nextSuggestion(one.memory, a);
  assertEquals(two.ask, true); // held still
  assertEquals(nextSuggestion(two.memory, a).ask, false); // already described
  const edited = nextSuggestion(two.memory, b);
  assertEquals(edited.ask, false); // changed again
  assertEquals(nextSuggestion(edited.memory, b).ask, true);
  // Nothing changed: nothing to describe.
  assertEquals(nextSuggestion(noSuggestions, "").ask, false);
  assertEquals(nextSuggestion({ seen: "", askedAbout: "" }, "  \n").ask, false);
});
