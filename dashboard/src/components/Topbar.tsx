"use client";

import type { RefObject } from "react";
import type { Mode, ServerState, View } from "@/lib/types";
import { BrandMark, Icon } from "./Icon";
import { ServerBadge } from "./Sidebar";

export function Topbar({
  summary, query, onQuery, searchRef, view, onView, theme, onToggleTheme, onRefresh, refreshing, onOpenPalette, mode, server, lastSync,
}: {
  summary: string;
  query: string;
  onQuery: (q: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  view: View;
  onView: (v: View) => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  onOpenPalette: () => void;
  mode: Mode;
  server: ServerState;
  lastSync: string | null;
}) {
  const canUseData = mode === "demo" || mode === "live";
  return (
    <header className="topbar">
      <div className="mobile-brand">
        <BrandMark size={24} />
        <span className="wordmark">scout</span>
        <ServerBadge server={server} />
      </div>
      <div className="title-block">
        <h1>Pipeline</h1>
        <p className="summary" aria-live="polite">{summary}</p>
      </div>
      <div className="toolbar">
        {canUseData && (
          <label className="search">
            <Icon name="search" size={16} />
            <span className="sr-only">Filter roles by title, company or location</span>
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={e => onQuery(e.target.value)}
              placeholder="Filter roles"
              autoComplete="off"
            />
            {!query && <kbd aria-hidden="true">/</kbd>}
          </label>
        )}
        <button type="button" className="icon-btn" onClick={onOpenPalette} aria-label="Open command menu (Ctrl K)" title="Command menu (Ctrl K)">
          <Icon name="command" />
        </button>
        {canUseData && (
          <div className="segmented" role="group" aria-label="Layout">
            <button type="button" aria-pressed={view === "board"} onClick={() => onView("board")} title="Board"><Icon name="board" /><span className="seg-label">Board</span></button>
            <button type="button" aria-pressed={view === "table"} onClick={() => onView("table")} title="Table"><Icon name="table" /><span className="seg-label">Table</span></button>
          </div>
        )}
        <button
          type="button"
          className="icon-btn"
          onClick={onToggleTheme}
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          title={theme === "dark" ? "Light theme" : "Dark theme"}
        >
          <Icon name={theme === "dark" ? "sun" : "moon"} />
        </button>
        {canUseData && (
          <button
            type="button"
            className={`icon-btn${refreshing ? " is-spinning" : ""}`}
            onClick={onRefresh}
            disabled={refreshing}
            aria-label="Refresh listings"
            title={lastSync ? `Refresh (last synced ${lastSync})` : "Refresh"}
          >
            <Icon name="refresh" />
          </button>
        )}
      </div>
    </header>
  );
}
