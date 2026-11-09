---
name: create-widget
description: Step-by-step recipe, with templates, for adding a new widget type to the home page (src/client/widgets/<id>/) or changing an existing one's settings. Use when asked for a widget that doesn't exist yet, or to add settings or features to a widget.
---

# Creating a widget

A widget type is a folder, `src/client/widgets/<id>/`, built into its own bundle and loaded by the
page on demand. The `micro-frontends` skill explains how that works. This skill is the recipe.

## Steps

1. **Choose an ID**: lowercase letters, digits and single hyphens (`stock-ticker`). It names the
   folder, the `registerMfe` call, and `is` in the layout. Renaming it later breaks every layout
   that uses it.
2. **Write `config.ts`**: the settings the user edits, as an Effect Schema (template below).
3. **Write `manifest.ts`**: title, description, config schema, default config. If it sends the
   user's data to any outside service (an API, a map's tile server), declare each one under
   `permissions` (see "Sending data to outside services" in the `code-vs-data` skill). The page asks
   the user about them before the widget runs; don't build a consent screen of your own. If it uses
   AI (Claude) for part of its work, give it an agent: see the `widget-agents` skill.
4. **Put the logic in plain modules with tests** (`<name>.ts` and `<name>.test.ts`), per the
   `functional-core` and `testing` skills. Anything that branches (parsing, formatting, converting,
   deciding) belongs here, not in components. Shape the input as plain data (e.g. a tree, not a DOM
   `Node`) so tests need no browser.
5. **Write the view** in `<id>.tsx` (or similar): the component the column shows.
6. **Write `main.tsx`**: the editor, and the `registerMfe` call. If the widget needs more room than
   a column gives, add a `full-screen` view too (see "Full-screen views" in the `micro-frontends`
   skill).
7. **Run `deno task build`**: check, lint, test (90% coverage), then the widget build. Fix anything
   it reports. The widget build alone is `deno task build-widgets`.
8. **Add it to the layout.** Developers do it in admin mode (the column editor's "Add widget"). The
   assistant adds `{ "id": "<uuid>", "is": "<id>", "config": <default config> }` to a column in its
   layout copy.
9. **Reload the page** to load the new bundle. A bundle loads at most once per page.

## Templates

`config.ts`. Give every field a default with `Schema.optionalWith`, so a layout saved before a field
existed still decodes when you add one later:

```ts
/** The <name> widget's config: <what it holds>. */
import { Schema } from "effect";

export const ExampleConfig = Schema.Struct({
  /** Shown above the widget. None when blank. */
  heading: Schema.optionalWith(Schema.String, { default: () => "" }),
});
export type ExampleConfig = typeof ExampleConfig.Type;
```

`manifest.ts`. The assistant chooses and configures widgets from the registry, which is built from
this, so make the description say what the widget does and what its settings mean:

```ts
import { defineManifest } from "../../../common/widgets.ts";
import { ExampleConfig } from "./config.ts";

export const manifest = defineManifest({
  title: "Example",
  description: "What it shows or does, in a sentence or two.",
  config: ExampleConfig,
  defaultConfig: { heading: "Example" },
});
```

A widget that sends the user's data to an outside service also declares it, one entry per service:

```ts
permissions: {
  services: [{
    name: "US Census Geocoder",
    sends: "The street, city, state and zip of each address in your CSV (not the names)",
    privacyPolicy: "https://www.census.gov/about/policies/privacy.html",
    terms: "https://www.census.gov/data/developers/about/terms-of-service.html",
  }],
},
```

The view, in `example.tsx`:

```tsx
/** <What the widget shows.> */
import { chakra } from "@chakra-ui/react";
import { widgetHeading } from "../../surface.ts";
import type { WidgetProps } from "../../widget-kit/views.tsx";
import type { ExampleConfig } from "./config.ts";

export function Example({ config }: WidgetProps<ExampleConfig>) {
  const heading = config.heading.trim();
  return (
    <>
      {heading !== "" && <chakra.h3 {...widgetHeading}>{heading}</chakra.h3>}
      {/* ... */}
    </>
  );
}
```

`main.tsx`:

```tsx
/** The example widget: <one line>. */
import { Box, Input } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { registerMfe } from "../../mfe/register-live.tsx";
import { Label } from "../../widget-kit/form.tsx";
import { type EditorProps, editorView, widgetView } from "../../widget-kit/views.tsx";
import { ExampleConfig } from "./config.ts";
import { Example } from "./example.tsx";

function ExampleEditor({ config, reportDraft }: EditorProps<ExampleConfig>) {
  const [draft, setDraft] = useState(config);
  // Report on open too, even with nothing changed, or Save can't apply it.
  useEffect(() => reportDraft({ ok: true, config }), []);
  const change = (next: ExampleConfig) => {
    setDraft(next);
    reportDraft({ ok: true, config: next });
  };
  return (
    <Box>
      <Label>Heading</Label>
      <Input
        size="sm"
        value={draft.heading}
        placeholder="None"
        onChange={(e) => change({ ...draft, heading: e.target.value })}
      />
    </Box>
  );
}

registerMfe("example", () => ({
  widget: widgetView(ExampleConfig, Example),
  editor: editorView(ExampleConfig, ExampleEditor),
}));
```

For the simplest real widget, read `clock/`. For an editor with validation (reporting
`{ ok: false, errorMessage }`), read `form-grid/`. For a widget that saves its own state as the user
uses it, read `bookmarks/`.

## What a widget can use

- **Props** (`WidgetProps`): `config` (decoded), `saveConfig(config)` to save a change made on the
  page itself, `widgetId`, and `schedule` (when the user's day starts and ends, and their weekend;
  with `useNow` from the kit and `src/common/day-cycle.ts`, for anything time-of-day). And
  `openFullScreen()`, to open the widget's `full-screen` view from a click, if it has one.
- **Chakra UI** components, set up as the page has it.
- **Shared styles** in `src/client/surface.ts`: `widgetHeading` for headings, so they match other
  widgets; `codeBox` for monospace boxes; `hatching`.
- **Kit pieces** in `src/client/widget-kit/`: `TextBox` for a text box in the column (styled like
  `codeBox`) and `TextBoxButton` for the buttons under it, `Label` and `RowControls` for editors,
  `nudge` for reordering rows, `useNow`.
- **Common code** in `src/common/`. Never import other widgets' folders: copy what you need, or move
  it to `src/common/` or the kit.

## Where state goes

| What                                               | Where                                                               |
| -------------------------------------------------- | ------------------------------------------------------------------- |
| Settings the user edits in the column editor       | `config`, through the editor's `reportDraft`                        |
| State changed on the page that should be kept      | `config`, through `saveConfig` (e.g. a folder opened)               |
| Per-browser working state (drafts, pasted text)    | `localStorage`, under a key naming the widget and its `widgetId`    |
| Secrets: API keys, tokens                          | `localStorage` only, prompted for when missing (see `code-vs-data`) |
| Anything else that must persist, or uploaded files | Not supported yet: needs a server route under `data/`; ask first    |

The config is saved in `data/layout.json`, which the assistant reads. Never put secrets in it.

## Look

- Don't set the widget's text color, font or background: it inherits them from its column, whose
  text is white on a mid-lightness color. Use translucent blacks and whites for wells and dividers,
  like `codeBox`, so they suit every column color.
- To tint something to match the column, derive it from `var(--column-background)` (see the
  `micro-frontends` skill).
- Size in `rem` and `em`, never `px` except hairlines (`viewport-relative-design` skill).
- The page draws no heading or card. Draw your own heading with `widgetHeading`, from a `heading`
  config field (admin mode also names the widget by it).

## Limits

- It runs in the browser only. It can call APIs that allow cross-origin requests, and nothing else:
  there's no proxy for the rest yet.
- One bundle per widget. React, Chakra and Effect come from the page, shared by every widget, so
  import them only as `react`, `react/jsx-runtime`, `react-dom`, `react-dom/client`, `effect`,
  `@chakra-ui/react` and `@emotion/react`, never a subpath like `effect/Schema`: the build fails if
  a widget bundles its own copy (see "Shared packages" in the `micro-frontends` skill). Still don't
  pass Effect values to or from the page: messages stay plain values.
- Never open the app, or the widget, in a new tab or window (`window.open` to this server's URLs, a
  new route, a mode of the page that shows one widget). For more room, or a window of its own, give
  it a full-screen view. If the user asks for a new tab, offer that and say why. The reasons are
  under "Never open the app, or a widget, in another tab" in the `micro-frontends` skill. Links to
  other sites are fine.
- Don't change the framework from a widget: `contract.ts`, `protocol.ts`, the server's routes, the
  page's entry point. If the widget seems to need that, stop and ask.
- Add any npm package it needs to `deno.json`'s imports, pinned to an exact version like the rest.
- The build fails on any widget's errors, and the page keeps loading the last good build.
