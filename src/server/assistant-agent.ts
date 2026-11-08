/**
 * How the assistant's agent is set up: Claude Code through the Agent SDK,
 * working in the repo with the developer's own settings, skills and tools, plus
 * a prompt about the page it's built into.
 */
import type { PermissionMode } from "../common/assistant.ts";
import type { Registry } from "../common/widgets.ts";

export type AgentSettings = {
  /** The repo: the agent's working directory, as when Claude Code runs in a terminal there. */
  readonly repoDir: string;
  /** Holds the agent's copy of the layout and the page's screenshot. */
  readonly workspaceDir: string;
};

/** The file in the workspace the agent edits; applied when its turn ends. */
export const workspaceLayoutName = "layout.json";

/** A screenshot of the page, taken as the user sent their message, for the agent to look at. */
export const workspaceScreenshotName = "screenshot.jpg";

/** Starts the app's own messages to the agent (e.g. that its layout was rejected). */
export const appMessagePrefix = "[app] ";

/** Starts each note the app puts before a user's message (e.g. that there's a screenshot). */
export const appNotePrefix = "[app note] ";

/** Most times a turn re-prompts the agent after its layout is rejected. */
export const maxRetries = 2;

/** A path inside the repo relative to it, else as is. */
const inRepo = (s: AgentSettings, path: string): string => {
  const root = s.repoDir.endsWith("/") ? s.repoDir : `${s.repoDir}/`;
  return path.startsWith(root) ? path.slice(root.length) : path;
};

/** The workspace layout, as the agent should refer to it (relative to the repo). */
export const workspaceLayoutPath = (s: AgentSettings): string =>
  `${inRepo(s, s.workspaceDir).replace(/\/$/, "")}/${workspaceLayoutName}`;

const workspaceScreenshotPath = (s: AgentSettings): string =>
  `${inRepo(s, s.workspaceDir).replace(/\/$/, "")}/${workspaceScreenshotName}`;

/** Every widget type, as the agent's prompt lists it. */
export const describeRegistry = (registry: Registry | null): string =>
  registry === null
    ? "(The registry couldn't be read; the widget build may have failed. Look in the widget folders.)"
    : registry.widgets.map((w) =>
      `- "${w.id}": ${w.title}. ${w.description}
  Config JSON Schema: ${JSON.stringify(w.configSchema)}
  A new widget's config: ${JSON.stringify(w.defaultConfig)}`
    ).join("\n");

/** Appended to Claude Code's own system prompt: what the agent needs to know about the page. */
export const instructions = (s: AgentSettings, registry: Registry | null): string =>
  `You are also the assistant built into the user's personal home page, a web portal of columns
holding widgets, served from this repo. The user is the repo's developer, chatting with you from the
page. Treat requests exactly as you would in a terminal session in this repo: you can change any
code, run commands, and commit when asked, subject to the user's own permission settings.

Besides that, you configure the page on the user's behalf: anything they could do in admin mode,
such as adding, editing, moving, hiding or removing columns (with their headings, icons and colors),
and adding or editing widgets. You can also set when the user's day starts and ends (the layout's
"schedule"), which switches the page between day and night and drives widgets that track the
working day. Apart from column colors, the page's look is fixed. Column colors are
{ "c": chroma, "h": hue in degrees } in OKLCH, at a lightness every column shares (see
src/common/column-color.ts); text on them is always white. Muted colors suit the page: its presets
have a chroma around 0.01 to 0.025. Each hue reaches a different maximum chroma in sRGB, from about
0.1 to 0.3, and more than that just clips.

Changing the page's layout
- ${workspaceLayoutPath(s)} is a copy of the live layout (data/layout.json), refreshed at the start
  of every user message. To change the page, edit that copy; never edit data/layout.json directly.
  The layout's schema is in src/common/model.ts.
- When you end your turn, the app validates the copy (its shape, and each widget's config against
  its type's manifest). If it passes, it's applied to the page immediately and the user sees it.
  If it fails, or the live layout changed while you worked, you get a message starting with "[app]"
  explaining why, and nothing was applied: fix the problem and end your turn again. If no "[app]"
  message follows, it was applied.
- Seeing the page: when the user's message starts with an "[app note]" saying so,
  ${workspaceScreenshotPath(s)} is a screenshot of the page as they saw it when they sent it.
  Read it whenever how the page looks matters, such as choosing column colors or when the user
  refers to something on screen. It isn't retaken during your turn.

Widgets
- A widget's "is" in the layout names its type, a folder in src/client/widgets/. Its "config" is
  that type's own settings, which must fit the type's config schema. These are the widget types:
${describeRegistry(registry)}
- When no widget type does what the user wants, write a new one, or change an existing type's code.
  The create-widget skill has the steps and templates. A widget runs in the browser, so it can only
  call APIs that allow cross-origin requests.
- After changing widget code, run \`deno task build\` (it checks, lints, tests and builds the
  widgets). The page loads the built widgets.

Putting code changes into effect
- When your turn ends, the app compares the repo with how it was when the turn began. If you
  changed code the main server or the page loads, it restarts the main server; if you changed the
  page's code or a widget's, it offers the user a reload; if you changed this assistant service's
  own code, it restarts the service (the conversation carries on). Don't restart the services
  yourself, and don't tell the user to: the app does it, and says so in the chat.

Talking to the user
- Keep replies short and plain: the chat shows plain text, not Markdown. Describe what changed on
  their page rather than file names or JSON, unless they ask.
- New ids must be unique; random UUIDs are fine.`;

/** The SDK options for a session, apart from the permission callback. */
export const sessionOptions = (
  s: AgentSettings,
  resume: string | null,
  registry: Registry | null,
  mode: PermissionMode = "default",
) => ({
  cwd: s.repoDir,
  ...(resume === null ? {} : { resume }),
  // The developer's own settings, skills, hooks and MCP servers, as in a terminal.
  settingSources: ["user" as const, "project" as const, "local" as const],
  systemPrompt: {
    type: "preset" as const,
    preset: "claude_code" as const,
    append: instructions(s, registry),
  },
  // Text as the agent writes it, not only once it's done.
  includePartialMessages: true,
  // Every session starts in default mode, resumed ones too (the SDK may otherwise restore
  // their last mode), unless the user chose a mode before its first message.
  permissionMode: mode,
  // Its own copy of the layout is validated before it's applied, so editing it needn't be asked.
  allowedTools: [`Edit(./${workspaceLayoutPath(s)})`],
});

export const userPrompt = (
  message: string,
  context: { readonly resumed: boolean; readonly screenshot: boolean },
  s: AgentSettings,
): string => {
  const notes = [
    ...(context.resumed
      ? [`${appNotePrefix}${workspaceLayoutPath(s)} was refreshed from the live page.`]
      : []),
    ...(context.screenshot
      ? [
        `${appNotePrefix}${workspaceScreenshotPath(s)} shows the page as the user saw it just now.`,
      ]
      : []),
  ];
  return notes.length === 0 ? message : `${notes.join("\n")}\n\n${message}`;
};

export const invalidLayoutPrompt = (s: AgentSettings, diagnostic: string): string =>
  `${appMessagePrefix}${workspaceLayoutPath(s)} was NOT applied: it failed validation.

${diagnostic}

Fix it (or the widget code, if that's what's wrong), then end your turn.`;

export const conflictPrompt = (s: AgentSettings): string =>
  `${appMessagePrefix}${
    workspaceLayoutPath(s)
  } was NOT applied: the live layout changed while you were working
(the user probably edited it by hand). It now holds the current live layout. Redo your changes on
top of it, then end your turn.`;
