import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

export interface Settings {
  refreshInterval: number; // seconds
  notifyOnHighAlerts: boolean;
  confirmBeforeClear: boolean;
  showTimestampSeconds: boolean;
  timeFormat: "12h" | "24h";
}

const defaults: Settings = {
  refreshInterval: 15,
  notifyOnHighAlerts: false,
  confirmBeforeClear: true,
  showTimestampSeconds: true,
  timeFormat: "24h",
};

interface SettingsContextValue {
  settings: Settings;
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  reset: () => void;
}

const SettingsContext = createContext<SettingsContextValue>({
  settings: defaults,
  update: () => {},
  reset: () => {},
});

const STORAGE_KEY = "homesoc_settings";

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
  }
}

const initialSettings = loadSettings();

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(initialSettings);

  // Persist on change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  const update = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const reset = useCallback(() => {
    setSettings(defaults);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, update, reset }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
