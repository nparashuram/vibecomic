import { useState } from 'react';

/** One of a fixed set of values kept in localStorage, so a per-viewer choice survives reloads. */
export function usePersistentChoice<T extends string>(
  key: string,
  options: readonly T[],
  initial: T
) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return options.includes(stored as T) ? (stored as T) : initial;
    } catch {
      return initial;
    }
  });

  function set(next: T) {
    setValue(next);
    try {
      localStorage.setItem(key, next);
    } catch {
      // storage unavailable: the choice just lasts for this session
    }
  }

  return [value, set] as const;
}
