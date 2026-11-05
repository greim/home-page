/**
 * The checks the server runs on the assistant's work when a turn ends: on widget
 * source it changed (format, type check, lint, tests, then the widget build), and
 * on its layout (shape, plus each widget's config against its manifest). Each
 * step is a `deno` command run in the repo. See SELF_BUILDING.md.
 */
import { Effect } from "effect";

export type CheckSettings = {
  /** Where the commands run, so they pick up the repo's deno.json. */
  readonly repoDir: string;
  readonly widgetsDir: string;
  readonly distDir: string;
  readonly widgetBuildScript: string;
  readonly layoutCheckScript: string;
};

export type Step = { readonly name: string; readonly args: ReadonlyArray<string> };

export type StepResult = { readonly code: number; readonly output: string };

export type CheckOutcome = { ok: true } | { ok: false; diagnostic: string };

/** In order; the build comes last, so the page only ever gets code that passed the rest. */
export const widgetSteps = (s: CheckSettings): ReadonlyArray<Step> => [
  { name: "Formatting", args: ["fmt", s.widgetsDir] },
  { name: "Type check", args: ["check", s.widgetsDir] },
  { name: "Lint", args: ["lint", s.widgetsDir] },
  {
    name: "Tests",
    args: [
      "test",
      "--allow-read",
      "--allow-write",
      "--allow-run",
      "--permit-no-files",
      s.widgetsDir,
    ],
  },
  {
    name: "Widget build",
    args: ["run", "--allow-read", `--allow-write=${s.distDir}`, "--allow-env", s.widgetBuildScript],
  },
];

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
