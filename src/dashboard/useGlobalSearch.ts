import { useState, useEffect, useRef } from "react";
import type { DToken } from "./types";
import { dashFetchAllTokens, dashTokenLookup } from "./api";

function matchesQuery(t: DToken, q: string): boolean {
  const s = q.toLowerCase();
  return (
    (t.name || "").toLowerCase().includes(s) ||
    (t.ticker || "").toLowerCase().includes(s) ||
    (t.address || t.ca || "").toLowerCase().includes(s)
  );
}

export function useGlobalSearch(localTokens: DToken[]) {
  const [search, setSearch] = useState("");
  const [remoteTokens, setRemoteTokens] = useState<DToken[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastQueryRef = useRef("");

  useEffect(() => {
    const q = search.trim();

    if (!q) {
      setRemoteTokens([]);
      setIsSearching(false);
      lastQueryRef.current = "";
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      lastQueryRef.current = q;
      setIsSearching(true);

      try {
        if (/^0x[0-9a-fA-F]{30,}$/.test(q)) {
          const token = await dashTokenLookup(q);
          if (lastQueryRef.current === q) {
            setRemoteTokens(token ? [token] : []);
          }
        } else {
          const all = await dashFetchAllTokens();
          if (lastQueryRef.current === q) {
            setRemoteTokens(all.filter(t => matchesQuery(t, q)));
          }
        }
      } finally {
        if (lastQueryRef.current === q) setIsSearching(false);
      }
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  const q = search.trim();

  let filtered: DToken[];
  if (!q) {
    filtered = localTokens;
  } else {
    const localMatches = localTokens.filter(t => matchesQuery(t, q));
    const localAddrs = new Set(localMatches.map(t => (t.address || t.ca || "").toLowerCase()));
    const remoteOnly = remoteTokens.filter(t => !localAddrs.has((t.address || t.ca || "").toLowerCase()));
    filtered = [...localMatches, ...remoteOnly];
  }

  return { search, setSearch, filtered, isSearching };
}
