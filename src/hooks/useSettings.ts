import { useState, useEffect } from "react";

export interface SiteSettings {
  ca_address: string;
  telegram: string;
  twitter: string;
  github: string;
  email: string;
  bflap_link: string;
  flapsh_link: string;
}

const DEFAULTS: SiteSettings = {
  ca_address: "0xa2320fff1069ED5b4B02dDb386823E837A7e7777",
  telegram: "https://t.me/BubbleFlap",
  twitter: "https://x.com/BubbleFlapFun",
  github: "https://github.com/bubbleflap",
  email: "dev@bubbleflap.fun",
  bflap_link: "https://flap.sh/bnb/0x",
  flapsh_link: "https://flap.sh/bnb/board",
};

let cachedSettings: SiteSettings = { ...DEFAULTS };
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
      cachedSettings = { ...DEFAULTS, ...data };
      fetched = true;
      notify();
    }
  } catch {
    // use defaults
  }
}

if (!fetched) loadSettings();

export function useSettings(): SiteSettings {
  const [settings, setSettings] = useState<SiteSettings>(cachedSettings);

  useEffect(() => {
    const handler = (s: SiteSettings) => setSettings(s);
    listeners.add(handler);
    if (fetched) setSettings({ ...cachedSettings });
    return () => { listeners.delete(handler); };
  }, []);

  return settings;
}

export function refreshSettings() {
  loadSettings();
}
