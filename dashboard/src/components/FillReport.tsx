"use client";

import { useState } from "react";
import { meaningLabel, teachableSkipped } from "@/lib/corrections";
import type { FillReport as Report, Job, SkippedDetail } from "@/lib/types";
import { Icon } from "./Icon";

const STAGES: { key: keyof Report["stageBreakdown"]; label: string }[] = [
  { key: "learned", label: "Learned from your corrections" },
  { key: "deterministic", label: "Matched by rule" },
  { key: "semantic", label: "Matched by similarity" },
  { key: "llm", label: "Classified by AI" },
];
const STAGE_BY_NUMBER = ["learned", "deterministic", "semantic", "llm"] as const;
const STAGE_SHORT: Record<string, string> = { learned: "Learned", deterministic: "Rule", semantic: "Similarity", llm: "AI" };

function stageName(stage: unknown): string {
  if (typeof stage === "number") return STAGE_SHORT[STAGE_BY_NUMBER[stage] ?? ""] ?? "Other";
  if (typeof stage === "string") return STAGE_SHORT[stage] ?? stage;
  return "–";
}

function display(value: unknown): string {
  if (value == null || value === "") return "–";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function niceMeaning(meaning?: string) {
  if (!meaning || meaning === "unknown") return "Free-text answer";
  if (meaning === "protected") return "Protected field";
  return meaningLabel(meaning);
}

function TeachField({
  item, meanings, taughtAs, onTeach,
}: {
  item: SkippedDetail & { signature: string };
  meanings: string[];
  taughtAs?: string;
  onTeach: (meaning: string) => Promise<void>;
}) {
  const [choice, setChoice] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const name = item.label ?? item.field;
  const selectId = `teach-${item.signature.replace(/[^a-z0-9]/gi, "-")}`;

  if (taughtAs && !editing) {
    return (
      <div className="teach is-saved">
        <Icon name="check" size={14} />
        <span>Saved as <strong>{meaningLabel(taughtAs)}</strong></span>
        <button type="button" className="link-btn" onClick={() => { setEditing(true); setChoice(taughtAs); }}>Change</button>
      </div>
    );
  }

  const save = async () => {
    if (!choice) return;
    setState("saving");
    setError(null);
    try {
      await onTeach(choice);
      setState("idle");
      setEditing(false);
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Could not save the correction.");
    }
  };

  return (
    <div className="teach">
      <label className="sr-only" htmlFor={selectId}>What does “{name}” ask for?</label>
      <div className="teach-row">
        <select id={selectId} value={choice} onChange={e => setChoice(e.target.value)} disabled={state === "saving"}>
          <option value="">This field asks for…</option>
          {meanings.map(m => <option key={m} value={m}>{meaningLabel(m)}</option>)}
        </select>
        <button type="button" className="btn btn-sm btn-secondary" onClick={save} disabled={!choice || state === "saving"}>
          {state === "saving" ? <span className="spinner" aria-hidden="true" /> : <Icon name="teach" size={14} />}
          {state === "saving" ? "Saving…" : "Teach Scout"}
        </button>
      </div>
      {error && <p className="teach-error" role="alert">{error}</p>}
    </div>
  );
}

export function FillReportView({
  job, report, meanings, taught, onTeach,
}: {
  job: Job;
  report: Report;
  meanings: string[];
  taught: Record<string, string>;
  onTeach: (item: SkippedDetail & { signature: string }, meaning: string) => Promise<void>;
}) {
  const total = Math.max(report.total, report.filled + report.skipped + report.errors);
  const segments = [
    { key: "filled", label: "Filled", value: report.filled },
    { key: "skipped", label: "Skipped", value: report.skipped },
    { key: "errors", label: "Errors", value: report.errors },
  ];
  const stageMax = Math.max(1, ...STAGES.map(s => report.stageBreakdown[s.key]));
  const teachable = new Set(teachableSkipped(report).map(s => s.signature));
  const { filled, skipped, errors } = report.details;

  // A note with nothing else (e.g. Workday's sign-in wall): there are no fields to report.
  if (report.note && report.total === 0 && !report.hasDetails) {
    return (
      <div className="report">
        <div className="adapter-note" role="status"><Icon name="alert" size={15} /><p>{report.note}</p></div>
      </div>
    );
  }

  return (
    <div className="report">
      {report.note && (
        <div className="adapter-note" role="status"><Icon name="alert" size={15} /><p>{report.note}</p></div>
      )}
      <div className="report-summary">
        <p className="report-headline">
          <span className="num">{report.filled}</span>
          <span> of <span className="num">{total}</span> fields filled</span>
        </p>
        <div className="segbar" role="img" aria-label={segments.map(s => `${s.value} ${s.label.toLowerCase()}`).join(", ")}>
          {segments.filter(s => s.value > 0).map(s => (
            <span key={s.key} className={`seg seg-${s.key}`} style={{ flexGrow: s.value }} />
          ))}
        </div>
        <ul className="legend">
          {segments.map(s => (
            <li key={s.key}><span className={`swatch seg-${s.key}`} aria-hidden="true" />{s.label} <span className="num">{s.value}</span></li>
          ))}
          <li><Icon name="spark" size={13} />AI-written <span className="num">{report.aiGenerated}</span></li>
        </ul>
      </div>

      <div className="report-block">
        <h4>How fields were matched</h4>
        <ul className="stage-bars">
          {STAGES.map(s => (
            <li key={s.key}>
              <span className="stage-name">{s.label}</span>
              <span className="stage-track"><span style={{ width: `${(report.stageBreakdown[s.key] / stageMax) * 100}%` }} /></span>
              <span className="num">{report.stageBreakdown[s.key]}</span>
            </li>
          ))}
        </ul>
      </div>

      {!report.hasDetails && (
        <p className="report-note">This report was saved before Scout kept per-field details, so only the totals are available.</p>
      )}

      {skipped.length > 0 && (
        <div className="report-block">
          <h4>Skipped <span className="num">{skipped.length}</span></h4>
          <p className="block-hint">Scout leaves a field alone when it is unsure. Tell it what a field means and it will fill it next time.</p>
          <ul className="skipped-list">
            {skipped.map((s, i) => {
              const sig = typeof s.signature === "string" ? s.signature : "";
              return (
                <li key={`${s.field}-${i}`} className="skipped-item">
                  <div className="skipped-head">
                    <span className="field-name">{s.label ?? s.field}</span>
                    {s.reason && <span className="field-reason">{s.reason}</span>}
                  </div>
                  {sig && teachable.has(sig) && (
                    <TeachField
                      item={{ ...s, signature: sig }}
                      meanings={meanings}
                      taughtAs={taught[`${job.application?.id}:${sig}`]}
                      onTeach={meaning => onTeach({ ...s, signature: sig }, meaning)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {errors.length > 0 && (
        <div className="report-block">
          <h4>Errors <span className="num">{errors.length}</span></h4>
          <ul className="error-list">
            {errors.map((e, i) => (
              <li key={`${e.field}-${i}`}>
                <Icon name="alert" size={14} />
                <div><span className="field-name">{e.label ?? e.field}</span><span className="field-reason">{e.error ?? "Unknown error"}</span></div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {filled.length > 0 && (
        <div className="report-block">
          <h4>Filled <span className="num">{filled.length}</span></h4>
          <div className="filled-wrap">
            <table className="filled-table">
              <thead><tr><th>Field</th><th>Value</th><th>Matched by</th><th className="num-col">Conf.</th></tr></thead>
              <tbody>
                {filled.map((f, i) => (
                  <tr key={`${f.field}-${i}`}>
                    <td><span className="field-name">{f.label ?? f.field}</span><span className="field-meaning">{niceMeaning(f.meaning)}</span></td>
                    <td className="value-cell" title={display(f.value)}>{display(f.value)}</td>
                    <td>
                      <span className={`chip chip-stage${f.isAIGenerated ? " chip-ai" : ""}`}>
                        {f.isAIGenerated && <Icon name="spark" size={11} />}{f.isAIGenerated ? "AI-written" : stageName(f.stage)}
                      </span>
                    </td>
                    <td className="num-col num">{typeof f.confidence === "number" ? `${Math.round(f.confidence * 100)}%` : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
