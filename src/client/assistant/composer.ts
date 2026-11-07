/**
 * Decisions behind the assistant's composer: which slash commands match what's
 * being typed, and which pasted or dropped files can go to Claude as images.
 */
import { type Command, ImageType, maxImageBytes } from "../../common/assistant.ts";
import { Schema } from "effect";

/** Most commands offered at once. */
export const maxSuggestions = 8;

/**
 * The commands to offer while the draft is a slash and the start of a command's name
 * (e.g. "/com"): those whose name starts so first, then those containing it.
 */
export const matchingCommands = (
  draft: string,
  commands: ReadonlyArray<Command>,
): ReadonlyArray<Command> => {
  const typed = /^\/(\S*)$/.exec(draft)?.[1];
  if (typed === undefined) return [];
  const query = typed.toLowerCase();
  const name = (c: Command) => c.name.toLowerCase();
  return [
    ...commands.filter((c) => name(c).startsWith(query)),
    ...commands.filter((c) => !name(c).startsWith(query) && name(c).includes(query)),
  ].slice(0, maxSuggestions);
};

/** The draft with the command filled in, ready for its arguments. */
export const withCommand = (command: Command): string => `/${command.name} `;

const isImageType = Schema.is(ImageType);

/** Why a file can't be attached, or null if it can. */
export const attachProblem = (
  file: { type: string; size: number; name: string },
): string | null => {
  if (!isImageType(file.type)) {
    return `${file.name || "That file"} isn't a PNG, JPEG, GIF or WebP image.`;
  }
  if (file.size > maxImageBytes) {
    return `${file.name || "That image"} is over ${maxImageBytes / 1024 / 1024} MB.`;
  }
  return null;
};
