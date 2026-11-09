import { defineManifest } from "../../../common/widgets.ts";
import { FixReport, SpreadsheetFixerConfig } from "./config.ts";

const instructions = `You fix messy spreadsheets. You're given a CSV file (in in/) and,
maybe, what the user wants done. Make it clean and consistent without losing information.

1. Call sheet_overview to see the sheet.
2. Decide what to fix. Common problems: stray spaces, inconsistent capitalization, dates in mixed
   formats (make them YYYY-MM-DD), empty or duplicate rows, unclear or messy headers, values that
   mean the same thing written differently, and a column that holds two things (split it). Do what
   the user asked, if they asked for something.
3. Call apply_changes once, with every change, in order. It writes the fixed copy to out/ and
   never touches the original.
4. Answer with what you did.

Never invent data or delete information the user might need: when in doubt, leave it and say so
under "left". Values that look like typos in names or addresses are for the user to decide.`;

export const manifest = defineManifest({
  title: "Spreadsheet Fixer",
  description: "Fixes a messy CSV spreadsheet the user loads (stray spaces, inconsistent case, " +
    "mixed date formats, empty or duplicate rows, messy headers), using a Claude agent with " +
    "tools for the sheet, and offers the fixed copy to download. It opens over the page from a " +
    "button in the column. The setting is just a heading.",
  config: SpreadsheetFixerConfig,
  defaultConfig: { heading: "Spreadsheet Fixer" },
  permissions: {
    services: [{
      name: "Anthropic (Claude)",
      sends: "What Claude reads of the spreadsheet you load (its headers, samples and problem " +
        "cells) and what you ask for, using your Claude Code login",
      privacyPolicy: "https://www.anthropic.com/legal/privacy",
      terms: "https://www.anthropic.com/legal/consumer-terms",
    }],
  },
  agents: {
    fix: {
      title: "Fix a spreadsheet",
      instructions,
      output: FixReport,
      model: "claude-sonnet-5-5",
      maxTurns: 20,
      maxBudgetUsd: 1,
      maxMinutes: 10,
      capabilities: [
        { use: "files" },
        {
          use: "widget-tools",
          policy: "auto",
          does: "Looks over the spreadsheet you give it, and writes a fixed copy",
        },
      ],
    },
  },
});
