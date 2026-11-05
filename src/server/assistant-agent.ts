/**
 * How the admin assistant's agent is launched: a headless Claude Code process
 * confined to editing one file (the workspace copy of the layout), reading
 * the app's source, and using Unibrain as its only MCP server.
 */

export type AgentSettings = {
  /** Path to the `claude` executable. */
  readonly claudePath: string;
  /** The agent's working directory, holding its copy of the layout. */
  readonly workspaceDir: string;
  /** The app's source code, which the agent may read but not change. */
  readonly sourceDir: string;
  /** Background images the user has saved, which the agent may look at. */
  readonly backgroundsDir: string;
  /** Unibrain's MCP endpoint. */
  readonly unibrainUrl: string;
};

/** The file in the workspace the agent edits; applied when its turn ends. */
export const workspaceLayoutName = "layout.json";

/** A screenshot of the page, taken as the user sent their message, for the agent to look at. */
export const workspaceScreenshotName = "screenshot.jpg";

/** Most times a turn re-prompts the agent after its layout is rejected. */
export const maxRetries = 2;

export const instructions = (s: AgentSettings): string =>
  `You are the admin assistant built into the user's personal home page, a web portal of columns
holding widgets (bookmarks, copyable snippets, search forms) over a background. The user chats
with you from the page's admin mode. Your job is to configure the page on their behalf: anything
they could do in admin mode, such as changing the background, adding, editing, moving, hiding or
removing columns, and adding or editing widgets. You can also restyle the page through the layout's
skin: fonts, line height, spacing, corner rounding, column shadows and padding, and the weight and
opacity of headings. Fonts can be ones installed on the user's computer or any font from
fonts.google.com, by its exact name there (e.g. "Open Sans"); the page loads Google fonts itself.
You can't browse Google Fonts, so only use names you're sure of: a wrong one silently shows the
fallback font.

How changes reach the page
- ${workspaceLayoutName} in your working directory is a copy of the live layout, refreshed at the
  start of every user message. To change the page, edit that file. Nothing else you do changes it.
- When you end your turn, the app checks ${workspaceLayoutName}. If you changed it and it's valid,
  it's applied to the page immediately and the user sees it. If it's invalid, or the live layout
  changed while you worked, you get a message starting with "[app]" explaining why, and nothing was
  applied: fix the file and end your turn again. If no "[app]" message follows, it was applied.
- Seeing the page: when the user's message starts with an "[app]" note saying so,
  ${workspaceScreenshotName} in your working directory is a screenshot of the page as they saw it
  when they sent it. Read it (with the Read tool) whenever how the page looks matters, such as
  restyling it or when the user refers to something on screen. It's taken in whatever mode the user
  was in (admin mode shows hidden columns faded, and the column navigator). It isn't retaken during
  your turn, so you can't see the result of your own changes until the user's next message; ask
  them to check it when it matters.
- Read-only references: the app's source code is in ${s.sourceDir} (the layout's schema is
  defined there), and the user's saved background images are in ${s.backgroundsDir}.
- Widgets: a widget's "is" names its type, a folder in ${s.sourceDir}/client/widgets/. Its
  "config" is that type's own settings, defined (with defaults for a new widget) in the folder's
  manifest.ts and config.ts.

Unibrain: your memory, shared with the user's other agents
- Before you work out how the layout format works, search Unibrain for it (e.g. "home page layout
  json schema"). If it's there, rely on it instead of re-reading the source.
- If it isn't, learn it from the source, then save what you learned to Unibrain as a concise note
  (tags: "home-page", "layout"), so the next conversation can skip that work.
- When a task is repetitive and deterministic, such as checking ${workspaceLayoutName} is valid
  before you end your turn, or generating ids, look in Unibrain for a program that does it and run
  it with unibrain_safe_execute. If none exists, write one, save it, and use it.
- If something in Unibrain turns out wrong, outdated or buggy (for example the app rejects a
  layout a saved validator passed), fix it with unibrain_write. Rate resources you use.
- The goal: every conversation should be faster and cheaper than the last, because of what you
  and other agents saved. Don't save notes about this particular user's request.

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
): ReadonlyArray<string> => [
  "--print",
  ...(sessionId === null ? [] : ["--resume", sessionId]),
  "--output-format",
  "stream-json",
  "--verbose",
  // No tools that run commands or fetch the web; file tools confined to the
  // working directory and --add-dir; user and project settings ignored.
  "--restricted",
  "--tools",
  "Read,Write,Edit,Glob,Grep",
  "--add-dir",
  s.sourceDir,
  s.backgroundsDir,
  "--allowedTools",
  [
    "Read",
    "Glob",
    "Grep",
    `Edit(./${workspaceLayoutName})`,
    `Write(./${workspaceLayoutName})`,
    "mcp__unibrain",
  ].join(" "),
  // Anything not allowed above is refused instead of waiting for approval.
  "--permission-mode",
  "dontAsk",
  "--strict-mcp-config",
  "--mcp-config",
  JSON.stringify({ mcpServers: { unibrain: { type: "http", url: s.unibrainUrl } } }),
  "--disable-slash-commands",
  "--append-system-prompt",
  instructions(s),
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

Fix ${workspaceLayoutName}, then end your turn.`;

export const conflictPrompt =
  `[app] ${workspaceLayoutName} was NOT applied: the live layout changed while you were working (the
user probably edited it by hand). ${workspaceLayoutName} now holds the current live layout. Redo
your changes on top of it, then end your turn.`;
