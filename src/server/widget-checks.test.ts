import { assertEquals, assertStringIncludes } from "@std/assert";
import { Effect } from "effect";
import {
  type CheckSettings,
  failuresOnly,
  layoutStep,
  maxOutput,
  runSteps,
  type Step,
  widgetSteps,
} from "./widget-checks.ts";

const settings: CheckSettings = {
  repoDir: "/repo",
  widgetsDir: "/repo/src/client/widgets",
  distDir: "/repo/dist",
  widgetBuildScript: "/repo/bin/build-widgets.ts",
  layoutCheckScript: "/repo/bin/check-layout.ts",
};

Deno.test("widget code is formatted, type checked, linted and tested before it's built", () => {
  const steps = widgetSteps(settings);
  assertEquals(steps.map((s) => s.name), [
    "Formatting",
    "Type check",
    "Lint",
    "Tests",
    "Widget build",
  ]);
  for (const step of steps.slice(0, 4)) {
    assertEquals(step.args.at(-1), settings.widgetsDir);
  }
  assertEquals(steps.at(-1)?.args.includes("--allow-write=/repo/dist"), true);
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
  const steps = widgetSteps(settings);
  assertEquals(await Effect.runPromise(runSteps(steps, runner({}, ran))), { ok: true });
  assertEquals(ran.length, 5);

  ran.length = 0;
  const failed = await Effect.runPromise(runSteps(steps, runner({ Lint: 1 }, ran)));
  assertEquals(ran, ["Formatting", "Type check", "Lint"]);
  assertEquals(failed, {
    ok: false,
    diagnostic: `Lint failed (deno lint ${settings.widgetsDir}):\noutput of Lint`,
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
