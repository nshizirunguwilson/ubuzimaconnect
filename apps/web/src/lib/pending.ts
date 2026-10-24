"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Next.js keeps a page's state when you navigate away and back (React Activity, with cacheComponents).
 * A button left loading by a navigation would still spin on return, and a login form would still hold
 * the old error and password. Effects clean up when a page is hidden, so state is reset there.
 */
export function useOnHide(reset: () => void) {
  const ref = useRef(reset);
  useEffect(() => {
    ref.current = reset;
  });
  useEffect(() => () => ref.current(), []);
}

/** A loading flag that is never still on when you come back to the screen. */
export function usePending<T = boolean>(initial: T) {
  const [value, set] = useState<T>(initial);
  useOnHide(() => set(initial));
  return [value, set] as const;
}
