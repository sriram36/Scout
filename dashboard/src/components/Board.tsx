"use client";

import { groupByLane, LANES } from "@/lib/pipeline";
import type { Job, JobAction, LaneId } from "@/lib/types";
import { JobCard } from "./JobCard";

const EMPTY_COPY: Record<LaneId, string> = {
  discovered: "Nothing new right now. Roles appear here as the n8n workflow finds them.",
  queued: "Nothing queued. Pick a role in Discovered and choose Auto-fill.",
  filling: "The browser is idle. It picks up queued roles automatically.",
  review: "Nothing is waiting for you.",
  applied: "Applications you submit land here.",
  attention: "All clear.",
};

export function Board({
  jobs, focusLane, onFocusLane, mobileLane, onMobileLane, busy, fresh, onOpen, onAction, now, filtered,
}: {
  jobs: Job[];
  focusLane: LaneId | null;
  onFocusLane: (lane: LaneId | null) => void;
  mobileLane: LaneId;
  onMobileLane: (lane: LaneId) => void;
  busy: Record<string, JobAction>;
  fresh: ReadonlySet<string>;
  onOpen: (job: Job) => void;
  onAction: (job: Job, action: JobAction) => void;
  now: Date;
  filtered: boolean;
}) {
  const groups = groupByLane(jobs);
  const route = LANES.filter(l => l.id !== "attention");
  const attention = LANES.find(l => l.id === "attention")!;

  return (
    <section className="board-wrap" aria-label="Application pipeline">
      <div className="stage-tabs" role="tablist" aria-label="Pipeline stage">
        {LANES.map(lane => (
          <button
            key={lane.id}
            type="button"
            role="tab"
            aria-selected={mobileLane === lane.id}
            className="stage-tab"
            data-lane={lane.id}
            onClick={() => onMobileLane(lane.id)}
          >
            <span className="stage-dot" aria-hidden="true" />
            {lane.label}
            <span className="num">{groups[lane.id].length}</span>
          </button>
        ))}
      </div>

      <div className={`board${focusLane ? " has-focus" : ""}`}>
        {[...route, attention].map((lane, laneIndex) => {
          const items = groups[lane.id];
          const collapsed = focusLane !== null && focusLane !== lane.id;
          const onRoute = lane.id !== "attention";
          return (
            <section
              key={lane.id}
              className={`lane${collapsed ? " is-collapsed" : ""}${mobileLane === lane.id ? " is-mobile-active" : ""}${onRoute ? "" : " lane-off-route"}`}
              data-lane={lane.id}
              aria-labelledby={`lane-${lane.id}`}
              style={{ ["--lane-i" as string]: laneIndex }}
            >
              <header className="lane-head">
                <span className="waypoint" aria-hidden="true" />
                <h2 id={`lane-${lane.id}`} className="lane-title">
                  <button
                    type="button"
                    className="lane-toggle"
                    onClick={() => onFocusLane(focusLane === lane.id ? null : lane.id)}
                    aria-pressed={focusLane === lane.id}
                    title={focusLane === lane.id ? "Show all stages" : `Focus on ${lane.label}`}
                  >
                    {lane.label}
                  </button>
                </h2>
                <span className="lane-count num" aria-label={`${items.length} ${items.length === 1 ? "role" : "roles"}`}>{items.length}</span>
              </header>
              {!collapsed && (
                <>
                  <p className="lane-hint">{lane.hint}</p>
                  <div className="lane-body">
                    {items.length === 0 ? (
                      <p className="lane-empty">{filtered ? "No roles here match your filters." : EMPTY_COPY[lane.id]}</p>
                    ) : (
                      items.map((job, i) => (
                        <JobCard
                          key={job.id}
                          job={job}
                          busy={busy[job.id]}
                          fresh={fresh.has(job.id)}
                          onOpen={onOpen}
                          onAction={onAction}
                          now={now}
                          index={i}
                        />
                      ))
                    )}
                  </div>
                </>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}
