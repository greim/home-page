/** Imperative shell for plans: real filesystem and subprocesses. */
import { Effect } from "effect";
import { PlanIo, runPlan, type Step } from "./plan.ts";

const live = PlanIo.of({
  mkdir: (path) => Effect.tryPromise(() => Deno.mkdir(path, { recursive: true, mode: 0o700 })),
  write: (path, text, mode) => Effect.tryPromise(() => Deno.writeTextFile(path, text, { mode })),
  remove: (path) => Effect.tryPromise(() => Deno.remove(path)),
  run: (cmd, args) =>
    Effect.tryPromise(() =>
      new Deno.Command(cmd, {
        args: [...args],
        stdout: "inherit",
        stderr: "inherit",
      }).output()
    ).pipe(Effect.map((out) => out.code)),
  log: (line) => Effect.sync(() => console.log(line)),
});

/** Runs a plan; a failed step crashes the script with a readable message. */
export const executePlan = (steps: ReadonlyArray<Step>): Promise<void> =>
  Effect.runPromise(runPlan(steps).pipe(Effect.provideService(PlanIo, live)));
