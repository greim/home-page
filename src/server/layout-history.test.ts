import { assertEquals } from "@std/assert";
import { Effect, Either } from "effect";
import { IoError } from "./http.ts";
import {
  acceptMessage,
  capDiff,
  defaultAcceptMessage,
  GitFailed,
  type GitOutput,
  isCommitId,
  LayoutRepo,
  logFormat,
  makeLayoutHistory,
  maxDiffChars,
  parseLog,
  parseStatus,
  repoIgnoreText,
  startMessage,
} from "./layout-history.ts";

const ok = (stdout = ""): GitOutput => ({ code: 0, stdout, stderr: "" });

type Fake = {
  /** Git's answers by command line (args after the `-c` options); anything else succeeds. */
  answers?: Record<string, GitOutput>;
  /** Whether the repo exists already. */
  started?: boolean;
  /** Fail running git altogether, as when it isn't installed. */
  noGit?: boolean;
  /** Time each git command takes, in ms. */
  delay?: number;
};

/** The pipes in memory, recording what git was asked and what was written. */
const fakeRepo = (fake: Fake = {}) => {
  const calls: Array<string> = [];
  const files = new Map<string, string>();
  let started = fake.started ?? true;
  let running = 0;
  let overlapped = false;
  const io = LayoutRepo.of({
    git: (args) =>
      Effect.gen(function* () {
        if (fake.noGit) return yield* new IoError({ cause: "no such file: git" });
        const own = args.filter((a, i) => a !== "-c" && args[i - 1] !== "-c").join(" ");
        calls.push(own);
        running += 1;
        overlapped ||= running > 1;
        yield* Effect.sleep(fake.delay ?? 0);
        running -= 1;
        if (own.startsWith("init")) started = true;
        return fake.answers?.[own] ?? ok();
      }),
    readFile: (path) =>
      path === ".git/HEAD" && !started
        ? Effect.fail(new IoError({ cause: new Deno.errors.NotFound() }))
        : path === ".git/HEAD"
        ? Effect.succeed("ref: refs/heads/main\n")
        : Effect.fail(new IoError({ cause: "unexpected read" })),
    writeFile: (path, text) => Effect.sync(() => void files.set(path, text)),
    makeDir: Effect.sync(() => void calls.push("mkdir")),
  });
  return { io, calls, files, overlapped: () => overlapped };
};

const run = <A>(
  fake: Fake,
  use: (
    h: Effect.Effect.Success<typeof makeLayoutHistory>,
  ) => Effect.Effect<A, GitFailed, LayoutRepo>,
) => {
  const repo = fakeRepo(fake);
  const result = Effect.runPromise(
    Effect.either(
      Effect.gen(function* () {
        return yield* use(yield* makeLayoutHistory);
      }).pipe(Effect.provideService(LayoutRepo, repo.io)),
    ),
  );
  return result.then((either) => ({ either, ...repo }));
};

/** The message of a failure, or null for a success. */
const failure = (either: Either.Either<unknown, GitFailed>): string | null =>
  Either.isLeft(either) ? either.left.message : null;

const statusLine = "status --porcelain -- layout.json";

Deno.test("status parsing: nothing, a changed file, a file git has never seen", () => {
  assertEquals(parseStatus(""), "clean");
  assertEquals(parseStatus("\n"), "clean");
  assertEquals(parseStatus(" M layout.json\n"), "modified");
  assertEquals(parseStatus("M  layout.json\n"), "modified");
  assertEquals(parseStatus("?? layout.json\n"), "new");
});

Deno.test("log parsing reads each version, newest first, and its message may hold anything", () => {
  const stdout = "a1b2c3d\x1f2026-11-21T10:00:00-05:00\x1fAdd news\x1e\n" +
    "e4f5a6b\x1f2026-11-20T09:00:00-05:00\x1fRename \x1f column\x1e\n";
  assertEquals(parseLog(stdout), [
    { id: "a1b2c3d", date: "2026-11-21T10:00:00-05:00", message: "Add news" },
    { id: "e4f5a6b", date: "2026-11-20T09:00:00-05:00", message: "Rename \x1f column" },
  ]);
  assertEquals(parseLog(""), []);
  assertEquals(parseLog("\x1e\n"), []);
  assertEquals(parseLog("lonely\x1e"), []);
});

Deno.test("only commit ids pass for commit ids", () => {
  assertEquals(isCommitId("a1b2c3d"), true);
  assertEquals(isCommitId("a".repeat(40)), true);
  for (
    const bad of ["", "abc", "--help", "-f", "HEAD", "main", "A1B2C3D", "a1b2c3d;", "a".repeat(41)]
  ) {
    assertEquals(isCommitId(bad), false, bad);
  }
});

Deno.test("an accept message is one line, or a default", () => {
  assertEquals(acceptMessage("  Add news \nmore"), "Add news");
  assertEquals(acceptMessage("   "), defaultAcceptMessage);
  assertEquals(acceptMessage("\n\nlater"), "later");
});

Deno.test("the first operation starts the repo: the data folder, git init, an ignore file, a first commit", async () => {
  const { either, calls, files } = await run({ started: false }, (h) => h.status);
  assertEquals(either, Either.right("clean"));
  assertEquals(
    calls,
    [
      "mkdir",
      "init --initial-branch=main",
      "add .",
      `commit -m ${startMessage}`.replace("commit", "commit"),
      statusLine,
    ].map((c) => c.startsWith("commit") ? c : c),
  );
  assertEquals(files.get(".gitignore"), repoIgnoreText);
});

Deno.test("an existing repo isn't started again", async () => {
  const { calls } = await run({}, (h) => h.status);
  assertEquals(calls, [statusLine]);
});

Deno.test("commits are made with their own identity, unsigned and unhooked", async () => {
  const repo = fakeRepo({ started: false });
  const seen: Array<ReadonlyArray<string>> = [];
  const spy = LayoutRepo.of({
    ...repo.io,
    git: (args) => {
      seen.push(args);
      return repo.io.git(args);
    },
  });
  await Effect.runPromise(
    Effect.gen(function* () {
      yield* (yield* makeLayoutHistory).status;
    }).pipe(Effect.provideService(LayoutRepo, spy)),
  );
  const commit = seen.find((a) => a.includes("commit"));
  assertEquals(commit?.includes("user.name=Home Page"), true);
  assertEquals(commit?.includes("user.email=home-page@localhost"), true);
  assertEquals(commit?.includes("commit.gpgsign=false"), true);
  assertEquals(commit?.includes("core.hooksPath=/dev/null"), true);
});

Deno.test("status says what git says about the layout", async () => {
  const modified = await run(
    { answers: { [statusLine]: ok(" M layout.json\n") } },
    (h) => h.status,
  );
  assertEquals(modified.either, Either.right("modified"));
  const added = await run({ answers: { [statusLine]: ok("?? layout.json\n") } }, (h) => h.status);
  assertEquals(added.either, Either.right("new"));
});

Deno.test("versions asks for the log of the layout, with a limit", async () => {
  const log = "a1b2c3d\x1f2026-11-21T10:00:00-05:00\x1fAdd news\x1e";
  const { either, calls } = await run(
    { answers: { [`log -n 5 ${logFormat} -- layout.json`]: ok(log) } },
    (h) => h.versions(5),
  );
  assertEquals(
    either,
    Either.right([
      { id: "a1b2c3d", date: "2026-11-21T10:00:00-05:00", message: "Add news" },
    ]),
  );
  assertEquals(calls.length, 1);
});

Deno.test("diff asks git for the change since HEAD, and cuts a long one at a line", async () => {
  const diff = "@@ -1 +1 @@\n-a\n+b\n";
  const short = await run(
    { answers: { "diff --no-color --unified=2 HEAD -- layout.json": ok(diff) } },
    (h) => h.diff,
  );
  assertEquals(short.either, Either.right(diff));
  const long = "x".repeat(100) + "\n";
  const lines = long.repeat(Math.ceil(maxDiffChars / long.length) + 5);
  const cut = capDiff(lines);
  assertEquals(cut.endsWith("[... the rest of the diff is left out]\n"), true);
  assertEquals(cut.length < maxDiffChars + 100, true);
  assertEquals(capDiff("y".repeat(maxDiffChars)).length, maxDiffChars);
  assertEquals(capDiff("z".repeat(maxDiffChars + 1)).startsWith("\n[... the rest"), true);
});

Deno.test("changes asks git what a version changed, for a real version only", async () => {
  const diff = "@@ -1 +1 @@\n-a\n+b\n";
  const good = await run(
    { answers: { "show --no-color --format= --unified=2 a1b2c3d -- layout.json": ok(diff) } },
    (h) => h.changes("a1b2c3d"),
  );
  assertEquals(good.either, Either.right(diff));
  const bad = await run({}, (h) => h.changes("--output=x"));
  assertEquals(failure(bad.either), "Not a version: --output=x");
  assertEquals(bad.calls, []);
});

Deno.test("accept commits the layout with the message's first line", async () => {
  const { either, calls } = await run(
    { answers: { [statusLine]: ok(" M layout.json\n") } },
    (h) => h.accept("Add news\nand more"),
  );
  assertEquals(either, Either.right(true));
  assertEquals(calls, [statusLine, "add -- layout.json", "commit -m Add news -- layout.json"]);
});

Deno.test("accept does nothing when nothing changed", async () => {
  const { either, calls } = await run({}, (h) => h.accept("Whatever"));
  assertEquals(either, Either.right(false));
  assertEquals(calls, [statusLine]);
});

Deno.test("discard puts back the accepted layout, or removes one that was never accepted", async () => {
  const modified = await run(
    { answers: { [statusLine]: ok(" M layout.json\n") } },
    (h) => h.discard,
  );
  assertEquals(modified.either, Either.right(true));
  assertEquals(modified.calls, [statusLine, "checkout HEAD -- layout.json"]);
  const added = await run({ answers: { [statusLine]: ok("?? layout.json\n") } }, (h) => h.discard);
  assertEquals(added.either, Either.right(true));
  assertEquals(added.calls, [statusLine, "clean --force -- layout.json"]);
  const clean = await run({}, (h) => h.discard);
  assertEquals(clean.either, Either.right(false));
  assertEquals(clean.calls, [statusLine]);
});

Deno.test("restore checks out the version's layout, and only for a real commit id", async () => {
  const good = await run({}, (h) => h.restore("a1b2c3d"));
  assertEquals(good.either, Either.right(undefined));
  assertEquals(good.calls, ["checkout a1b2c3d -- layout.json"]);
  const bad = await run({}, (h) => h.restore("--force"));
  assertEquals(failure(bad.either), "Not a version: --force");
  assertEquals(bad.calls, []);
});

Deno.test("a failing git command fails with what git said", async () => {
  const stderr = "fatal: Unable to create '.git/index.lock': File exists.";
  const { either } = await run(
    { answers: { [statusLine]: { code: 128, stdout: "", stderr } } },
    (h) => h.status,
  );
  assertEquals(failure(either), `git status failed: ${stderr}`);
  const silent = await run(
    { answers: { [statusLine]: { code: 1, stdout: "", stderr: "" } } },
    (h) => h.status,
  );
  assertEquals(failure(silent.either), "git status failed: exit code 1");
});

Deno.test("git that can't be run is a failure, not a crash", async () => {
  const { either } = await run({ noGit: true, started: false }, (h) => h.available);
  assertEquals(failure(either), "Couldn't run git: no such file: git");
  assertEquals((await run({}, (h) => h.available)).either, Either.right(undefined));
});

Deno.test("operations run one at a time", async () => {
  const modified = { answers: { [statusLine]: ok(" M layout.json\n") }, delay: 2 };
  const { overlapped } = await run(
    modified,
    (h) =>
      Effect.all([h.accept("A"), h.discard, h.status, h.versions(3)], { concurrency: "unbounded" }),
  );
  assertEquals(overlapped(), false);
});
