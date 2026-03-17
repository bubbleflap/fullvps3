import { useState, useEffect } from "react";

export interface SiteSettings {
  tord_contract?: string;
  staking_contract?: string;
  staking_contract_7d?: string;
  staking_contract_15d?: string;
  twitter_url?: string;
  telegram_url?: string;
  github_url?: string;
  discord_url?: string;
  website_url?: string;
}

let cachedSettings: SiteSettings = {};
let fetched = false;
const listeners = new Set<(s: SiteSettings) => void>();

function notify() {
  listeners.forEach((fn) => fn({ ...cachedSettings }));
}

async function loadSettings() {
  try {
    const res = await fetch("/api/settings");
    if (res.ok) {
      const data = await res.json();
      cachedSettings = { ...cachedSettings, ...data };
      fetched = true;
      notify();
    }
  } catch {
    fetched = true;
    notify();
  }
}

if (!fetched) loadSettings();

export function useSiteSettings() {
  const [settings, setSettings] = useState<SiteSettings>(cachedSettings);
  const [isLoading, setIsLoading] = useState(!fetched);

  useEffect(() => {
    const handler = (s: SiteSettings) => {
      setSettings(s);
      setIsLoading(false);
    };
    listeners.add(handler);
    if (fetched) {
      setSettings({ ...cachedSettings });
      setIsLoading(false);
    }
    return () => { listeners.delete(handler); };
  }, []);

  return { data: settings, isLoading };
}
