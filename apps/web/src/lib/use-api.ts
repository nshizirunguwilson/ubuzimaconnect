"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiFailure } from "./api";

const message = (e: unknown) => (e instanceof ApiFailure ? e.error.message : "Couldn't load this page. Try again.");

/** Loads a GET endpoint for a client screen. `reload()` fetches again and resolves when the new data is in. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!path) return;
    let live = true;
    api<T>(path).then(
      (d) => {
        if (!live) return;
        setData(d);
        setError(null);
      },
      (e) => live && setError(message(e)),
    );
    return () => {
      live = false;
    };
  }, [path]);

  const reload = useCallback(async () => {
    if (!path) return;
    try {
      setData(await api<T>(path));
      setError(null);
    } catch (e) {
      setError(message(e));
    }
  }, [path]);

  return { data, error, reload };
}
