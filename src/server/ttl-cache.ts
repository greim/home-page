/**
 * A small in-memory cache of async answers by key, each kept for `ttlMs` once it
 * arrives. Callers asking for a key already being loaded share that load; a load
 * that fails isn't kept. It holds at most `maxEntries`, dropping the oldest first.
 */
export const ttlCache = <A>(
  ttlMs: number,
  maxEntries: number,
  now: () => number = Date.now,
) => {
  const entries = new Map<string, { readonly expires: number; readonly value: Promise<A> }>();
  return (key: string, load: () => Promise<A>): Promise<A> => {
    const time = now();
    for (const [k, entry] of entries) if (entry.expires <= time) entries.delete(k);
    const kept = entries.get(key);
    if (kept !== undefined) return kept.value;
    const value = load();
    // Infinity while loading, so callers share it however long it takes.
    entries.set(key, { expires: Infinity, value });
    value.then(
      () => {
        if (entries.get(key)?.value === value) entries.set(key, { expires: now() + ttlMs, value });
      },
      () => {
        if (entries.get(key)?.value === value) entries.delete(key);
      },
    );
    while (entries.size > maxEntries) {
      const oldest = entries.keys().next();
      if (oldest.done === true) break;
      entries.delete(oldest.value);
    }
    return value;
  };
};
