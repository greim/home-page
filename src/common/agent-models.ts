/**
 * The Claude models a widget's agent may be let run under, when its manifest opts in
 * by listing some under the agent's `models`. This is the catalog the editor's model
 * picker draws its labels from, and the outer bound on what a manifest may offer: the
 * server only ever runs a model a widget's agent declared, and a manifest may only
 * declare models from here. Leaving an agent's `models` empty (the default) means its
 * model is fixed, and a run may not choose one.
 */

/** One selectable model: the provider's ID, and how it's shown in the picker. */
export type SelectableModel = {
  /** The model ID, as the Agent SDK takes it, e.g. "claude-sonnet-5-5". */
  readonly id: string;
  /** How it reads in the picker, e.g. "Sonnet 5.5 — balanced". */
  readonly label: string;
};

/** Every model a manifest may offer, newest and most capable first. */
export const selectableModels: ReadonlyArray<SelectableModel> = [
  { id: "claude-opus-5-5", label: "Opus 5.5 — most capable" },
  { id: "claude-sonnet-5-5", label: "Sonnet 5.5 — balanced" },
  { id: "claude-haiku-5-5", label: "Haiku 5.5 — fastest" },
];

/** The IDs of every selectable model. */
export const selectableModelIds: ReadonlyArray<string> = selectableModels.map((m) => m.id);

/** Whether `id` is a model the app lets agents run under. */
export const isSelectableModel = (id: string): boolean => selectableModelIds.includes(id);

/** How a model ID reads in the picker, or the ID itself if it isn't a known one. */
export const modelLabel = (id: string): string =>
  selectableModels.find((m) => m.id === id)?.label ?? id;
