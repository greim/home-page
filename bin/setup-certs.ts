#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run --allow-env
/**
 * Creates the localhost TLS certificate and trusts its (name-constrained) CA.
 * See tooling/cert-plan.ts for details. Safe to re-run.
 */
import { encodeHex } from "@std/encoding/hex";
import { config } from "../src/server/config.ts";
import { certPlan } from "../tooling/cert-plan.ts";
import { executePlan } from "../tooling/plan-live.ts";

await executePlan(certPlan(
  {
    secretsDir: config.secretsDir,
    caCertFile: config.caCertFile,
    certFile: config.certFile,
    keyFile: config.keyFile,
    keychain: `${Deno.env.get("HOME")}/Library/Keychains/login.keychain-db`,
  },
  encodeHex(crypto.getRandomValues(new Uint8Array(16))),
));
console.log(`\nDone. Restart the server, then visit ${config.appUrl}`);
