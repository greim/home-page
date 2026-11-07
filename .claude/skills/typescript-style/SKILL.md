---
name: typescript-style
description: TypeScript conventions for this repo — discriminated unions with `is`/`ok` discriminants, `satisfies never` exhaustivity, no `?` optional fields as "maybe undefined", `.at()` instead of bracket access. Use when writing or reviewing any TypeScript here.
---

# TypeScript style

All code is TypeScript with `strict` enabled (plus `noUncheckedIndexedAccess` and
`exactOptionalPropertyTypes`; see `deno.json`).

## Use discriminated unions, discriminated by `is`

Use discriminated unions early and often. Name the discriminant `is`, not `type` or `kind`, so code
reads briefly and naturally:

```ts
type Status =
  | { is: "not-started" }
  | { is: "in-progress"; percentage: number }
  | { is: "failed" }
  | { is: "success" };

if (status.is === "in-progress") {
  log(`${status.percentage}% complete`);
}
```

Prefer a boolean discriminant when there are two cases:

```ts
type Result<T> = { ok: true; value: T } | { ok: false; errorMessage: string };

if (result.ok) {
  return result.value;
} else {
  log(result.errorMessage);
}
```

## Assert exhaustivity with `satisfies never`

When handling a known union, make the compiler prove every case is covered:

```ts
switch (status.is) {
  case "not-started":
    return "waiting";
  case "in-progress":
    return `${status.percentage}% complete`;
  case "failed":
    return "operation failed";
  case "success":
    return "operation succeeded";
  default:
    return status satisfies never;
}
```

Adding a case to `Status` then fails to compile here until it's handled.

## Don't use `?` to mean "possibly undefined"

```ts
interface Person {
  tagline?: string; // avoid
}
```

An optional field isn't checked for _presence_ at the call site, so you can silently forget to pass
a value you had. That's a real bug: the field is then always undefined. Write
`tagline: string | undefined` instead, so every constructor must supply it.

Use `?` only when an API genuinely has several use cases, some of which truly omit the field. Even
then, consider a discriminated union instead.

Exceptions:

- **Third-party APIs** (e.g. Chakra props) declare their own optional fields. Supply them as the
  library expects; the rule governs types _we_ declare.
- **Persisted data gaining a field.** Old data won't have it, which tempts you to make it optional.
  Instead, keep it required in the decoded type and default it at the decoding boundary, e.g.
  `Schema.optionalWith(X, { default: () => … })`. Readers never see `undefined`, and every
  constructor is still checked.

## Avoid random access through brackets

Outside iteration over the key or index, bracket access hides that the value may be missing.

- **Arrays:** use `.at(index)`, which returns `T | undefined`.
  - Careful: `.at()` counts **negative indexes from the end**. `items.at(i - 1)` returns the _last_
    item when `i` is `0`. Guard the lower bound whenever an index can go negative:
    `i === 0 ? undefined : items.at(i - 1)`.
- **Records**, in order of preference:
  1. use a `Map<string, T>` instead,
  2. annotate the accessed value at the access point, or
  3. type it `Record<string, T | undefined>`.
