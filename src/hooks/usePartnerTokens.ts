import { useState, useEffect, useRef } from "react";
import type { Token } from "../lib/types";
import { mapRawToken } from "../lib/api";

const POLL_INTERVAL = 30000;

export function usePartnerTokens() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loaded, setLoaded] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/partner-tokens");
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.tokens)) {
        setTokens(data.tokens.map(mapRawToken));
        setLoaded(true);
      }
    } catch {}
  }

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, POLL_INTERVAL);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  return { tokens, loaded };
}
