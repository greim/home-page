import { assertEquals, assertStringIncludes } from "@std/assert";
import { certPlan } from "./cert-plan.ts";
import { describe } from "./plan.ts";

const plan = certPlan({
  secretsDir: "/s",
  caCertFile: "/s/ca.pem",
  certFile: "/s/localhost.pem",
  keyFile: "/s/localhost-key.pem",
  keychain: "/k",
}, "beef");

Deno.test("certPlan constrains the CA to localhost", () => {
  const caConfig = plan.find((s) => s.is === "write" && s.path === "/s/ca.cnf");
  assertStringIncludes(
    caConfig?.is === "write" ? caConfig.text : "",
    "nameConstraints = critical, permitted;DNS:localhost",
  );
});

Deno.test("certPlan deletes the CA key and temp files, keeping only the server key", () => {
  const removed = plan.flatMap((s) => (s.is === "remove" ? [s.path] : []));
  assertEquals(removed, ["/s/ca-key.pem", "/s/localhost.csr", "/s/ca.cnf", "/s/leaf.cnf"]);
});

Deno.test("certPlan signs with the given serial, then trusts the CA last", () => {
  const commands = plan.map(describe);
  assertEquals(commands.some((c) => c.includes("-set_serial 0xbeef")), true);
  assertEquals(
    commands.at(-1),
    "security add-trusted-cert -r trustRoot -p ssl -k /k /s/ca.pem",
  );
});
