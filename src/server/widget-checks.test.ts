import { assertEquals, assertStringIncludes } from "@std/assert";
import { Effect } from "effect";
import {
  type CheckSettings,
  failuresOnly,
  layoutStep,
  maxOutput,
  runSteps,
  type Step,
} from "./widget-checks.ts";

const settings: CheckSettings = {
  repoDir: "/repo",
  layoutCheckScript: "/repo/bin/check-layout.ts",
};

Deno.test("the layout check runs the check script on the given file", () => {
  assertEquals(layoutStep(settings, "/ws/layout.json").args.slice(-2), [
    settings.layoutCheckScript,
    "/ws/layout.json",
  ]);
});

const runner = (codes: Record<string, number>, ran: Array<string>) => (step: Step) =>
  Effect.sync(() => {
    ran.push(step.name);
    return { code: codes[step.name] ?? 0, output: `  output of ${step.name}\n` };
  });

Deno.test("steps stop at the first failure, which is described with its output", async () => {
  const ran: Array<string> = [];
  const steps: ReadonlyArray<Step> = [
    { name: "First", args: ["one"] },
    { name: "Second", args: ["two"] },
    { name: "Third", args: ["three"] },
  ];
  assertEquals(await Effect.runPromise(runSteps(steps, runner({}, ran))), { ok: true });
  assertEquals(ran.length, 3);

  ran.length = 0;
  const failed = await Effect.runPromise(runSteps(steps, runner({ Second: 1 }, ran)));
  assertEquals(ran, ["First", "Second"]);
  assertEquals(failed, {
    ok: false,
    diagnostic: "Second failed (deno two):\noutput of Second",
  });
});

Deno.test("a long failure is trimmed to its end", async () => {
  const failed = await Effect.runPromise(
    runSteps(
      [{ name: "Tests", args: ["test"] }],
      () => Effect.succeed({ code: 1, output: "x".repeat(maxOutput + 10) + "END" }),
    ),
  );
  assertStringIncludes(failed.ok ? "" : failed.diagnostic, `…${"x".repeat(maxOutput - 3)}END`);
});

Deno.test("lines that only say something passed are left out of a failure", () => {
  assertEquals(
    failuresOnly(
      [
        "Check src/client/widgets/clock/main.tsx",
        "running 2 tests from ./clock.test.ts",
        "formats the time ... ok (3ms)",
        "fails ... FAILED (1ms)",
        "TS2322 [ERROR]: Type 'string' is not assignable to type 'number'.",
      ].join("\n"),
    ),
    [
      "running 2 tests from ./clock.test.ts",
      "fails ... FAILED (1ms)",
      "TS2322 [ERROR]: Type 'string' is not assignable to type 'number'.",
    ].join("\n"),
  );
});
