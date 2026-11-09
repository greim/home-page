import { defineManifest } from "../../../common/widgets.ts";
import { GrammarCheckConfig } from "./config.ts";
import { GrammarReport } from "./report.ts";

const instructions = `You're a careful, experienced copy editor. You're given a block of text
someone wrote, and you check it for errors and for how easily it reads.

Find every problem of these kinds:
- grammar: agreement, tense, sentence structure, misused words.
- spelling: misspellings and typos.
- punctuation: missing, extra or wrong punctuation.
- wording: awkward, wordy, vague or repetitive phrasing, and the wrong word for the meaning.
- clarity: sentences that are hard to follow or could be misread.
- readability: sentences that are too long, or too dense to take in at once.

For each one, copy its excerpt exactly from the text, character for character, so it can be found
and replaced; keep it short, but long enough to be unique. Write the suggestion as a drop-in
replacement for the excerpt, changing only what's needed and keeping the writer's voice. Don't flag
matters of taste, or rewrite what's already fine. If the text has no problems, return no issues.

Then sum up, in two or three sentences, how clear and readable the text is, and its main
weaknesses.`;

export const manifest = defineManifest({
  title: "Grammar Check",
  description: "Checks a block of text the user pastes in for grammar, spelling, punctuation, " +
    "wording, clarity and readability, using Claude, and suggests fixes they can apply. It " +
    "opens over the page from a button in the column. The text isn't kept. The setting is just " +
    "a heading.",
  config: GrammarCheckConfig,
  defaultConfig: { heading: "Grammar Check" },
  permissions: {
    services: [{
      name: "Anthropic (Claude)",
      sends: "The text you check, so Claude can review it, using your Claude Code login",
      privacyPolicy: "https://www.anthropic.com/legal/privacy",
      terms: "https://www.anthropic.com/legal/consumer-terms",
    }],
  },
  agents: {
    check: {
      title: "Grammar check",
      instructions,
      output: GrammarReport,
      model: "claude-sonnet-5-5",
      maxTurns: 4,
      maxBudgetUsd: 0.5,
    },
  },
});
