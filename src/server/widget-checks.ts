/**
 * The check the assistant service runs on the agent's layout when a turn ends:
 * its shape, plus each widget's config against its type's manifest. It's a
 * `deno` command run in the repo, in its own process so it always loads the
 * current manifests.
 */
import { Effect } from "effect";

export type CheckSettings = {
  /** Where the commands run, so they pick up the repo's deno.json. */
  readonly repoDir: string;
  readonly layoutCheckScript: string;
};

export type Step = { readonly name: string; readonly args: ReadonlyArray<string> };

export type StepResult = { readonly code: number; readonly output: string };

export type CheckOutcome = { ok: true } | { ok: false; diagnostic: string };

export const layoutStep = (s: CheckSettings, layoutFile: string): Step => ({
  name: "Layout check",
  args: ["run", "--allow-read", "--allow-env", s.layoutCheckScript, layoutFile],
});

/** Enough of a failure's output to act on, without flooding the agent's context. */
export const maxOutput = 8000;

/** Drops lines that only say something passed: "Check <file>" and "<test> ... ok". */
export const failuresOnly = (output: string): string =>
  output.split("\n").filter((line) => !/^Check \S|\.\.\. ok( \(|$)/.test(line)).join("\n");

const tail = (text: string) => text.length > maxOutput ? `…${text.slice(-maxOutput)}` : text;

/** Runs the steps in order, stopping at the first that fails. */
export const runSteps = <E, R>(
  steps: ReadonlyArray<Step>,
  run: (step: Step) => Effect.Effect<StepResult, E, R>,
): Effect.Effect<CheckOutcome, E, R> =>
  Effect.gen(function* () {
    for (const step of steps) {
      const result = yield* run(step);
      if (result.code !== 0) {
        return {
          ok: false,
          diagnostic: `${step.name} failed (deno ${step.args.join(" ")}):\n${
            tail(failuresOnly(result.output).trim())
          }`,
        } satisfies CheckOutcome;
      }
    }
    return { ok: true } satisfies CheckOutcome;
  });
