import { useEffect, useRef } from "react";

function getVisitorId(): string {
  let vid = localStorage.getItem("bf_vid");
  if (!vid) {
    vid = Math.random().toString(36).substring(2) + Date.now().toString(36);
    localStorage.setItem("bf_vid", vid);
  }
  return vid;
}

export function useTracker() {
  const sentRef = useRef(false);

  useEffect(() => {
    if (sentRef.current) return;
    sentRef.current = true;

    const vid = getVisitorId();
    const page = window.location.pathname + window.location.hash;

    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitor_id: vid, page, referrer: document.referrer }),
    }).catch(() => {});

    const interval = setInterval(() => {
      const currentPage = window.location.pathname + window.location.hash;
      fetch("/api/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitor_id: vid, page: currentPage }),
      }).catch(() => {});
    }, 30000);

    return () => clearInterval(interval);
  }, []);
}
