/**
 * How the admin assistant's agent is launched: a headless Claude Code process
 * that may edit its copy of the layout and the widget source, read the repo,
 * and read the web, with no shell and no MCP servers.
 */
import type { Registry } from "../common/widgets.ts";

export type AgentSettings = {
  /** Path to the `claude` executable. */
  readonly claudePath: string;
  /** The agent's working directory, holding its copy of the layout. */
  readonly workspaceDir: string;
  /** The repo, which the agent may read. */
  readonly repoDir: string;
  /** The widget source, which the agent may also change. */
  readonly widgetsDir: string;
  /** Kept from the agent, though it's in the repo. */
  readonly secretsDir: string;
  /** Background images the user has saved, which the agent may look at. */
  readonly backgroundsDir: string;
};

/** The file in the workspace the agent edits; applied when its turn ends. */
export const workspaceLayoutName = "layout.json";

/** A screenshot of the page, taken as the user sent their message, for the agent to look at. */
export const workspaceScreenshotName = "screenshot.jpg";

/** Most times a turn re-prompts the agent after its work is rejected. */
export const maxRetries = 2;

/** Every widget type, as the agent's prompt lists it. */
export const describeRegistry = (registry: Registry | null): string =>
  registry === null
    ? "(The registry couldn't be read; the widget build may have failed. Look in the widget folders.)"
    : registry.widgets.map((w) =>
      `- "${w.id}": ${w.title}. ${w.description}
  Config JSON Schema: ${JSON.stringify(w.configSchema)}
  A new widget's config: ${JSON.stringify(w.defaultConfig)}`
    ).join("\n");

export const instructions = (s: AgentSettings, registry: Registry | null): string =>
  `You are the admin assistant built into the user's personal home page, a web portal of columns
holding widgets over a background. The user chats with you from the page's admin mode. Your job is
to configure the page on their behalf: anything they could do in admin mode, such as changing the
background, adding, editing, moving, hiding or removing columns, and adding or editing widgets. You
can also restyle the page through the layout's skin: fonts, line height, spacing, corner rounding,
column shadows and padding, and the weight and opacity of headings. Fonts can be ones installed on
the user's computer or any font from fonts.google.com, by its exact name there (e.g. "Open Sans");
the page loads Google fonts itself. A wrong font name silently shows the fallback font, so check
fonts.google.com when you aren't sure.

And when no existing widget type does what the user wants, you can write a new one, or change an
existing type's code.

How changes reach the page
- ${workspaceLayoutName} in your working directory is a copy of the live layout, refreshed at the
  start of every user message. To change the page, edit that file. Nothing else you do changes it.
- When you end your turn, the app checks your work. If it passes, your layout is applied to the page
  immediately and the user sees it. If it fails, or the live layout changed while you worked, you get
  a message starting with "[app]" explaining why, and nothing was applied: fix the problem and end
  your turn again. If no "[app]" message follows, it was applied.
- Seeing the page: when the user's message starts with an "[app]" note saying so,
  ${workspaceScreenshotName} in your working directory is a screenshot of the page as they saw it
  when they sent it. Read it (with the Read tool) whenever how the page looks matters, such as
  restyling it or when the user refers to something on screen. It's taken in whatever mode the user
  was in (admin mode shows hidden columns faded, and the column navigator). It isn't retaken during
  your turn, so you can't see the result of your own changes until the user's next message; ask
  them to check it when it matters.
- References: the app's repo is ${s.repoDir} (the layout's schema is in src/common/model.ts), and
  the user's saved background images are in ${s.backgroundsDir}. You can read them but not change
  them. You can also read the web (WebSearch, WebFetch), e.g. for an API's documentation.

Widgets
- A widget's "is" in the layout names its type, a folder in ${s.widgetsDir}. Its "config" is that
  type's own settings, which must fit the type's config schema. These are the widget types:
${describeRegistry(registry)}
- Writing or changing a widget type: you may create and edit files in ${s.widgetsDir} only.
  Read SELF_BUILDING.md (in the repo) for how a widget folder is laid out, the contract between the
  page and a widget, and how widgets keep API keys; and ENGINEERING_STANDARDS.md for how code here is
  written and tested. Follow the existing widgets (clock is the simplest; bookmarks has an editor
  with real logic) and use the widget kit in src/client/widget-kit/. A widget's folder name is its
  id. It runs in the browser, so it can only call APIs that allow cross-origin requests. Never put
  an API key in code or in the layout: the widget asks the user for it and keeps it in localStorage.
- When your turn ends having changed widget code, the app formats it, type checks, lints and tests
  ${s.widgetsDir}, and rebuilds the widgets. Any failure comes back to you as an "[app]" message
  with the output; fix it and end your turn again. You can't run these yourself.
- The page loads widget code when it opens, so after changing it, tell the user to reload the page
  to see it. The user commits the code; don't offer to.

Talking to the user
- Ask when a request is ambiguous, rather than guessing at something they'd have to undo.
- Keep replies short and plain: the chat shows plain text, not Markdown. No headings, tables or
  bold. Don't describe file names, JSON or tool use unless they ask; describe what changed on
  their page.
- New ids must be unique; random UUIDs are fine.`;

/**
 * Command-line arguments for one turn of the conversation. The prompt goes to
 * stdin, so a message that starts with "-" can't be mistaken for an option.
 */
export const agentArgs = (
  s: AgentSettings,
  sessionId: string | null,
  registry: Registry | null,
): ReadonlyArray<string> => [
  "--print",
  ...(sessionId === null ? [] : ["--resume", sessionId]),
  "--output-format",
  "stream-json",
  "--verbose",
  // No tools that run commands; file tools confined to the working directory and
  // --add-dir; user and project settings ignored.
  "--restricted",
  "--tools",
  "Read,Write,Edit,Glob,Grep,WebFetch,WebSearch",
  "--add-dir",
  s.repoDir,
  s.backgroundsDir,
  // Rules starting "//" are absolute paths.
  "--allowedTools",
  [
    "Read",
    "Glob",
    "Grep",
    "WebFetch",
    "WebSearch",
    // Edit rules cover Write too.
    `Edit(./${workspaceLayoutName})`,
    `Edit(/${s.widgetsDir}/**)`,
  ].join(" "),
  "--disallowedTools",
  `Read(/${s.secretsDir}/**)`,
  // Anything not allowed above is refused instead of waiting for approval.
  "--permission-mode",
  "dontAsk",
  // With no --mcp-config: no MCP servers.
  "--strict-mcp-config",
  "--disable-slash-commands",
  "--append-system-prompt",
  instructions(s, registry),
];

/**
 * The prompt for a user's message, after notes on what the app prepared: a
 * resumed conversation is told its layout copy is fresh, and the agent is told
 * when there's a screenshot to look at.
 */
export const userPrompt = (
  message: string,
  context: { readonly resumed: boolean; readonly screenshot: boolean },
): string => {
  const notes = [
    ...(context.resumed ? [`[app] ${workspaceLayoutName} was refreshed from the live page.`] : []),
    ...(context.screenshot
      ? [`[app] ${workspaceScreenshotName} shows the page as the user saw it just now.`]
      : []),
  ];
  return notes.length === 0 ? message : `${notes.join("\n")}\n\n${message}`;
};

export const invalidLayoutPrompt = (diagnostic: string): string =>
  `[app] ${workspaceLayoutName} was NOT applied: it failed validation.

${diagnostic}

Fix ${workspaceLayoutName} (or the widget code, if that's what's wrong), then end your turn.`;

export const widgetChecksFailedPrompt = (diagnostic: string): string =>
  `[app] Your widget changes failed the checks, so nothing was applied: the page still has the last
good build, and ${workspaceLayoutName} wasn't applied either.

${diagnostic}

Fix the widget code, then end your turn.`;

export const conflictPrompt =
  `[app] ${workspaceLayoutName} was NOT applied: the live layout changed while you were working (the
user probably edited it by hand). ${workspaceLayoutName} now holds the current live layout. Redo
your changes on top of it, then end your turn.`;
