/**
 * The tool server, run as Claude Code runs it for a widget (toolServerConfig): the
 * MCP exchange over stdio, and its sandbox (only the run's folder, no network).
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import { toolServerConfig } from "./widget-agents.ts";

const repoDir = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");

Deno.test("a widget's tools are served over MCP, sandboxed to the run's folder", async () => {
  const dir = await Deno.realPath(await Deno.makeTempDir());
  const config = toolServerConfig(
    { repoDir, widgetsSourceDir: `${repoDir}/src/server/fixtures`, denoPath: Deno.execPath() },
    "sandbox-tools",
    dir,
  );
  const child = new Deno.Command(String(config["command"]), {
    args: [...(config["args"] as ReadonlyArray<string>)],
    stdin: "piped",
    stdout: "piped",
    stderr: "inherit",
  }).spawn();
  const writer = child.stdin.getWriter();
  const encoder = new TextEncoder();
  const messages = [
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
    {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "write_note", arguments: { text: "hi" } },
    },
    {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "read_outside", arguments: { path: "/etc/hosts" } },
    },
    { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "fetch_web", arguments: {} } },
    { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "escape", arguments: {} } },
    {
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name: "write_note", arguments: { text: 5 } },
    },
  ];
  for (const message of messages) {
    await writer.write(encoder.encode(JSON.stringify(message) + "\n"));
  }
  await writer.close();
  const output = await child.output();
  const responses = new TextDecoder().decode(output.stdout).trim().split("\n").map((line) =>
    JSON.parse(line)
  );
  const byId = new Map(responses.map((r) => [r.id, r]));

  assertEquals(responses.length, 7);
  assertEquals(byId.get(1).result.capabilities, { tools: {} });
  assertEquals(byId.get(2).result.tools.map((t: { name: string }) => t.name), [
    "write_note",
    "read_outside",
    "fetch_web",
    "escape",
  ]);
  assertEquals(byId.get(2).result.tools[0].inputSchema.properties.text, { type: "string" });
  // It can write in the run's folder...
  assertEquals(byId.get(3).result.content[0].text, '{\n  "written": 2\n}');
  assertEquals(await Deno.readTextFile(`${dir}/out/note.txt`), "hi");
  // ...but not read outside it, reach the network, or leave it with "..".
  for (const id of [4, 5, 6]) assertEquals(byId.get(id).result.isError, true);
  assertStringIncludes(byId.get(4).result.content[0].text, "Requires read access");
  assertStringIncludes(byId.get(5).result.content[0].text, "Requires net access");
  assertStringIncludes(byId.get(6).result.content[0].text, "outside the run's folder");
  // Bad arguments are the agent's error to fix, not the server's.
  assertEquals(byId.get(7).result.isError, true);
  await Deno.remove(dir, { recursive: true });
});
