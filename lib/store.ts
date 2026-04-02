/**
 * @file store.ts
 * @description Type-safe persistent storage with partial updates, immutable
 * deep patching, and a React hook for reactive consumption.
 */

// ---------------------------------------------------------------------------
// Deep path inference
// ---------------------------------------------------------------------------

/**
 * Builds a union of all valid dot-notation paths for a nested object type.
 *
 * Given `{ a: { b: number }; c: string }`, produces `"a" | "a.b" | "c"`.
 * Depth is capped at 4 levels to keep the compiler fast on large objects.
 */
export type Paths<T, Depth extends number[] = []> = Depth["length"] extends 4
  ? never
  : T extends object
    ? {
        [K in keyof T & string]: K | `${K}.${Paths<T[K], [...Depth, 0]>}`;
      }[keyof T & string]
    : never;

/**
 * Resolves the value type at a given dot-notation path.
 *
 * `PathValue<{ a: { b: number } }, "a.b">` → `number`
 */
export type PathValue<
  T,
  P extends string,
> = P extends `${infer Head}.${infer Tail}`
  ? Head extends keyof T
    ? PathValue<T[Head], Tail>
    : never
  : P extends keyof T
    ? T[P]
    : never;

// ---------------------------------------------------------------------------
// Immutable deep set
// ---------------------------------------------------------------------------

/**
 * Returns a new object with the value at `path` replaced by `value`.
 * All intermediate objects are cloned — the input is never mutated.
 *
 * @param obj   - Source object (not mutated)
 * @param path  - Dot-separated key path e.g. "location.lat"
 * @param value - Value to set at that path
 */
function immutableSet<T extends object>(
  obj: T,
  path: string,
  value: unknown,
): T {
  const keys = path.split(".");
  const [head, ...rest] = keys;

  if (rest.length === 0) {
    return { ...obj, [head]: value };
  }

  const record = obj as Record<string, unknown>;
  const child = (record[head] ?? {}) as Record<string, unknown>;

  return {
    ...obj,
    [head]: immutableSet(child, rest.join("."), value),
  };
}

// ---------------------------------------------------------------------------
// PersistentStore
// ---------------------------------------------------------------------------

/**
 * A persistent client-side storage wrapper for structured data.
 *
 * Supports partial updates, deep merging, and type safety.
 *
 * @template T - Shape of the stored object
 *
 * @example
 * ```ts
 * // Define your store as a singleton
 * export const preferences = new PersistentStore("shin:prefs", {
 *   theme:           "neue",
 *   solarMode:       "TST" as const,
 *   hourFormat:      "24" as const,
 *   // ...
 * });
 *
 * // Outside React — works anywhere
 * preferences.update({ theme: "dark" });
 * preferences.patch("solarMode", "MST");
 * const all = preferences.get();
 *
 * // Inside React — reactive
 * const { data, update, patch, reset } = usePersistentStore(preferences);
 * ```
 */
export class PersistentStore<T extends object> {
  readonly key: string;
  readonly defaults: Readonly<T>;

  /**
   * @param key      - localStorage key. Namespace it to avoid collisions
   *                   e.g. `"myapp:prefs"`.
   * @param defaults - Full default object. Every key must have a value so
   *                   new keys added in future versions are filled in on read.
   */
  constructor(key: string, defaults: T) {
    this.key = key;
    this.defaults = Object.freeze({ ...defaults });
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  /**
   * Returns the current stored object, merged with defaults.
   * New keys added to `defaults` are returned automatically even if not
   * yet present in the stored value.
   *
   * Returns defaults if:
   * - Running on the server
   * - The key doesn't exist yet
   * - The stored JSON is corrupt
   */
  get(): T {
    if (typeof window === "undefined") return { ...this.defaults };
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return { ...this.defaults };
      return { ...this.defaults, ...JSON.parse(raw) };
    } catch {
      return { ...this.defaults };
    }
  }

  /**
   * Returns the value at a single top-level key.
   *
   * @example
   * preferences.getKey("hourFormat"); // "24"
   */
  getKey<K extends keyof T>(key: K): T[K] {
    return this.get()[key];
  }

  // ── Write ─────────────────────────────────────────────────────────────────

  /**
   * Replaces the entire stored object.
   * Prefer `update()` for partial changes.
   */
  set(data: T): void {
    this.write(data);
  }

  /**
   * Shallow-merges a partial object into the current stored value.
   * Unspecified keys are left unchanged.
   *
   * @example
   * preferences.update({ hourFormat: "12" });
   */
  update(partial: Partial<T>): T {
    const next = { ...this.get(), ...partial };
    this.write(next);
    return next;
  }

  /**
   * Immutably sets a value at a dot-notation path.
   * Both the path and value are fully typed — TypeScript will error on
   * invalid paths or mismatched value types.
   *
   * @example
   * preferences.patch("solarMode", "MST");
   * preferences.patch("location.lat", 48.85);
   */
  patch<P extends Paths<T>>(path: P, value: PathValue<T, P>): T {
    const next = immutableSet(this.get(), path as string, value) as T;
    this.write(next);
    return next;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /**
   * Resets all values to defaults and writes them to storage.
   * The key is kept — use `clear()` to remove it entirely.
   */
  reset(): T {
    const next = { ...this.defaults };
    this.write(next);
    return next;
  }

  /**
   * Removes the key from localStorage entirely.
   * Subsequent `get()` calls will return defaults.
   */
  clear(): void {
    if (typeof window === "undefined") return;
    try {
      localStorage.removeItem(this.key);
    } catch {
      /* noop */
    }
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private write(data: T): void {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(this.key, JSON.stringify(data));
    } catch {
      // Quota exceeded or private browsing — preferences are cosmetic,
      // losing them is non-fatal.
    }
  }
}
