/**
 * The layout history's imperative shell: git and files in the data folder, with no decisions.
 * Tested against a real repo in a temporary folder (layout-history-live.test.ts).
 */
import { Effect } from "effect";
import { IoError } from "./http.ts";
import { LayoutRepo } from "./layout-history.ts";

const decoder = new TextDecoder();

const attempt = <A>(f: () => Promise<A>) =>
  Effect.tryPromise({ try: f, catch: (cause) => new IoError({ cause }) });

/** The pipes for the repo in `dir`. */
export const layoutRepoIn = (dir: string) =>
  LayoutRepo.of({
    git: (args) =>
      attempt(async () => {
        const out = await new Deno.Command("git", {
          args: [...args],
          cwd: dir,
          // Plain, parseable output; and never wait for a person to answer a prompt.
          env: { LC_ALL: "C", GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" },
          stdin: "null",
        }).output();
        return {
          code: out.code,
          stdout: decoder.decode(out.stdout),
          stderr: decoder.decode(out.stderr),
        };
      }),
    readFile: (path) => attempt(() => Deno.readTextFile(`${dir}/${path}`)),
    writeFile: (path, text) => attempt(() => Deno.writeTextFile(`${dir}/${path}`, text)),
    makeDir: attempt(() => Deno.mkdir(dir, { recursive: true })),
  });
