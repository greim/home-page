/**
 * The layout's history: a git repo of its own in `data/`, tracking only layout.json. (The outer
 * repo ignores `data/`, so the two never see each other.) The page shows a small subset of git:
 * the working-tree layout is the live one, HEAD is the last version the user accepted, and any
 * difference is a pending change to accept (commit) or discard (restore HEAD). History is one
 * linear branch, and going back never moves HEAD: restoring an old version is a pending change
 * like any other, accepted as a new commit.
 *
 * This is the functional core, over the injected {@link LayoutRepo} pipes. Every operation runs
 * one at a time, so a request never meets another's half-finished git command; a lock left by a
 * git command run in the terminal is reported as {@link GitFailed}, not crashed on.
 */
import { Context, Data, Effect } from "effect";
import { IoError } from "./http.ts";

/** A git command failed, or git can't be run at all. The message says what happened. */
export class GitFailed extends Data.TaggedError("GitFailed")<{ message: string }> {}

export type GitOutput = {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
};

/** The pipes: git, and files, in the data folder. Paths are relative to it. */
export class LayoutRepo extends Context.Tag("LayoutRepo")<
  LayoutRepo,
  {
    /** Runs git there. Fails only when git can't be run; a failing command is a nonzero code. */
    readonly git: (args: ReadonlyArray<string>) => Effect.Effect<GitOutput, IoError>;
    /** Fails with the runtime's raw error; the core decides what it means. */
    readonly readFile: (path: string) => Effect.Effect<string, IoError>;
    readonly writeFile: (path: string, text: string) => Effect.Effect<void, IoError>;
    /** Makes the data folder, and any above it, if they aren't there. */
    readonly makeDir: Effect.Effect<void, IoError>;
  }
>() {}

const layoutFile = "layout.json";

/** The repo tracks the layout and nothing else in `data/`. */
export const repoIgnoreText = `# Only the layout is versioned (see src/server/layout-history.ts).
*
!.gitignore
!${layoutFile}
`;

/** Commits are made as this, whatever the user's own git config says (or lacks). */
const identity = ["-c", "user.name=Home Page", "-c", "user.email=home-page@localhost"] as const;

/** Never let a global config sign, or hook, or ask about, a commit the user didn't write. */
const quiet = ["-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null"] as const;

export const startMessage = "Start tracking the layout";
export const defaultAcceptMessage = "Change the layout";

/** How the live layout compares with the last accepted one. */
export type Pending = "clean" | "modified" | "new";

/** What `git status --porcelain` says about layout.json. */
export const parseStatus = (stdout: string): Pending => {
  const line = stdout.split("\n").find((l) => l.trim() !== "");
  if (line === undefined) return "clean";
  return line.startsWith("??") ? "new" : "modified";
};

export type Version = {
  readonly id: string;
  /** ISO 8601, with the committer's offset. */
  readonly date: string;
  readonly message: string;
};

/** Asks git for commits as unit-separated fields, record-separated. */
export const logFormat = "--format=%H%x1f%aI%x1f%s%x1e";

/** Versions from `git log` output, newest first. */
export const parseLog = (stdout: string): ReadonlyArray<Version> =>
  stdout.split("\x1e").flatMap((record) => {
    const [id, date, ...message] = record.trim().split("\x1f");
    return id === undefined || id === "" || date === undefined
      ? []
      : [{ id, date, message: message.join("\x1f") }];
  });

/** Whether `text` is a commit's id, possibly abbreviated: never something git could read as a flag. */
export const isCommitId = (text: string): boolean => /^[0-9a-f]{7,40}$/.test(text);

const notFound = (e: IoError) => e.cause instanceof Deno.errors.NotFound;

const failed = (e: IoError) => new GitFailed({ message: `Couldn't run git: ${e.cause}` });

/** The most of a diff worth reading, whether by a person or a model. */
export const maxDiffChars = 12_000;

/** `diff`, cut at a line break if it's longer than {@link maxDiffChars}, saying so. */
export const capDiff = (diff: string): string => {
  if (diff.length <= maxDiffChars) return diff;
  const cut = diff.slice(0, maxDiffChars);
  return `${
    cut.slice(0, Math.max(0, cut.lastIndexOf("\n")))
  }\n[... the rest of the diff is left out]\n`;
};

/** A user's message for a commit: one line, or the default when it's blank. */
export const acceptMessage = (message: string): string => {
  const line = message.trim().split("\n").at(0)?.trim() ?? "";
  return line === "" ? defaultAcceptMessage : line;
};

/** Runs git, failing with its own words when it fails. */
const run = (args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const io = yield* LayoutRepo;
    const out = yield* io.git(args).pipe(Effect.mapError(failed));
    if (out.code !== 0) {
      const why = out.stderr.trim() || out.stdout.trim() || `exit code ${out.code}`;
      return yield* new GitFailed({ message: `git ${args.at(0)} failed: ${why}` });
    }
    return out.stdout;
  });

/** Starts the repo if there isn't one, with the layout as it is now as its first version. */
const ensureRepo = Effect.gen(function* () {
  const io = yield* LayoutRepo;
  const started = yield* io.readFile(".git/HEAD").pipe(
    Effect.as(true),
    Effect.catchIf(notFound, () => Effect.succeed(false)),
    Effect.mapError(failed),
  );
  if (started) return;
  yield* io.makeDir.pipe(Effect.mapError(failed));
  yield* run(["init", "--initial-branch=main"]);
  yield* io.writeFile(".gitignore", repoIgnoreText).pipe(Effect.mapError(failed));
  yield* run(["add", "."]);
  yield* run([...identity, ...quiet, "commit", "-m", startMessage]);
});

const statusNow = run(["status", "--porcelain", "--", layoutFile]).pipe(Effect.map(parseStatus));

/** The operations, each one at a time. */
export const makeLayoutHistory = Effect.gen(function* () {
  const repo = yield* LayoutRepo;
  const lock = yield* Effect.makeSemaphore(1);
  const op = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    lock.withPermits(1)(ensureRepo.pipe(Effect.zipRight(effect))).pipe(
      Effect.provideService(LayoutRepo, repo),
    );
  return {
    /** Starts the repo if need be, which fails if git can't be run at all: for checking at startup. */
    available: op(Effect.void),
    /** Whether the live layout differs from the last accepted one. */
    status: op(statusNow),
    /** The accepted versions, newest first, at most `limit`. */
    versions: (limit: number) =>
      op(run(["log", "-n", String(limit), logFormat, "--", layoutFile]).pipe(Effect.map(parseLog))),
    /**
     * What changed in the live layout since the last accepted one, as a unified diff with a
     * little context, cut to `maxDiffChars`. Empty when nothing changed, or the layout was never
     * accepted (there's nothing to compare with).
     */
    diff: op(
      run(["diff", "--no-color", "--unified=2", "HEAD", "--", layoutFile]).pipe(
        Effect.map(capDiff),
      ),
    ),
    /** What the accepted version `id` changed, as {@link diff} does for the live layout. */
    changes: (id: string) =>
      op(
        isCommitId(id)
          ? run(["show", "--no-color", "--format=", "--unified=2", id, "--", layoutFile]).pipe(
            Effect.map(capDiff),
          )
          : Effect.fail(new GitFailed({ message: `Not a version: ${id}` })),
      ),
    /** Accepts the live layout as a new version. Whether there was anything to accept. */
    accept: (message: string) =>
      op(Effect.gen(function* () {
        if ((yield* statusNow) === "clean") return false;
        yield* run(["add", "--", layoutFile]);
        yield* run([
          ...identity,
          ...quiet,
          "commit",
          "-m",
          acceptMessage(message),
          "--",
          layoutFile,
        ]);
        return true;
      })),
    /** Puts the last accepted layout back. Whether there was anything to discard. */
    discard: op(Effect.gen(function* () {
      const pending = yield* statusNow;
      switch (pending) {
        case "clean":
          return false;
        case "new":
          yield* run(["clean", "--force", "--", layoutFile]);
          return true;
        case "modified":
          yield* run(["checkout", "HEAD", "--", layoutFile]);
          return true;
        default:
          return pending satisfies never;
      }
    })),
    /**
     * Puts an accepted version's layout in place of the live one, as a pending change: nothing
     * is committed, and HEAD stays where it is.
     */
    restore: (id: string) =>
      op(
        isCommitId(id)
          ? run(["checkout", id, "--", layoutFile]).pipe(Effect.asVoid)
          : Effect.fail(new GitFailed({ message: `Not a version: ${id}` })),
      ),
  } as const;
});

export type LayoutHistory = Effect.Effect.Success<typeof makeLayoutHistory>;

/** The one history, shared by every request: its lock is what keeps git commands apart. */
export class LayoutHistoryService
  extends Context.Tag("LayoutHistoryService")<LayoutHistoryService, LayoutHistory>() {}
