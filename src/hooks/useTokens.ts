import { useState, useEffect, useRef, useCallback } from "react";
import type { Token, RawToken } from "../lib/types";
import { fetchFlapTokens, mapRawToken, NEWEST_POSITIONS } from "../lib/api";

export function useTokens() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [newestIds, setNewestIds] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTokenUpdate = useCallback((updatedTokens: Token[]) => {
    if (updatedTokens.length === 0) return;
    setTokens((prev) => {
      const existingIds = new Set(prev.map((t) => t.id));
      const existingMap = new Map(prev.map((t) => [t.id, t]));

      const merged = updatedTokens.map((t) => {
        const existing = existingMap.get(t.id);
        if (existing) {
          const diff = t.mcap - existing.mcap;
          const pctChange = existing.mcap > 0 ? (diff / existing.mcap) * 100 : 0;
          let boost = existing.activityBoost || 0;
          if (Math.abs(pctChange) > 0.5) {
            boost = Math.max(-1, Math.min(1, pctChange / 10));
          } else {
            boost = boost * 0.9;
          }
          return {
            ...existing,
            mcap: t.mcap,
            mcapBnb: t.mcapBnb,
            price: t.price,
            change24h: t.change24h,
            holders: t.holders,
            devHoldPercent: t.devHoldPercent,
            burnPercent: t.burnPercent,
            sniperHoldPercent: t.sniperHoldPercent,
            bondingCurve: t.bondingCurve,
            bondProgress: t.bondProgress,
            reserveBnb: t.reserveBnb,
            graduated: t.graduated,
            listed: t.listed,
            taxEarned: t.taxEarned,
            dexPaid: t.dexPaid,
            dexPairCount: t.dexPairCount,
            website: t.website,
            twitter: t.twitter,
            telegram: t.telegram,
            lastMcap: existing.mcap,
            activityBoost: boost,
            newlyDetectedAt: existing.newlyDetectedAt || t.newlyDetectedAt,
          };
        }
        return { ...t, activityBoost: 0.5 };
      });

      const sorted = [...merged].sort((a, b) => b.createdAt - a.createdAt);
      const newestSlice = sorted.slice(0, NEWEST_POSITIONS.length).map((t) => t.id);
      setNewestIds(newestSlice);

      return merged.map((t) => {
        const newestIdx = newestSlice.indexOf(t.id);
        if (newestIdx >= 0 && newestIdx < NEWEST_POSITIONS.length && !existingIds.has(t.id)) {
          return { ...t, x: NEWEST_POSITIONS[newestIdx].x, y: NEWEST_POSITIONS[newestIdx].y };
        }
        return t;
      });
    });
  }, []);

  const connectWs = useCallback(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/ws`;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("WebSocket connected");
        setConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "tokens_update" && Array.isArray(data.tokens)) {
            const mapped = data.tokens.map((t: RawToken) => mapRawToken(t));
            handleTokenUpdate(mapped);
          }
        } catch (e) {
          console.error("Failed to parse WebSocket message:", e);
        }
      };

      ws.onclose = () => {
        console.log("WebSocket disconnected, reconnecting in 3s...");
        setConnected(false);
        reconnectRef.current = setTimeout(connectWs, 3000);
      };

      ws.onerror = (err) => {
        console.error("WebSocket error:", err);
        setConnected(false);
      };
    } catch (e) {
      console.error("Failed to create WebSocket:", e);
      reconnectRef.current = setTimeout(connectWs, 3000);
    }
  }, [handleTokenUpdate]);

  useEffect(() => {
    fetchFlapTokens().then((fetched) => {
      if (fetched.length > 0) {
        const sorted = [...fetched].sort((a, b) => b.createdAt - a.createdAt);
        const positioned = sorted.map((t, i) => {
          if (i < NEWEST_POSITIONS.length) {
            return { ...t, x: NEWEST_POSITIONS[i].x, y: NEWEST_POSITIONS[i].y };
          }
          return t;
        });
        setTokens(positioned);
        setNewestIds(sorted.slice(0, NEWEST_POSITIONS.length).map((t) => t.id));
      }
    });

    connectWs();

    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connectWs]);

  const refresh = useCallback(async () => {
    const fetched = await fetchFlapTokens();
    if (fetched.length > 0) {
      const sorted = [...fetched].sort((a, b) => b.createdAt - a.createdAt);
      const positioned = sorted.map((t, i) => {
        if (i < NEWEST_POSITIONS.length) {
          return { ...t, x: NEWEST_POSITIONS[i].x, y: NEWEST_POSITIONS[i].y };
        }
        return t;
      });
      setTokens(positioned);
      setNewestIds(sorted.slice(0, NEWEST_POSITIONS.length).map((t) => t.id));
    }
  }, []);

  return { tokens, newestIds, connected, refresh };
}
