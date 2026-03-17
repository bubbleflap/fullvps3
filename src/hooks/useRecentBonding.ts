import { useState, useEffect, useRef, useCallback } from "react";
import type { Token } from "../lib/types";
import { fetchRecentBonding, refreshRecentBonding } from "../lib/api";

const POLL_INTERVAL = 30000;

export function useRecentBonding() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function load() {
    const data = await fetchRecentBonding();
    if (data.length > 0) {
      setTokens(data);
    }
  }

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const result = await refreshRecentBonding();
      if (result.tokens && result.tokens.length > 0) {
        setTokens(result.tokens);
      } else {
        await load();
      }
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, POLL_INTERVAL);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return { tokens, refresh, refreshing };
}
