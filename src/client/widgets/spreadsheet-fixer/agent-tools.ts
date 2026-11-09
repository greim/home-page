/**
 * The spreadsheet fixer agent's own tools. They run in Deno, sandboxed to the run's
 * folder (see src/common/agent-tools.ts), never in the page: the user's sheet is in
 * in/, and the fixed copy goes in out/.
 */
import { Schema } from "effect";
import { agentTool, defineAgentTools } from "../../../common/agent-tools.ts";
import { formatCsv, parseCsv } from "./csv.ts";
import { apply, fixedName, fromSheet, Operation, overview, toSheet } from "./sheet.ts";

const File = Schema.String.annotations({
  description: "The sheet's file name in in/, e.g. leads.csv",
});

export const tools = defineAgentTools({
  sheet_overview: agentTool({
    description: "Describes the spreadsheet: its rows, columns (empty cells, distinct values, " +
      "cells with stray spaces, sample values), empty and duplicate rows, rows with the wrong " +
      "number of cells, and its first rows.",
    input: Schema.Struct({ file: File }),
    run: async ({ file }, folder) =>
      overview(toSheet(parseCsv(await Deno.readTextFile(folder.path(`in/${file}`))))),
  }),
  apply_changes: agentTool({
    description: "Applies changes to the spreadsheet, in order, and writes the fixed copy to " +
      "out/ (never changing the original). Call it once with every change. Returns what each " +
      "change did, and the fixed copy's name.",
    input: Schema.Struct({ file: File, operations: Schema.Array(Operation) }),
    run: async ({ file, operations }, folder) => {
      let sheet = toSheet(parseCsv(await Deno.readTextFile(folder.path(`in/${file}`))));
      const notes = operations.map((operation) => {
        const applied = apply(sheet, operation);
        sheet = applied.sheet;
        return applied.note;
      });
      const output = fixedName(file);
      await Deno.mkdir(folder.path("out"), { recursive: true });
      await Deno.writeTextFile(folder.path(`out/${output}`), formatCsv(fromSheet(sheet)));
      return { output, rows: sheet.rows.length, columns: sheet.headers, changes: notes };
    },
  }),
});
