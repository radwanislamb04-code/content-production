import { useEffect, useRef, useState } from "react";

/**
 * Fetch a JSON endpoint, optionally keeping it fresh.
 *
 * `refreshMs` exists because a status card that never changes is worse than no card: the
 * Dashboard showed the same five pipeline words all day while the owner was producing
 * scripts, and nothing on it ever moved. With `refreshMs` the endpoint is re-read on an
 * interval *and* whenever the window regains focus or becomes visible again — a
 * backgrounded tab throttles timers, so returning to it has to trigger a read rather than
 * wait out the interval.
 *
 * A refetch never flips back to `loading` while data is already on screen: the card
 * updates in place instead of blinking to a skeleton every interval.
 */
export function useApi<T>(url: string, options: { refreshMs?: number } = {}) {
  const { refreshMs = 0 } = options;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  /** When the data on screen was read — lets a card say how fresh it is. */
  const [fetchedAt, setFetchedAt] = useState(0);
  const fresh = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const read = async () => {
      if (!fresh.current) setLoading(true);
      try {
        const res = await fetch(url);
        const json = (await res.json()) as T;
        if (cancelled) return;
        setData(json);
        setError(false);
        fresh.current = true;
        setFetchedAt(Date.now());
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fresh.current = false;
    void read();

    const teardown: Array<() => void> = [];
    if (refreshMs > 0) {
      const tick = () => {
        if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
        void read();
      };
      const timer = setInterval(tick, refreshMs);
      document.addEventListener("visibilitychange", tick);
      window.addEventListener("focus", tick);
      teardown.push(() => clearInterval(timer));
      teardown.push(() => document.removeEventListener("visibilitychange", tick));
      teardown.push(() => window.removeEventListener("focus", tick));
    }

    return () => {
      cancelled = true;
      teardown.forEach((fn) => fn());
    };
  }, [url, refreshMs]);

  return { data, loading, error, setData, fetchedAt };
}
