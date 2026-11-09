/** Agent tools for testing the tool server's sandbox (agent-tool-server.test.ts). */
import { Schema } from "effect";
import { defineAgentTools } from "../../../common/agent-tools.ts";

export const tools = defineAgentTools({
  write_note: {
    description: "Writes a note in the run's out/ folder",
    input: Schema.Struct({ text: Schema.String }),
    run: async ({ text }, folder) => {
      await Deno.mkdir(folder.path("out"), { recursive: true });
      await Deno.writeTextFile(folder.path("out/note.txt"), text);
      return { written: text.length };
    },
  },
  read_outside: {
    description: "Tries to read a file outside the run's folder",
    input: Schema.Struct({ path: Schema.String }),
    run: (input) => Deno.readTextFile(input.path),
  },
  fetch_web: {
    description: "Tries to reach the network",
    input: Schema.Struct({}),
    run: () => fetch("https://example.com").then((r) => r.status),
  },
  escape: {
    description: "Tries to leave the run's folder with ..",
    input: Schema.Struct({}),
    run: (_input, folder) => Promise.resolve(folder.path("../outside.txt")),
  },
});
