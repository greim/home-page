import { defineManifest } from "../../../common/widgets.ts";
import { TextualizerConfig } from "./config.ts";
import { GrammarReport } from "./report.ts";

const instructions = `You're a careful, experienced copy editor. You're given a block of text
someone wrote, in Markdown, and you check its prose for errors and for how easily it reads.

Find every problem of these kinds:
- grammar: agreement, tense, sentence structure, misused words.
- spelling: misspellings and typos.
- punctuation: missing, extra or wrong punctuation.
- wording: awkward, wordy, vague or repetitive phrasing, and the wrong word for the meaning.
- clarity: sentences that are hard to follow or could be misread.
- readability: sentences that are too long, or too dense to take in at once.

Check only the prose. Leave code (in backticks or code blocks), URLs and the Markdown syntax
itself alone, and don't flag formatting choices.

For each one, copy its excerpt exactly from the text, character for character, Markdown and all,
so it can be found and replaced; keep it short, but long enough to be unique. Write the suggestion
as a drop-in replacement for the excerpt, keeping any Markdown in it, changing only what's needed
and keeping the writer's voice. Don't flag matters of taste, or rewrite what's already fine. If the
text has no problems, return no issues.

Then sum up, in two or three sentences, how clear and readable the text is, and its main
weaknesses.`;

export const manifest = defineManifest({
  title: "Textualizer",
  description: "A box to paste text into: formatted text from a web page or document, or plain " +
    "Markdown, HTML, TypeScript or JavaScript, or JSON. It works out what was pasted, shows it " +
    "formatted in miniature, and copies it back out as the source, formatted, Markdown or HTML. " +
    "A full-screen view shows it formatted and as editable source, and checks the grammar of " +
    "prose (Markdown and HTML) with Claude. What's pasted isn't saved. The setting is just a " +
    "heading.",
  config: TextualizerConfig,
  defaultConfig: { heading: "Textualizer" },
  fullScreen: { width: 80, height: "full" },
  permissions: {
    services: [{
      name: "Anthropic (Claude)",
      sends: "The text you check, when you ask for a grammar check, using your Claude Code login",
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
