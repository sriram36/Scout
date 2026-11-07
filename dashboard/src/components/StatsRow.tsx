"use client";

import { useState } from "react";
import { bySource, computeFunnel, discoveredPerDay, fillCoverage } from "@/lib/stats";
import { MONTHS } from "@/lib/time";
import type { Job, LaneId } from "@/lib/types";

const DAYS = 14;

function dayLabel(key: string) {
  const [, m, d] = key.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

function barPath(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

function DailyBars({ jobs, now }: { jobs: Job[]; now: Date }) {
  const days = discoveredPerDay(jobs, now, DAYS);
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...days.map(d => d.count));
  const total = days.reduce((s, d) => s + d.count, 0);
  const W = 280, H = 64, gap = 4;
  const bw = (W - gap * (DAYS - 1)) / DAYS;
  const shown = hover ?? DAYS - 1;

  return (
    <div className="stat stat-days">
      <div className="stat-head">
        <h2>Found in the last two weeks</h2>
        <p className="stat-big num">{total}</p>
      </div>
      <p className="days-readout" aria-hidden="true">
        <span className="num">{days[shown].count}</span> found {hover === null ? "today" : `on ${dayLabel(days[shown].date)}`}
      </p>
      <div className="days-chart" onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax meet" role="img" aria-label={`Listings found per day over the last ${DAYS} days, ${total} in total`}>
          <line x1="0" x2={W} y1={H - 0.5} y2={H - 0.5} className="axis" />
          {days.map((d, i) => {
            const x = i * (bw + gap);
            const h = d.count ? Math.max(4, (d.count / max) * (H - 6)) : 2;
            const cls = i === DAYS - 1 ? "bar is-today" : i === hover ? "bar is-hover" : d.count ? "bar" : "bar is-zero";
            return (
              <g key={d.date} onMouseEnter={() => setHover(i)}>
                <rect x={x - gap / 2} y="0" width={bw + gap} height={H} fill="transparent" />
                <path d={barPath(x, H - h, bw, h, 3)} className={cls} />
              </g>
            );
          })}
        </svg>
        <div className="days-axis" aria-hidden="true"><span>{dayLabel(days[0].date)}</span><span>Today</span></div>
        <table className="sr-only">
          <caption>Listings found per day</caption>
          <tbody>{days.map(d => <tr key={d.date}><th scope="row">{dayLabel(d.date)}</th><td>{d.count}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

function Funnel({ jobs, onLane }: { jobs: Job[]; onLane: (lane: LaneId) => void }) {
  const f = computeFunnel(jobs);
  const steps: { lane: LaneId; label: string; value: number }[] = [
    { lane: "discovered", label: "Found", value: f.total },
    { lane: "queued", label: "Queued", value: f.queued },
    { lane: "review", label: "Filled", value: f.filled },
    { lane: "applied", label: "Applied", value: f.applied },
  ];
  return (
    <div className="stat stat-funnel">
      <div className="stat-head">
        <h2>Funnel</h2>
        <p className="stat-sub">{f.total ? `${Math.round((f.applied / f.total) * 100)}% of found roles applied` : "No roles yet"}</p>
      </div>
      <ol className="funnel">
        {steps.map(s => (
          <li key={s.lane} data-lane={s.lane}>
            <button type="button" className="funnel-row" onClick={() => onLane(s.lane)} aria-label={`${s.label}: ${s.value}. Show this stage`}>
              <span className="funnel-label">{s.label}</span>
              <span className="funnel-track"><span className="funnel-bar" style={{ width: `${f.total ? Math.max(2, (s.value / f.total) * 100) : 0}%` }} /></span>
              <span className="funnel-value num">{s.value}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Sources({ jobs, active, onSource }: { jobs: Job[]; active: string | null; onSource: (s: string | null) => void }) {
  const rows = bySource(jobs, 4);
  const max = Math.max(1, ...rows.map(r => r.count));
  const distinct = new Set(jobs.map(j => j.source)).size;
  return (
    <div className="stat stat-sources">
      <div className="stat-head">
        <h2>Sources</h2>
        <p className="stat-sub">{distinct ? (distinct === 1 ? "One source" : `${distinct} sources`) : "No sources yet"}</p>
      </div>
      <ul className="sources">
        {rows.map(r => {
          const isOther = r.source === "Other";
          const isActive = active === r.source;
          return (
            <li key={r.source}>
              <button
                type="button"
                className={`source-row${isActive ? " is-active" : ""}`}
                disabled={isOther}
                onClick={() => onSource(isActive ? null : r.source)}
                aria-pressed={isOther ? undefined : isActive}
              >
                <span className="source-name">{r.source}</span>
                <span className="source-track"><span style={{ width: `${(r.count / max) * 100}%` }} /></span>
                <span className="num">{r.count}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Coverage({ jobs }: { jobs: Job[] }) {
  const c = fillCoverage(jobs);
  const ai = jobs.reduce((s, j) => s + (j.application?.ai_questions_answered ?? 0), 0);
  const pct = Math.round(c.ratio * 100);
  return (
    <div className="stat stat-coverage">
      <div className="stat-head">
        <h2>Fields filled</h2>
        <p className="stat-big num">{c.applications ? `${pct}%` : "–"}</p>
      </div>
      <p className="stat-sub">
        {c.applications
          ? <><span className="num">{c.filled}</span> of <span className="num">{c.detected}</span> form fields across <span className="num">{c.applications}</span> {c.applications === 1 ? "form" : "forms"}, <span className="num">{ai}</span> written by AI</>
          : "Scout reports coverage after its first auto-fill."}
      </p>
      <div className="meter meter-lg" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

export function StatsRow({
  jobs, now, activeSource, onSource, onLane, partial,
}: {
  jobs: Job[];
  now: Date;
  activeSource: string | null;
  onSource: (s: string | null) => void;
  onLane: (lane: LaneId) => void;
  partial: boolean;
}) {
  return (
    <section className="stats" aria-label="Search statistics">
      <Funnel jobs={jobs} onLane={onLane} />
      <DailyBars jobs={jobs} now={now} />
      <Sources jobs={jobs} active={activeSource} onSource={onSource} />
      <Coverage jobs={jobs} />
      {partial && <p className="stats-note">Based on the {jobs.length} most recent listings loaded so far.</p>}
    </section>
  );
}
