"use client";

import { useEffect, useRef, useState } from "react";
import { laneForStatus } from "@/lib/pipeline";
import { normalizeReport } from "@/lib/normalize";
import { buildTimeline } from "@/lib/timeline";
import { formatDateTime, relativeTime } from "@/lib/time";
import type { Job, JobAction, SkippedDetail } from "@/lib/types";
import { Icon } from "./Icon";
import { JobActions, StageBadge } from "./JobActions";
import { FillReportView } from "./FillReport";

const FOCUSABLE = 'a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])';

export function Drawer({
  job, busy, meanings, taught, onClose, onAction, onTeach, now,
}: {
  job: Job;
  busy?: JobAction;
  meanings: string[];
  taught: Record<string, string>;
  onClose: () => void;
  onAction: (job: Job, action: JobAction) => void;
  onTeach: (job: Job, item: SkippedDetail & { signature: string }, meaning: string) => Promise<void>;
  now: Date;
}) {
  const panel = useRef<HTMLElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [scrolled, setScrolled] = useState(false);

  // Show a compact title in the sticky bar once the big title scrolls away.
  useEffect(() => {
    const el = titleRef.current;
    if (!el || !panel.current || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setScrolled(!entry.isIntersecting), { root: panel.current, rootMargin: "-56px 0px 0px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [job.id]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key !== "Tab" || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(el => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    document.body.classList.add("no-scroll");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("no-scroll");
      previous?.focus?.();
    };
  }, [onClose]);

  const app = job.application;
  const lane = laneForStatus(job.status);
  const report = normalizeReport(app?.fill_report);
  const timeline = buildTimeline(job);

  return (
    <div className="drawer-root">
      <button type="button" className="drawer-backdrop" aria-label="Close details" tabIndex={-1} onClick={onClose} />
      <aside ref={panel} className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" data-lane={lane}>
        <div className={`drawer-topline${scrolled ? " is-scrolled" : ""}`}>
          <StageBadge status={job.status} />
          <p className="drawer-mini" aria-hidden="true">{job.title}, {job.company}</p>
          <button ref={closeBtn} type="button" className="icon-btn" onClick={onClose} aria-label="Close details">
            <Icon name="close" />
          </button>
        </div>
        <header className="drawer-head">
          <p className="drawer-company">{job.company}</p>
          <h2 id="drawer-title" ref={titleRef} className="drawer-title">{job.title}</h2>
          <dl className="facts">
            <div><dt>Location</dt><dd>{job.location}</dd></div>
            <div><dt>Source</dt><dd>{job.source}</dd></div>
            {job.salary && <div><dt>Pay</dt><dd>{job.salary}</dd></div>}
            {app?.ats_platform && <div><dt>Form</dt><dd className="cap">{app.ats_platform}</dd></div>}
            <div><dt>Found</dt><dd>{relativeTime(job.discoveredAt, now) || "–"}</dd></div>
            {job.isInternship && <div><dt>Type</dt><dd>Internship</dd></div>}
          </dl>
          <div className="drawer-actions">
            <JobActions job={job} busy={busy} onAction={onAction} withSecondary />
            {job.url && (
              <a className="btn btn-secondary" href={job.url} target="_blank" rel="noopener noreferrer">
                <Icon name="external" size={15} />Open posting
              </a>
            )}
          </div>
          {lane === "review" && (
            <p className="drawer-callout">
              Scout filled the form and stopped before submitting. Check it in the browser window, submit it yourself, then mark it as submitted here.
            </p>
          )}
        </header>

        <div className="drawer-body">
          <section className="drawer-section" aria-labelledby="sec-progress">
            <h3 id="sec-progress">Progress</h3>
            <ol className="timeline">
              {timeline.map(step => (
                <li key={step.key} className={`tl-step is-${step.state}`}>
                  <span className="tl-node" aria-hidden="true" />
                  <div className="tl-text">
                    <span className="tl-label">{step.label}</span>
                    {step.at && <time dateTime={step.at}>{formatDateTime(step.at)}</time>}
                    {step.detail && <p className="tl-detail">{step.detail}</p>}
                  </div>
                  <span className="sr-only">{step.state === "done" ? "done" : step.state === "current" ? "current step" : step.state === "failed" ? "failed" : "not reached"}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="drawer-section" aria-labelledby="sec-report">
            <h3 id="sec-report">Fill report</h3>
            {report ? (
              <FillReportView
                job={job}
                report={report}
                meanings={meanings}
                taught={taught}
                onTeach={(item, meaning) => onTeach(job, item, meaning)}
              />
            ) : (
              <p className="muted-note">
                {lane === "discovered" ? "Choose Auto-fill and Scout will report here which fields it filled and which it left for you."
                  : lane === "queued" || lane === "filling" ? "The report appears here as soon as the browser finishes the form."
                  : "No fill report was saved for this application."}
              </p>
            )}
          </section>

          <section className="drawer-section" aria-labelledby="sec-about">
            <h3 id="sec-about">About the role</h3>
            {job.description ? <div className="description">{job.description}</div> : <p className="muted-note">The posting had no description.</p>}
          </section>
        </div>
      </aside>
    </div>
  );
}
