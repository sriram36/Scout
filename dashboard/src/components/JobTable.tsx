"use client";

import { sortJobs } from "@/lib/filters";
import { relativeTime } from "@/lib/time";
import type { Job, JobAction, SortKey } from "@/lib/types";
import { JobActions, StageBadge } from "./JobActions";
import { Icon } from "./Icon";

const COLUMNS: { key: SortKey | null; label: string; className?: string }[] = [
  { key: "title", label: "Role" },
  { key: "company", label: "Company" },
  { key: "stage", label: "Stage" },
  { key: null, label: "Source", className: "col-source" },
  { key: null, label: "Fields", className: "col-fields" },
  { key: "recent", label: "Found", className: "col-found" },
  { key: null, label: "Actions", className: "col-actions" },
];

export function JobTable({
  jobs, sort, onSort, busy, fresh, onOpen, onAction, now,
}: {
  jobs: Job[];
  sort: SortKey;
  onSort: (key: SortKey) => void;
  busy: Record<string, JobAction>;
  fresh: ReadonlySet<string>;
  onOpen: (job: Job) => void;
  onAction: (job: Job, action: JobAction) => void;
  now: Date;
}) {
  const rows = sortJobs(jobs, sort);
  return (
    <div className="table-wrap">
      <table className="job-table">
        <thead>
          <tr>
            {COLUMNS.map(col => (
              <th key={col.label} className={col.className} aria-sort={col.key && sort === col.key ? (col.key === "recent" ? "descending" : "ascending") : undefined}>
                {col.key ? (
                  <button type="button" className={`th-sort${sort === col.key ? " is-active" : ""}`} onClick={() => onSort(col.key!)}>
                    {col.label}
                    <Icon name="chevronDown" size={12} />
                  </button>
                ) : col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(job => {
            const app = job.application;
            return (
              <tr key={job.id} className={fresh.has(job.id) ? "is-fresh" : undefined}>
                <td className="col-role">
                  <button type="button" className="row-hit" onClick={() => onOpen(job)}>{job.title}</button>
                  {job.isInternship && <span className="chip chip-intern">Internship</span>}
                </td>
                <td className="col-company">{job.company}<span className="sub">{job.location}</span></td>
                <td><StageBadge status={job.status} /></td>
                <td className="col-source">{job.source}</td>
                <td className="col-fields num">{app && (app.fields_detected ?? 0) > 0 ? `${app.fields_filled ?? 0}/${app.fields_detected}` : "–"}</td>
                <td className="col-found">{relativeTime(job.discoveredAt, now)}</td>
                <td className="col-actions"><JobActions job={job} busy={busy[job.id]} onAction={onAction} compact /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
