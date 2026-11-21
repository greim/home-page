/**
 * What the history view shows (see history-view.tsx): when a version was accepted, whether one
 * can be restored now, and a diff's lines.
 */
import type { Pending } from "../common/apis/layout-history.ts";

/** "Nov 21, 3:28 PM", with the year when it isn't this one. */
export const versionDate = (iso: string, now: Date): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
    hour: "numeric",
    minute: "2-digit",
  });
};

export type CanRestore = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/**
 * Whether version number `index` (0 is the newest, the one the layout is based on) can be put in
 * place now. Not over changes nobody has accepted or discarded: they'd be lost.
 */
export const canRestore = (
  index: number,
  pending: Pending | null,
  working: boolean,
): CanRestore => {
  if (index === 0 && pending === "clean") {
    return { ok: false, reason: "This is the version your layout already is." };
  }
  if (pending === null) return { ok: false, reason: "Checking your layout…" };
  if (pending !== "clean") {
    return { ok: false, reason: "Accept or discard your current changes first." };
  }
  if (working) return { ok: false, reason: "Working…" };
  return { ok: true };
};

export type DiffLine = {
  readonly kind: "added" | "removed" | "hunk" | "context";
  readonly text: string;
};

/** A unified diff's lines to show: its body, without git's file headers. */
export const diffLines = (diff: string): ReadonlyArray<DiffLine> =>
  diff.split("\n").flatMap((text): ReadonlyArray<DiffLine> => {
    if (
      text === "" || /^(diff --git|index |--- |\+\+\+ |new file|deleted file|similarity)/.test(text)
    ) {
      return [];
    }
    if (text.startsWith("@@")) return [{ kind: "hunk", text }];
    if (text.startsWith("+")) return [{ kind: "added", text }];
    if (text.startsWith("-")) return [{ kind: "removed", text }];
    return [{ kind: "context", text }];
  });
