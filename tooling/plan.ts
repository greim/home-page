/**
 * Scripts in bin/ are expressed as a pure, testable list of steps (a "plan"),
 * executed by {@link runPlan} against injected I/O.
 */
import { Context, Data, Effect } from "effect";

export type Step =
  | { is: "mkdir"; path: string }
  | { is: "write"; path: string; text: string; mode: number }
  | { is: "remove"; path: string }
  | {
    is: "run";
    cmd: string;
    args: ReadonlyArray<string>;
    /** When true, a non-zero exit is reported but doesn't stop the plan. */
    mayFail: boolean;
  };

export class StepFailed extends Data.TaggedError("StepFailed")<{
  description: string;
  cause: unknown;
}> {}

export class PlanIo extends Context.Tag("PlanIo")<
  PlanIo,
  {
    readonly mkdir: (path: string) => Effect.Effect<void, unknown>;
    readonly write: (
      path: string,
      text: string,
      mode: number,
    ) => Effect.Effect<void, unknown>;
    readonly remove: (path: string) => Effect.Effect<void, unknown>;
    readonly run: (
      cmd: string,
      args: ReadonlyArray<string>,
    ) => Effect.Effect<number, unknown>;
    readonly log: (line: string) => Effect.Effect<void>;
  }
>() {}

export const describe = (step: Step): string => {
  switch (step.is) {
    case "mkdir":
      return `mkdir ${step.path}`;
    case "write":
      return `write ${step.path}`;
    case "remove":
      return `rm ${step.path}`;
    case "run":
      return [step.cmd, ...step.args].join(" ");
    default:
      return step satisfies never;
  }
};

const execute = (step: Step) =>
  Effect.gen(function* () {
    const io = yield* PlanIo;
    switch (step.is) {
      case "mkdir":
        return yield* io.mkdir(step.path);
      case "write":
        return yield* io.write(step.path, step.text, step.mode);
      case "remove":
        return yield* io.remove(step.path);
      case "run": {
        const code = yield* io.run(step.cmd, step.args);
        if (code === 0) {
          return;
        }
        if (step.mayFail) {
          return yield* io.log(`  (exited ${code}; continuing)`);
        }
        return yield* Effect.fail(`exited with code ${code}`);
      }
      default:
        return step satisfies never;
    }
  });

export const runPlan = (
  steps: ReadonlyArray<Step>,
): Effect.Effect<void, StepFailed, PlanIo> =>
  Effect.forEach(
    steps,
    (step) =>
      Effect.gen(function* () {
        const io = yield* PlanIo;
        yield* io.log(`→ ${describe(step)}`);
        yield* execute(step).pipe(
          Effect.mapError((cause) => new StepFailed({ description: describe(step), cause })),
        );
      }),
    { discard: true },
  );
