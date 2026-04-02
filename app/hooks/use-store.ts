import { Paths, PathValue, PersistentStore } from "@/lib/store";
import { useCallback, useEffect, useState } from "react";

/**
 * Reactive wrapper around a {@link PersistentStore} instance.
 *
 * Returns the current stored data as React state and exposes the same
 * `update`, `patch`, and `reset` methods — but they update both localStorage
 * AND trigger a re-render in every component that calls this hook with the
 * same store instance.
 *
 * Initialises with defaults on the server (avoids hydration mismatch),
 * then hydrates from localStorage after mount.
 *
 * @param store - A `PersistentStore` instance, typically a module-level singleton.
 *
 * @example
 * ```tsx
 * const { data, update, patch, reset } = usePersistentStore(preferences);
 *
 * <button onClick={() => update({ hourFormat: "12" })}>
 *   Switch to 12h
 * </button>
 * ```
 */
export function usePersistentStore<T extends object>(
  store: PersistentStore<T>,
) {
  // Start with defaults — safe for SSR, avoids hydration mismatch
  const [data, setData] = useState<T>({ ...store.defaults });

  // Hydrate from localStorage after mount
  useEffect(() => {
    setData(store.get());
  }, [store]);

  const update = useCallback(
    (partial: Partial<T>) => {
      const next = store.update(partial);
      setData(next);
    },
    [store],
  );

  const patch = useCallback(
    <P extends Paths<T>>(path: P, value: PathValue<T, P>) => {
      const next = store.patch(path, value);
      setData(next);
    },
    [store],
  );

  const reset = useCallback(() => {
    const next = store.reset();
    setData(next);
  }, [store]);

  const clear = useCallback(() => {
    store.clear();
    setData({ ...store.defaults });
  }, [store]);

  return { data, update, patch, reset, clear } as const;
}
