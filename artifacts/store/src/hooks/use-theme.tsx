import { createContext, useContext, useEffect, useState, ReactNode } from "react";

type Mode = "light" | "dark";
type ThemeContextValue = { mode: Mode; toggle: () => void; setMode: (m: Mode) => void };

const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = "ui_theme_mode";

function applyMode(mode: Mode) {
  const html = document.documentElement;
  if (mode === "dark") html.classList.add("dark");
  else html.classList.remove("dark");
}

function getInitialMode(): Mode {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>(() => {
    const initial = getInitialMode();
    if (typeof document !== "undefined") applyMode(initial);
    return initial;
  });

  const setMode = (m: Mode) => {
    setModeState(m);
    localStorage.setItem(STORAGE_KEY, m);
    applyMode(m);
  };
  const toggle = () => setMode(mode === "dark" ? "light" : "dark");

  useEffect(() => { applyMode(mode); }, [mode]);

  return (
    <ThemeContext.Provider value={{ mode, toggle, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
