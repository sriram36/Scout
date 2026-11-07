"use client";

import { useCallback, useSyncExternalStore } from "react";
import { THEME_KEY } from "./themeScript";
import type { View } from "./types";

export type Theme = "dark" | "light";
const VIEW_KEY = "scout-view";
const VIEW_EVENT = "scout-view-change";

// ── Theme: the <html data-theme> attribute is the source of truth ───────────
function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}
const readTheme = (): Theme => (document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");

export function useTheme() {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "dark" as Theme);
  const toggle = useCallback(() => {
    const next: Theme = readTheme() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem(THEME_KEY, next); } catch { /* storage unavailable */ }
  }, []);
  return { theme, toggle };
}

// ── Board/table layout, remembered in localStorage ──────────────────────────
function subscribeView(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(VIEW_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(VIEW_EVENT, onChange);
  };
}
function readView(): View {
  try { return localStorage.getItem(VIEW_KEY) === "table" ? "table" : "board"; } catch { return "board"; }
}

export function useView() {
  const view = useSyncExternalStore(subscribeView, readView, () => "board" as View);
  const setView = useCallback((next: View) => {
    try { localStorage.setItem(VIEW_KEY, next); } catch { /* storage unavailable */ }
    window.dispatchEvent(new Event(VIEW_EVENT));
  }, []);
  return [view, setView] as const;
}
