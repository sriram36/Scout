"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { filterJobs } from "@/lib/filters";
import { LANES } from "@/lib/pipeline";
import { bySource, pipelineSummary } from "@/lib/stats";
import { relativeTime } from "@/lib/time";
import { useScout } from "@/lib/useScout";
import { useTheme, useView } from "@/lib/preferences";
import type { Job, LaneId, SkippedDetail, SortKey } from "@/lib/types";
import { Board } from "./Board";
import { CommandPalette, type PaletteCommand } from "./CommandPalette";
import { Drawer } from "./Drawer";
import { BoardSkeleton, LoadError, SetupPanel, Toasts } from "./Feedback";
import { Icon } from "./Icon";
import { JobTable } from "./JobTable";
import { Sidebar } from "./Sidebar";
import { StatsRow } from "./StatsRow";
import { Topbar } from "./Topbar";

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

export default function Dashboard() {
  const scout = useScout();
  const { theme, toggle: toggleTheme } = useTheme();
  const { jobs, mode, runAction, teach, refresh } = scout;

  const [view, changeView] = useView();
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<string | null>(null);
  const [focusLane, setFocusLane] = useState<LaneId | null>(null);
  const [mobileLane, setMobileLane] = useState<LaneId>("discovered");
  const [internshipOnly, setInternshipOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>("recent");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(tick);
  }, []);

  const focusOnLane = useCallback((lane: LaneId | null) => {
    setFocusLane(lane);
    if (lane) setMobileLane(lane);
  }, []);

  // In the table view a lane filter narrows rows; on the board it collapses the other lanes instead.
  const filtered = useMemo(
    () => filterJobs(jobs, { query, source, internshipOnly, lane: view === "table" ? focusLane : null }),
    [jobs, query, source, internshipOnly, focusLane, view],
  );
  const hasFilters = !!(query.trim() || source || internshipOnly || focusLane);
  const selected = selectedId ? jobs.find(j => j.id === selectedId) ?? null : null;

  const openJob = useCallback((job: Job) => setSelectedId(job.id), []);
  const closeDrawer = useCallback(() => setSelectedId(null), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const onTeach = useCallback(
    (job: Job, item: SkippedDetail & { signature: string }, meaning: string) => teach(job, item, meaning),
    [teach],
  );
  const clearFilters = useCallback(() => {
    setQuery(""); setSource(null); setInternshipOnly(false); setFocusLane(null);
  }, []);

  // Keyboard: Ctrl/Cmd+K opens the command menu, "/" jumps to the filter box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(open => !open);
      } else if (e.key === "/" && !isTyping(e.target) && !paletteOpen && !selectedId) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [paletteOpen, selectedId]);

  const commands = useMemo<PaletteCommand[]>(() => {
    const list: PaletteCommand[] = [
      { id: "theme", group: "Actions", label: theme === "dark" ? "Switch to light theme" : "Switch to dark theme", icon: theme === "dark" ? "sun" : "moon", run: toggleTheme },
      { id: "refresh", group: "Actions", label: "Refresh listings", icon: "refresh", run: () => void refresh() },
      { id: "view", group: "Actions", label: view === "board" ? "Show as table" : "Show as board", icon: view === "board" ? "table" : "board", run: () => changeView(view === "board" ? "table" : "board") },
      { id: "intern", group: "Actions", label: internshipOnly ? "Show all roles" : "Show internships only", icon: "filter", run: () => setInternshipOnly(v => !v) },
    ];
    if (hasFilters) list.push({ id: "clear", group: "Actions", label: "Clear all filters", icon: "close", run: clearFilters });
    for (const lane of LANES) {
      list.push({ id: `lane-${lane.id}`, group: "Stages", label: `Show stage: ${lane.label}`, icon: "board", run: () => focusOnLane(lane.id) });
    }
    if (focusLane) list.push({ id: "lane-all", group: "Stages", label: "Show all stages", icon: "board", run: () => focusOnLane(null) });
    for (const s of bySource(jobs, 12).filter(s => s.source !== "Other")) {
      list.push({ id: `source-${s.source}`, group: "Sources", label: `Filter by source: ${s.source}`, icon: "filter", hint: String(s.count), run: () => setSource(s.source) });
    }
    if (source) list.push({ id: "source-all", group: "Sources", label: "Show all sources", icon: "filter", run: () => setSource(null) });
    return list;
  }, [theme, toggleTheme, refresh, view, changeView, internshipOnly, hasFilters, clearFilters, focusLane, focusOnLane, jobs, source]);

  const ready = (mode === "demo" || mode === "live") && scout.loadState !== "loading";
  const laneLabel = focusLane ? LANES.find(l => l.id === focusLane)?.label : null;

  let main: React.ReactNode;
  if (mode === "unconfigured") {
    main = <SetupPanel error={scout.configError} />;
  } else if (!ready) {
    main = <BoardSkeleton />;
  } else {
    main = (
      <>
        {scout.loadError && <LoadError message={scout.loadError} onRetry={() => void scout.retryLoad()} />}
        <StatsRow
          jobs={jobs}
          now={now}
          activeSource={source}
          onSource={setSource}
          onLane={lane => focusOnLane(focusLane === lane ? null : lane)}
          partial={scout.hasMore}
        />

        {jobs.length === 0 && !scout.loadError && (
          <div className="empty-hero">
            <Icon name="spark" size={20} />
            <div>
              <strong>No roles discovered yet</strong>
              <span>Run the discovery workflow in n8n and new roles will appear in Discovered within seconds.</span>
            </div>
          </div>
        )}

        {hasFilters && (
          <div className="filter-bar" role="region" aria-label="Active filters">
            <span className="filter-count"><span className="num">{filtered.length}</span> of <span className="num">{jobs.length}</span> roles</span>
            {query.trim() && <button type="button" className="filter-chip" onClick={() => setQuery("")}>“{query.trim()}”<Icon name="close" size={12} /><span className="sr-only">Remove search filter</span></button>}
            {source && <button type="button" className="filter-chip" onClick={() => setSource(null)}>{source}<Icon name="close" size={12} /><span className="sr-only">Remove source filter</span></button>}
            {internshipOnly && <button type="button" className="filter-chip" onClick={() => setInternshipOnly(false)}>Internships<Icon name="close" size={12} /><span className="sr-only">Remove internship filter</span></button>}
            {laneLabel && <button type="button" className="filter-chip" onClick={() => setFocusLane(null)}>Stage: {laneLabel}<Icon name="close" size={12} /><span className="sr-only">Show all stages</span></button>}
            <button type="button" className="link-btn" onClick={clearFilters}>Clear all</button>
          </div>
        )}

        {view === "board" ? (
          <Board
            jobs={filtered}
            focusLane={focusLane}
            onFocusLane={focusOnLane}
            mobileLane={mobileLane}
            onMobileLane={lane => { setMobileLane(lane); setFocusLane(null); }}
            busy={scout.busy}
            fresh={scout.fresh}
            onOpen={openJob}
            onAction={runAction}
            now={now}
            filtered={hasFilters}
          />
        ) : filtered.length ? (
          <JobTable jobs={filtered} sort={sort} onSort={setSort} busy={scout.busy} fresh={scout.fresh} onOpen={openJob} onAction={runAction} now={now} />
        ) : (
          <p className="table-empty">{jobs.length ? "No roles match your filters." : "No roles yet."}</p>
        )}

        {scout.hasMore && (
          <div className="load-more">
            <button type="button" className="btn btn-secondary" onClick={() => void scout.loadMore()} disabled={scout.loadState === "more"}>
              {scout.loadState === "more" ? <span className="spinner" aria-hidden="true" /> : <Icon name="plus" size={15} />}
              {scout.loadState === "more" ? "Loading…" : "Load more roles"}
            </button>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="shell">
      <a className="skip-link" href="#main">Skip to the pipeline</a>
      <Sidebar
        profile={scout.profile}
        server={scout.server}
        jobs={jobs}
        source={source}
        onSource={setSource}
        internshipOnly={internshipOnly}
        onInternshipOnly={setInternshipOnly}
        onOpenPalette={() => setPaletteOpen(true)}
        showFilters={mode === "demo" || mode === "live"}
      />
      <main id="main" className="main">
        <Topbar
          summary={mode === "unconfigured" ? "Not connected yet." : ready ? pipelineSummary(jobs) : "Loading your pipeline…"}
          query={query}
          onQuery={setQuery}
          searchRef={searchRef}
          view={view}
          onView={changeView}
          theme={theme}
          onToggleTheme={toggleTheme}
          onRefresh={() => void refresh()}
          refreshing={scout.loadState === "refreshing"}
          onOpenPalette={() => setPaletteOpen(true)}
          mode={mode}
          server={scout.server}
          lastSync={scout.lastSync ? relativeTime(scout.lastSync, now) : null}
        />
        {main}
      </main>

      {selected && (
        <Drawer
          job={selected}
          busy={scout.busy[selected.id]}
          meanings={scout.meanings}
          taught={scout.taught}
          onClose={closeDrawer}
          onAction={runAction}
          onTeach={onTeach}
          now={now}
        />
      )}
      {paletteOpen && <CommandPalette jobs={jobs} commands={commands} onOpenJob={openJob} onClose={closePalette} />}
      <Toasts toasts={scout.toasts} onDismiss={scout.dismissToast} />
    </div>
  );
}
