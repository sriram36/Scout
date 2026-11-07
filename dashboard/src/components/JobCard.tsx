"use client";

import { laneForStatus, statusLabel } from "@/lib/pipeline";
import { relativeTime } from "@/lib/time";
import type { Job, JobAction } from "@/lib/types";
import { Icon } from "./Icon";
import { JobActions } from "./JobActions";

function Progress({ job }: { job: Job }) {
  const lane = laneForStatus(job.status);
  const app = job.application;

  if (lane === "queued") {
    return <p className="card-note"><span className="pulse-dot" aria-hidden="true" />Waiting for the apply server</p>;
  }
  if (lane === "filling") {
    return (
      <div className="card-progress">
        <p className="card-note">{statusLabel(job.status)}</p>
        <div className="indeterminate" role="progressbar" aria-label={`${statusLabel(job.status)} for ${job.title}`}><span /></div>
      </div>
    );
  }
  if ((lane === "review" || lane === "applied") && app && (app.fields_detected ?? 0) > 0) {
    const detected = app.fields_detected ?? 0;
    const filled = app.fields_filled ?? 0;
    return (
      <div className="card-progress">
        <p className="card-note">
          <span className="num">{filled}</span> of <span className="num">{detected}</span> fields filled
          {(app.ai_questions_answered ?? 0) > 0 && <span className="ai-note"><Icon name="spark" size={12} />{app.ai_questions_answered} AI</span>}
        </p>
        <div className="meter" aria-hidden="true"><span style={{ width: `${Math.min(100, (filled / detected) * 100)}%` }} /></div>
      </div>
    );
  }
  if (lane === "attention" && app?.error_message) {
    return <p className="card-error">{app.error_message}</p>;
  }
  return null;
}

export function JobCard({
  job, busy, fresh, onOpen, onAction, now, index = 0,
}: {
  job: Job;
  busy?: JobAction;
  fresh?: boolean;
  onOpen: (job: Job) => void;
  onAction: (job: Job, action: JobAction) => void;
  now: Date;
  index?: number;
}) {
  const lane = laneForStatus(job.status);
  const when = lane === "discovered" ? job.discoveredAt : job.application?.status_updated_at ?? job.discoveredAt;
  const ats = job.application?.ats_platform;
  const showAts = !!ats && ats !== "generic" && ats.toLowerCase() !== job.source.toLowerCase();

  return (
    <article
      className={`card${fresh ? " is-fresh" : ""}`}
      data-lane={lane}
      style={{ ["--i" as string]: Math.min(index, 8) }}
    >
      <div className="card-top">
        <h3 className="card-title">
          <button type="button" className="card-hit" onClick={() => onOpen(job)}>
            {job.title}
          </button>
        </h3>
        {when && <time className="card-time" dateTime={when} title={new Date(when).toLocaleString()}>{relativeTime(when, now)}</time>}
      </div>
      <p className="card-company">{job.company}</p>
      <p className="card-location"><Icon name="pin" size={13} />{job.location}</p>
      <div className="chips">
        <span className="chip">{job.source}</span>
        {job.isInternship && <span className="chip chip-intern">Internship</span>}
        {showAts && <span className="chip chip-ats" title="Application form">{ats}</span>}
      </div>
      <Progress job={job} />
      <JobActions job={job} busy={busy} onAction={onAction} compact />
    </article>
  );
}
