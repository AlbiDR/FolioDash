import type { KeyValueStore } from "./LedgerCache";

export function createMemoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value); },
    removeItem: (key) => { data.delete(key); },
  };
}

/**
 * One store that survives as much as the browser allows. It writes to the first store that
 * accepts the value (for example localStorage, then sessionStorage, then memory) and reads
 * from the first that holds one, so a blocked or full store lowers how long a connection is
 * remembered instead of breaking it. A value moved to a later store is removed from the
 * earlier ones, so a stale copy is never read back in place of the newer one.
 */
export function createDurableStore(openers: readonly (() => KeyValueStore)[], fallback: KeyValueStore = createMemoryStore()): KeyValueStore {
  const stores = (): KeyValueStore[] => {
    const open: KeyValueStore[] = [];
    for (const opener of openers) {
      try {
        open.push(opener());
      } catch {
        // Storage can be blocked, and that is survivable.
      }
    }
    open.push(fallback);
    return open;
  };
  return {
    getItem(key) {
      for (const store of stores()) {
        try {
          const value = store.getItem(key);
          if (value !== null) return value;
        } catch {
          // Try the next store.
        }
      }
      return null;
    },
    setItem(key, value) {
      const available = stores();
      for (const [index, store] of available.entries()) {
        try {
          store.setItem(key, value);
        } catch {
          continue;
        }
        for (const earlier of available.slice(0, index)) {
          try {
            earlier.removeItem(key);
          } catch {
            // A store that cannot be written may not be cleared either.
          }
        }
        return;
      }
    },
    removeItem(key) {
      for (const store of stores()) {
        try {
          store.removeItem(key);
        } catch {
          // Nothing to remove.
        }
      }
    },
  };
}
