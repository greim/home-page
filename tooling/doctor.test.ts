import { assertEquals, assertStringIncludes } from "@std/assert";
import { type Check, diagnose, healthy, type Probes, report } from "./doctor.ts";

const now = new Date("2026-11-06T12:00:00Z");

/** A computer with everything set up and running. */
const ready: Probes = {
  os: "darwin",
  denoVersion: "2.9.8",
  hasBundler: true,
  openssl: { found: true, path: "/usr/bin/openssl", version: "LibreSSL 3.3.6" },
  security: { found: true, path: "/usr/bin/security", version: "" },
  claude: { found: true, path: "/Users/me/.local/bin/claude", version: "2.1.319" },
  cert: { is: "present", expires: new Date("2028-02-09T12:00:00Z") },
  caTrusted: true,
  serviceInstalled: true,
  portInUse: true,
  port: 8443,
  assistantInstalled: true,
  assistantPortInUse: true,
  assistantPort: 9443,
  now,
};

/** The check whose label includes `text`. */
const find = (checks: ReadonlyArray<Check>, text: string): Check | undefined =>
  checks.find((c) => c.label.includes(text));

const statuses = (p: Probes) => diagnose(p).map((c) => c.status);

Deno.test("a ready computer passes every check", () => {
  const checks = diagnose(ready);
  assertEquals(statuses(ready).every((s) => s === "ok"), true);
  assertEquals(healthy(checks), true);
  assertEquals(find(checks, "Deno")?.label, "Deno 2.9.8");
  assertEquals(
    find(checks, "certificate,")?.label,
    "Localhost certificate, valid until 2028-02-09",
  );
});

Deno.test("a fresh clone lists every setup step still to do", () => {
  const fresh: Probes = {
    ...ready,
    cert: { is: "missing" },
    caTrusted: false,
    serviceInstalled: false,
    portInUse: false,
    assistantInstalled: false,
    assistantPortInUse: false,
  };
  const checks = diagnose(fresh);
  assertEquals(healthy(checks), false);
  assertEquals(
    checks.flatMap((c) => c.fix === null ? [] : [c.fix]),
    [
      "deno task setup-certs",
      "deno task install-service",
      "deno task install-service",
    ],
  );
  // Not having installed the services yet is fine, since the dev servers work without them.
  assertEquals(find(checks, "Server")?.status, "warn");
  assertEquals(find(checks, "Assistant service")?.status, "warn");
});

Deno.test("an untrusted certificate fails, saying to set it up again", () => {
  const untrusted = find(diagnose({ ...ready, caTrusted: false }), "trust");
  assertEquals(untrusted?.status, "fail");
  assertEquals(untrusted?.fix, "deno task setup-certs (approve the keychain prompt)");
});

Deno.test("anything but macOS fails", () => {
  assertEquals(find(diagnose({ ...ready, os: "linux" }), "linux")?.status, "fail");
});

Deno.test("Deno must be 2 or later, with its bundler", () => {
  assertEquals(find(diagnose({ ...ready, denoVersion: "1.46.3" }), "Deno")?.status, "fail");
  const noBundler = find(diagnose({ ...ready, hasBundler: false }), "Deno");
  assertEquals(noBundler?.status, "fail");
  assertEquals(noBundler?.fix, "Upgrade Deno: deno upgrade");
});

Deno.test("missing tools fail, saying where to get them; claude only warns", () => {
  const checks = diagnose({
    ...ready,
    openssl: { found: false },
    security: { found: false },
    claude: { found: false },
  });
  assertEquals(find(checks, "openssl")?.status, "fail");
  assertEquals(find(checks, "security")?.status, "fail");
  assertEquals(find(checks, "claude")?.status, "warn");
  assertStringIncludes(find(checks, "claude")?.fix ?? "", "sign in");
});

Deno.test("the certificate warns a month before it expires, and fails once it has", () => {
  const expiring = (iso: string) =>
    find(diagnose({ ...ready, cert: { is: "present", expires: new Date(iso) } }), "certificate");
  assertEquals(expiring("2026-12-20T12:00:00Z")?.status, "ok");
  assertEquals(
    expiring("2026-11-26T12:00:00Z")?.label,
    "The localhost certificate expires in 20 days (2026-11-26)",
  );
  assertEquals(expiring("2026-11-26T12:00:00Z")?.status, "warn");
  assertEquals(expiring("2026-11-01T12:00:00Z")?.status, "fail");
  assertEquals(
    find(diagnose({ ...ready, cert: { is: "present", expires: null } }), "certificate")?.status,
    "warn",
  );
});

Deno.test("each service must be serving, and its port free when it isn't installed", () => {
  const down = find(diagnose({ ...ready, portInUse: false }), "Server");
  assertEquals(down?.status, "fail");
  assertStringIncludes(down?.fix ?? "", "logs/server.log");
  assertStringIncludes(down?.fix ?? "", "restart-service app");
  const taken = find(diagnose({ ...ready, serviceInstalled: false }), "Port 8443");
  assertEquals(taken?.status, "fail");
  assertStringIncludes(taken?.fix ?? "", "lsof -nP -iTCP:8443");

  const assistantDown = find(diagnose({ ...ready, assistantPortInUse: false }), "Assistant");
  assertEquals(assistantDown?.status, "fail");
  assertStringIncludes(assistantDown?.fix ?? "", "logs/assistant.log");
  assertStringIncludes(assistantDown?.fix ?? "", "restart-service assistant");
  const assistantTaken = find(diagnose({ ...ready, assistantInstalled: false }), "Port 9443");
  assertEquals(assistantTaken?.status, "fail");
  assertStringIncludes(assistantTaken?.label ?? "", "assistant service can't start");
});

Deno.test("report marks each check, with its fix below", () => {
  assertEquals(
    report([
      { status: "ok", label: "macOS", fix: null },
      { status: "warn", label: "Service not installed", fix: "deno task install-service" },
      { status: "fail", label: "No localhost certificate", fix: "deno task setup-certs" },
    ]),
    [
      "✓ macOS",
      "! Service not installed",
      "    → deno task install-service",
      "✗ No localhost certificate",
      "    → deno task setup-certs",
    ].join("\n"),
  );
});

Deno.test("warnings alone are healthy", () => {
  assertEquals(healthy([{ status: "warn", label: "x", fix: "y" }]), true);
});
