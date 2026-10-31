# Vision

This repo contains source code for _my personal home page_.

## What Is My Personal Home Page?

It's a web portal that's lives in a browser tab that I always keep open and pinned. The initial
requirements for this portal are defined below.

## Requirements

### App Layout

Viewport space is occupied by columns. By default, no columns are defined, in which case an option
is displayed to add the first column. Otherwise, each column occupies 25% of available viewport
width, and stack horizontally from left to right. If columns don't fill available width, empty space
is displayed, with an option to add another column. If more than 4 columns exist, only 4 are
displayed at once, with floating icon buttons appearing at the top left and right to slide columns
left and right, so columns animate into and out of view. Columns are internally vertically
scrollable when their contents exceed available vertical space, but their headings remain sticky.
Scrolling within one column doesn't affect other columns.

### Column Internal Layout

Each column has a top-level heading. Below that, widgets (described below) are laid out in a
vertical column, stacking vertically from top to bottom. Widgets cannot be laid out side-by-side
within a single column. If no widgets exist in a column, an option is displayed to add one. If
widgets don't occupy the full visible, vertical height of the column, an option is displayed to
append one. This can be accomplished simply by rendering the control at the end of the widget list,
and allowing it to be pushed out of view if the list exceeds the available vertical height. If the
widget list exceeds available vertical height, the column becomes automatically vertical scrollable.
Columns are never horizontally scrollable. Content in excess of available horizontal width is simply
not visible.

### Widgets

Columns are populated by _widgets_. Every widget has a customizable subheading describing its
contents. Clicking it expands/collapses the widget body. Widget types include:

- **Bookmarks** — An unordered list of bookmarks. The list can be nested at most two levels deep.
  Only leaf nodes can be hyperlinks. Branch nodes serve to expand/collapse the sublist.
- **Copyable Snippets** — Collections of copy/pastable text snippets, often consisting of shell
  commands or special unicode characters, hence rendered in preformatted, monospaced font. Each
  snippet has its own label. Snippets have two forms: whole-text copyable, or single-character
  copyable. Clicking anywhere in a whole-text copyable snippet copies the whole snippet of text.
  Clicking on a single-character copyable snippet copies just the character that was clicked.
- **Form Grids** — One or more form fields laid out in a grid. Each field is a separate, simple
  form. The only visible form control is the one field. The field is single-line; it doesn't support
  wrapping. Typing and pressing enter in the field activates the form. The field's value is inlined
  into a URL template, and the resulting URL is opened in a new tab.

Other widget types may be added in the future.

### Customizability

Columns can be created, edited, deleted, shown and hidden, and re-ordered. New columns can be
prepended, appended, or inserted anywhere in between. Column headings can be customized. Widgets
within a column can also be prepended, appended, or inserted anywhere in between.

The app has an _admin mode_ in which the controls for these operatios are visible. These operations
are _only_ available in admin mode, with the two exceptions already described above:

1. There aren't enough columns to fill available horizontal space.
2. There aren't enough widgets to fill available vertical space within a column.

Admin mode is toggled on and off by hitting ESC twice in rapid succession.

## Architecture

The project uses Deno running an always-on webserver. The webserver is only accessible on localhost
— other devices on the same network cannot see it. It serves a SPA written in TypeScript and React.
The OS the webserver runs on doesn't always matter, but where it does, assume MacOS. When the
machine boots, a launch script starts the webserver and monitors it in order to keep it up and
running, so that it's always available. The app is served over HTTPS, which apart from security,
ensures it can leverage modern HTTP 2+ features like multiplexing many network calls over a single
connection. I'm open to suggestions on how to set this up, but I suspect a cert authority will need
to be created and registered on this machine, and a certificate will need to be created and signed
by that CA, and used by the webserver so it can serve HTTPS. Any secret keys created during this
process would then need to be stored in a gitignored folder under this repo. Let me know if there's
an easier and/or more secure way to set this up. The UI uses the
[Chakra library](https://chakra-ui.com/).

### Paths

- `/web/app` — Serves the SPA.
- `/web/assets/*` — All associated `.js`, `.css`, (etc.) assets live here.
- `/api/*` — Any data-serving endpoints live under this namespace.

## Coding Standards

### Language

All components of the app MUST be written in TypeScript with `strict` enabled.

### Repo Layout

```
$REPO_ROOT
|--bin/ — Executable scripts
|--tooling/ — TypeScript source code supporting builds
`--src/ — TypeScript source code supporting the app
   |--client/ — strictly limited to code targeting the browser
   |--common/ — code shared between client and server, MUST be runtime-agnostic
   `--server/ - strictly limited to code targeting the server
```

Compilation does NOT emit `.js` files into `lib/` or similar. Instead, the webserver runs TypeScript
directly via Deno. All unit tests live as **siblings** to the modules they test. Modules and their
tests have the naming format `{module}.{extension}` and `{module}.test.{extension}`. Modules must
never be named "index"; choose a descriptive name.

### The Functional Core Pattern

Software components should be written in a purely functional style whenever possible. Otherwise, use
the [Functional Core pattern](./FUNCTIONAL_CORE.md).

### Error Handling

NEVER use try/catch (or their Promise API analogs) for error control flow. If system- or
library-level APIs throw or reject as part of their normal functioning, wrap those calls in
[Effect](https://effect.website/) and use Effect's error flow semantics in your main program.

A subset of errors are _not_ expected as part of a program's normal functioning, and are thus truly
exceptional. These _true exceptions_ should NOT be caught, but rather be allowed to propagate to a
higher level handler, for example:

- To the HTTP server framework, where they'll cause a 500 error.
- To the Deno runtime, where they'll crash the program.
- To React, where they'll either blank the screen or trigger an error boundary.

This philosophy borrows from concepts in Rust and Go.

### When to Use The Effect Library

Two conditions trigger use of the [Effect library](https://effect.website/)

1. You've switched into _functional core_ mode, as referenced above.
1. Your software component handles errors, as referenced above.

In general, this should be considered an _Effect Application_.

### Other Notes

#### Use Discriminated Unions

For maximum type clarity and safety, use discriminated unions early and often. When writing
discriminated unions, prefer discriminants named `is` over longer ones named `type` or `kind`. This
allows code to read both briefly and naturally:

```ts
if (status.is === "in-progress") {
  log(`${status.percentage}% complete`);
  continue;
}
```

For even greater clarity, use boolean discriminants when possible:

```ts
if (result.ok) {
  return result.value;
} else {
  log(result.errorMessage);
}
```

#### Assert Exhaustivity When Possible

When processing over a known union, assert exhaustivity using the `satisfies` keyword.

```ts
switch (status.is) {
  case "in-progress":
    log(`${status.percentage}% complete`);
  case "not-started":
    await wait(1000);
  case "failed":
    log(`operation failed`);
    return;
  case "success":
    log(`operation succeeded`);
    return;
  default:
    return status satisfies never;
}
```

#### TypeScript's Optionality Operator

```ts
interface Person {
  id: string;
  name: string;
  tagline?: string; // <-- optional
}
```

NEVER use TypeScript's optionality operator (`?`) as a synonym for possibly-undefined. While it does
carry that meaning, it has other implications that can negatively affect the codebase, if not used
carefully.

Namely, it means the field isn't type-checked for _presence_ at the callsite, tacitly allowing you
to forget it, which may not be what you intend. For example, you have a possibly-undefined variable
which you intended to supply to the optional field. But you forgot, and TypeScript allowed it.
That's a real software bug, because the field is now _always_ undefined, even if a value was
available.

Only use the optionality operator when an API has multiple use cases, some of which truly treat the
field as optional. Even then, be careful. Consider alternatives like discriminated unions.

#### Avoid Random Access Via Bracket Accessors

JavaScript allows properties on a `Record<string, T>` (or similar) to be accessed via bracket
notation:

```ts
const value = myRecord[key];
```

Similarly, it allows array elements to be accessed via brackets:

```ts
const value = myArray[index];
```

In random-access scenarios — that is, outside the context of iteration over the access key (`key` or
`index`) — some type-unsafety leaks in, since TypeScript masks the potential for `value` to be
undefined.

For arrays, the solution is simple: use `.at(index)` instead.

```ts
const value = myArray.at(index); // T | undefined
```

For `Record<string, T>` (or similar) the picture isn't as simple. You have a few options, in order
of most to least-preferred:

1. Use `Map<string, T>` instead
2. Annotate the accessed value at the access point — techniques vary
3. Use `Record<string, T | undefined>` instead

#### Code Should be Routinely Compiled, Formatted, Linted, and Unit Tested

Compile, lint, and test should happen during a routine build. Unit test coverage benchmark is _90%
minimum_ across all stats. Auto-formatting should be available as a Deno task. Linting should (if
possible) fail if the code requires auto-formatting changes.

#### NEVER Break Isolation in Functional Core Unit Tests

Isolation breakage consists of unit tests needing to use setup/teardown hooks
(`before`/`beforeEach`, etc.), mock imports or classes, modify the environment, or otherwise monkey
patch the runtime.

If you find yourself using these techniques, it means one of:

1. You're testing the imperative shell. If you're using functional core / imperative shell
   correctly, the quantity of these kinds of tests should be vanishingly small. For example, if we
   have a goal of 90% test coverage, imperative shell code has the worst cost-benefit tradeoff, and
   is thus the last thing we care about covering; leaving us well within our 10% coverage cushion.
2. You're testing code that should be migrated to the functional core / imperative shell pattern.
   Consider this your signal for migration.
3. You're reaching for a testing technique that isn't really necessary. Consider an alternative.

Otherwise, it should be possible to test functional core modules without breaking isolation.

_Caveat: Occasionally, we may want to write a strategic unit test for the imperative shell, which
necessarily requires monkey-patching imports, etc. This is fine._
