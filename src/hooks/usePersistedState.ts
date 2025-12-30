'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * A hook that persists state to localStorage.
 * Falls back to the default value if localStorage is unavailable or the key doesn't exist.
 *
 * @param key - The localStorage key to use
 * @param defaultValue - The default value if no persisted value exists
 * @returns A tuple of [value, setValue] similar to useState
 */
export function usePersistedState<T>(
  key: string,
  defaultValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  // Initialize with default value to avoid hydration mismatch
  const [value, setValue] = useState<T>(defaultValue);
  const [isHydrated, setIsHydrated] = useState(false);

  // Load from localStorage after mount (client-side only)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored !== null) {
        setValue(JSON.parse(stored));
      }
    } catch {
      // localStorage not available or invalid JSON
    }
    setIsHydrated(true);
  }, [key]);

  // Persist to localStorage whenever value changes (after hydration)
  useEffect(() => {
    if (!isHydrated) return;

    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // localStorage not available
    }
  }, [key, value, isHydrated]);

  const setPersistedValue = useCallback((newValue: T | ((prev: T) => T)) => {
    setValue(newValue);
  }, []);

  return [value, setPersistedValue];
}
