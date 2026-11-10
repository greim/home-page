---
name: widget-apis
description: Widget APIs — typed services the page gives widgets (agent-runs today; geocoding, feeds and the like next), each defined once in src/common/apis/ with Effect Schemas and served by one of the app's servers, so widgets call typed methods that never reject instead of fetch()ing the app's own routes. Use when a widget needs the app's server (to reach a service that doesn't allow cross-origin requests, or do anything only the server can), when adding or changing an API, or when touching src/common/widget-apis.ts, src/server/widget-api-routes.ts, src/client/widget-api-client.ts or the kit's useWidgetApi.
---

# Widget APIs

A **widget API** is a service the page gives widgets: an object with one method per operation,
taking and returning typed data, failing with typed errors as data. A widget never calls `fetch` on
the app's own server, and never sees a status code:

```tsx
import { geocodeApi } from "../../../common/apis/geocode.ts";
import { useWidgetApi } from "../../widget-kit/apis.tsx";

const geocode = useWidgetApi(geocodeApi);
const found = await geocode.findPlace({ query: "Main St & 4th Ave, Springfield IL" });
if (found.ok) {
  show(found.value); // typed by the API's output schema
} else {
  say(found.error.message); // found.error.is: the API's own errors, or the shared ones
}
```

Each API is:

- **Defined once**, in `src/common/apis/<name>.ts`: its operations' input, output and error schemas,
  which server runs it, and the outside services it reaches.
- **Served** by one of the app's servers, through the generic dispatcher
  (`src/server/widget-api-routes.ts`), with handlers that do the work.
- **Called** through the page's generic client (`src/client/widget-api-client.ts`), which the page
  builds for each widget and passes to its views; the kit puts it in React context for
  `useWidgetApi`.

The page builds the client, so it says which widget is calling (its type and ID), not the widget. A
handler that cares (agent runs do: a widget runs only its own agents, and reaches only its own runs)
takes the `caller` it's given, never something in the input.

**What it isn't: a sandbox.** Widgets are same-origin code in the page and could `fetch` the routes
themselves. APIs make the right way the easy way, give the server one place to check who's calling,
and keep every widget's types in step with the server's. Consent is still enforced as before: the
page doesn't mount a widget's views until the user agrees to its outside services.

## The APIs there are

| API          | Server    | What it does                                                    |
| ------------ | --------- | --------------------------------------------------------------- |
| `agent-runs` | assistant | Runs the widget's own AI agents (see the `widget-agents` skill) |
| `layout`     | main      | Reads the page's layout, and applies a new one (see below)      |

`src/common/apis/all.ts` lists them.

The `layout` API is for a widget that changes the page for the user (the page configurator): `get`
gives the live layout, and `apply({ base, layout })` replaces it if the live one is still `base`,
failing with `layout-changed` otherwise (the user edited the page meanwhile). It checks the layout's
shape, as the page's own saves do, not each widget's config. The page hears about each layout
applied through it (`src/client/layout-applied.ts`) and shows it at once, so its own saves carry on
from it. It's powerful: a widget that declares it can rewrite the whole page, so let the user see
and confirm a change before applying it. A widget with `agents` gets `agent-runs` without declaring
it; the kit's `useAgentRun` and `useWidgetAgent` are built on it.

## Using one in a widget

1. **Declare it** in the manifest, and list each outside service it reaches under `permissions` (the
   build fails otherwise, and the consent form shows them):

   ```ts
   apis: ["geocode"],
   permissions: { services: [censusGeocoder] }, // each `services` name of the API, exactly
   ```

2. **Use it** in the `widget` or `full-screen` view, with `useWidgetApi(theApi)`. The `editor` view
   gets no APIs: it loads before the user consents, so it must never call a service. Calling
   `useWidgetApi` there, or for an API the manifest doesn't declare, throws, and the message saying
   what's wrong is shown in the view's place.

3. **Handle every result.** Calls resolve to `{ ok: true, value }` or `{ ok: false, error }`; they
   never reject. `error.is` is one of the API's own errors (each with a `message` fit to show), or
   one every API shares:

   | `is`          | Means                                                                       |
   | ------------- | --------------------------------------------------------------------------- |
   | `bad-input`   | The input didn't fit the operation's schema (a bug in the widget)           |
   | `unreachable` | The server couldn't be reached, or the connection was lost                  |
   | `failed`      | The server, or a service behind it, failed; `message` says why              |
   | `bad-answer`  | The answer didn't fit the schema (a bug, or a widget built before a change) |
   | `aborted`     | The caller's `signal` fired, or it stopped reading a stream                 |

   Every method takes an optional `{ signal }` last: abort it when the view unmounts or the user
   starts over.

### The three kinds of operation

- **`operation`** (a call): `await api.op(input, { signal })` → `ApiResult<Output, Error>`.
- **`stream`**: `api.op(input, { signal })` gives `{ items, result }` at once. `items` is an
  `AsyncIterable` of decoded items; it never throws, just ends. `result` says how it ended:

  ```ts
  const { items, result } = runs.events({ runId, after });
  for await (const logged of items) setView((v) => nextView(v, logged, Output));
  const ended = await result; // read `items` first!
  ```

  It's pulled: the request is read only as fast as `items` is, so `result` settles once `items` is
  read to the end, ends early (a lost connection, a line that doesn't fit), or is broken out of
  (`aborted`; breaking out also cancels the request). The `signal` is the exception: it settles
  `result` at once, read or not. So awaiting `result` before reading `items` waits until the signal
  fires, or forever. Resuming after a drop is the API's business (agent runs take `after`).

- **`link`**: `api.op(input)` returns a URL, synchronously, for the browser to load itself: an
  `<a href download>`, an `<img src>`. It's empty if the input doesn't fit.

### Testing a widget that uses one

Keep the logic in plain modules, tested on their own, as usual. To render a component that uses an
API, wrap it in `WidgetApisProvider` (from `widget-kit/apis.tsx`) with a fake client: an object with
the same methods, returning results. No `fetch` to stub.

## Adding an API

Each API is part of the contract between the page and every widget (the `micro-frontends` skill's
"the contract is the hard part"). So:

- **Adding or changing an API is its own task, with the developer's go-ahead.** A widget task that
  finds it needs one stops and asks, then follows this recipe as a separate step.
- **An API is for something several widgets need, or only the server can do**: reach a service that
  doesn't allow cross-origin requests, keep an app-wide rate limit or cache, know who's calling. One
  widget's private need stays in the widget.
- **Changes are additive**: a new operation, or a new optional input field. Removing or changing one
  means changing every widget that uses it, in the same commit. The page and widgets are built from
  one repo, so there's no versioning to do.

### The recipe

Worked example: geocoding, served by the main server, reaching the US Census.

1. **Define it**, in `src/common/apis/geocode.ts`. Shared schemas and parsing the server needs can
   live beside it, in `src/common/`.

   ```ts
   import { Schema } from "effect";
   import { apiError, defineApi, operation } from "../widget-apis.ts";

   export const NoMatch = apiError("no-match"); // { is: "no-match", message }

   export const geocodeApi = defineApi("geocode", "main", {
     findPlace: operation({
       input: Schema.Struct({ query: Schema.NonEmptyTrimmedString }),
       output: Place,
       errors: NoMatch, // several: Schema.Union(NoMatch, TooMany)
     }),
     findAddresses: operation({
       input: Schema.Struct({ addresses: Schema.Array(AddressQuery).pipe(Schema.maxItems(1000)) }),
       output: Schema.Struct({ results: Schema.Array(Schema.NullOr(Coordinates)) }),
       errors: TooMany, // every operation names at least one: `Schema.Never` doesn't type-check
       maxBytes: 500_000, // the most a request may be; 200,000 if left out
     }),
   }, { services: ["US Census Geocoder"] }); // must match manifests' `permissions` names
   ```

   - The name: lowercase letters, digits and single hyphens. The server: `"main"` (the page's own)
     or `"assistant"` (the assistant service; only for what needs Claude Code).
   - `services`: every outside service it sends data to, by the name widgets list under
     `permissions`. Empty for an API that sends nothing off the machine.
   - Describe each operation, its input and its errors with comments, or `description` annotations:
     they're what a widget's author reads.

2. **List it** in `allApis`, in `src/common/apis/all.ts`.

3. **Serve it.** Write `src/server/<name>-api.ts`: one handler per operation, given the decoded
   input and the `caller`, returning an Effect of a result. Do I/O through the server's pipes (for
   the main server, `ServerIo` in `http.ts`: add the outside call there, as a pipe), keep decisions
   pure, per the `functional-core` skill:

   ```ts
   export const geocodeServed = serve<typeof geocodeApi, ServerIo>(geocodeApi, {
     findPlace: ({ query }) =>
       Effect.gen(function* () {
         const io = yield* ServerIo;
         const found = parseCensus(yield* io.geocodeOneLine(query).pipe(
           Effect.mapError((e) => new HandlerFailed({ message: `The geocoder failed: ${e.cause}` })),
         ));
         return found === null
           ? { ok: false, error: { is: "no-match", message: "No match for that place." } } as const
           : { ok: true, value: found } as const;
       }),
     findAddresses: ...,
   });
   ```

   - Name what the handlers need in `serve<typeof api, R>(...)`: it isn't inferred.
   - A handler returns the API's own errors as results. When something it needs fails, it fails with
     `HandlerFailed` (the widget gets `failed`, with the message).
   - A stream handler returns `{ ok: true, value: aStream }` (an Effect `Stream` of items); a link
     handler returns an `HttpResponse` (a download, say).
   - Throttle and cache here when it's per app (an outside service's rate limit): the server sees
     every widget and every tab.

   Then add it to its server's list: `widgetApis` in `src/server/routes.ts` for the main server, or
   the list in `src/server/assistant-routes.ts`.

4. **Test it**: the handlers' logic in plain tests, and the API end to end like
   `src/client/widget-api-client.test.ts` does, with the page's client calling the dispatcher.

5. **Rebuild and restart**: `deno task build`, then restart the server that serves it:
   `deno task restart-service app` (the main server) or `deno task restart-service assistant` (no
   name restarts both).

The dispatcher already handles routing, decoding, size limits, encoding, NDJSON and errors; an API
never adds routes of its own.

## How it's built

- `src/common/widget-apis.ts`: `defineApi`, `operation`, `stream`, `link`, `ApiResult`, `ApiClient`
  (the type widgets see), the wire format, and reading answers.
- `src/server/widget-api-routes.ts`: `serve`, `HandlerFailed`, and `handleWidgetApis`, the
  dispatcher each server mounts under `/api/widget-apis/<api>/<operation>`.
- `src/client/widget-api-client.ts`: `makeApiClient`, the generic client; `apiBase`, each server's
  base URL.
- `src/client/widget-apis-live.ts`: `useWidgetApis`, building a widget's clients from its registry
  entry's `apis`.
- `src/client/widget-kit/apis.tsx`: `useWidgetApi`, `WidgetApisProvider`. `widgetView` and
  `fullScreenView` provide the clients the page passes as the `apis` prop.
- `tooling/widget-build.ts`: `apiNames` checks a manifest's `apis` and writes the registry's.

On the wire: a call is `POST` `{ caller, input }`, answered `{ ok, value }` or `{ ok, error }` (a
status other than 200 is `failed`); a stream is the same `POST`, answered with NDJSON `{ item }`
lines and a last `{ end }` line; a link is `GET` with `caller` and `input` as JSON in the query.
