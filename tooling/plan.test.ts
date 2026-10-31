import { assertEquals } from "@std/assert";
import { Effect, Either } from "effect";
import { describe, PlanIo, runPlan, type Step } from "./plan.ts";

const recordingIo = (exitCodes: ReadonlyMap<string, number> = new Map()) => {
  const calls: Array<string> = [];
  const io = PlanIo.of({
    mkdir: (p) => Effect.sync(() => void calls.push(`mkdir ${p}`)),
    write: (p, t, m) => Effect.sync(() => void calls.push(`write ${p} ${m.toString(8)} ${t}`)),
    remove: (p) => Effect.sync(() => void calls.push(`rm ${p}`)),
    run: (cmd, args) =>
      Effect.sync(() => {
        calls.push(`run ${cmd} ${args.join(" ")}`);
        return exitCodes.get(cmd) ?? 0;
      }),
    log: (line) => Effect.sync(() => void calls.push(`log ${line}`)),
  });
  return { calls, io };
};

const steps: ReadonlyArray<Step> = [
  { is: "mkdir", path: "/d" },
  { is: "write", path: "/d/f", text: "hi", mode: 0o600 },
  { is: "run", cmd: "maybe", args: ["x"], mayFail: true },
  { is: "run", cmd: "must", args: ["y"], mayFail: false },
  { is: "remove", path: "/d/f" },
];

Deno.test("runPlan executes every step in order", () => {
  const { calls, io } = recordingIo();
  Effect.runSync(runPlan(steps).pipe(Effect.provideService(PlanIo, io)));
  assertEquals(calls.filter((c) => !c.startsWith("log")), [
    "mkdir /d",
    "write /d/f 600 hi",
    "run maybe x",
    "run must y",
    "rm /d/f",
  ]);
  assertEquals(calls.filter((c) => c.startsWith("log")).length, steps.length);
});

Deno.test("runPlan tolerates failures of mayFail steps", () => {
  const { calls, io } = recordingIo(new Map([["maybe", 1]]));
  Effect.runSync(runPlan(steps).pipe(Effect.provideService(PlanIo, io)));
  assertEquals(calls.includes("log   (exited 1; continuing)"), true);
  assertEquals(calls.at(-1), "rm /d/f");
});

Deno.test("runPlan stops at the first required failure", () => {
  const { calls, io } = recordingIo(new Map([["must", 2]]));
  const result = Effect.runSync(
    Effect.either(runPlan(steps).pipe(Effect.provideService(PlanIo, io))).pipe(
      Effect.map(Either.mapLeft((e) => ({ description: e.description, cause: e.cause }))),
    ),
  );
  assertEquals(
    result,
    Either.left({ description: "must y", cause: "exited with code 2" }),
  );
  assertEquals(calls.includes("rm /d/f"), false);
});

Deno.test("describe renders each step kind", () => {
  assertEquals(steps.map(describe), [
    "mkdir /d",
    "write /d/f",
    "maybe x",
    "must y",
    "rm /d/f",
  ]);
});
