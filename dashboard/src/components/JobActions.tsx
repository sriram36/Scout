"use client";

import { availableActions, laneForStatus, statusLabel } from "@/lib/pipeline";
import type { Job, JobAction } from "@/lib/types";
import { Icon } from "./Icon";

/**
 * On cards, only "Mark submitted" is drawn in the accent colour: the accent means
 * "this needs you". In the drawer every primary action is emphasised.
 */
const ACTION_COPY: Record<JobAction, { label: string; busy: string; icon: string; card: "primary" | "secondary" | "quiet"; secondary?: boolean }> = {
  autofill: { label: "Auto-fill", busy: "Queuing…", icon: "play", card: "secondary" },
  submit: { label: "Mark submitted", busy: "Saving…", icon: "check", card: "primary" },
  retry: { label: "Retry", busy: "Queuing…", icon: "retry", card: "secondary" },
  dismiss: { label: "Move to Discovered", busy: "Moving…", icon: "undo", card: "quiet", secondary: true },
};

export function StageBadge({ status }: { status: string }) {
  const lane = laneForStatus(status);
  return (
    <span className="stage-badge" data-lane={lane}>
      <span className="stage-dot" aria-hidden="true" />
      {statusLabel(status)}
    </span>
  );
}

export function JobActions({
  job, busy, onAction, compact = false, withSecondary = false,
}: {
  job: Job;
  busy?: JobAction;
  onAction: (job: Job, action: JobAction) => void;
  compact?: boolean;
  withSecondary?: boolean;
}) {
  const actions = availableActions(job.status).filter(a => withSecondary || !ACTION_COPY[a].secondary);
  if (!actions.length) return null;
  return (
    <div className="job-actions">
      {actions.map(action => {
        const copy = ACTION_COPY[action];
        const tone = compact ? copy.card : copy.secondary ? "quiet" : "primary";
        const isBusy = busy === action;
        return (
          <button
            key={action}
            type="button"
            className={`btn btn-${tone}${compact ? " btn-sm" : ""}`}
            data-action={action}
            onClick={e => { e.stopPropagation(); onAction(job, action); }}
            disabled={!!busy}
            aria-label={compact ? `${copy.label}: ${job.title} at ${job.company}` : undefined}
          >
            {isBusy ? <span className="spinner" aria-hidden="true" /> : <Icon name={copy.icon} size={compact ? 14 : 15} />}
            {isBusy ? copy.busy : copy.label}
          </button>
        );
      })}
    </div>
  );
}
