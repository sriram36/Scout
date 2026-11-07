"use client";

import { useState, useEffect, useCallback } from "react";
import type { JSX } from "react";
import { pickApplication } from "../lib/pickApplication";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

const LOCAL_API = process.env.NEXT_PUBLIC_LOCAL_API || "http://localhost:3001";
const PAGE_SIZE = 20;

// ─── Types ────────────────────────────────────────────────────────────────────

interface Application {
  id: string;
  status: string;
  ats_platform?: string;
  fields_filled?: number;
  fields_skipped?: number;
  ai_questions_answered?: number;
  error_message?: string;
  fill_report?: Record<string, unknown>;
  started_at?: string;
  completed_at?: string;
}

interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  source: string;
  postedAt: string;
  url: string;
  tags: string[];
  status: string;
  application?: Application;
}

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  Discovered:           "New",
  pending_application:  "Queued",
  applying:             "Launching...",
  application_opened:   "Opened",
  form_analyzed:        "Analyzing",
  autofill_completed:   "Filled ✓",
  awaiting_review:      "Review",
  submitted:            "Applied ✓",
  failed:               "Error",
};

const STATUS_COLORS: Record<string, string> = {
  Discovered:          "status-new",
  pending_application: "status-queued",
  applying:            "status-active",
  application_opened:  "status-active",
  form_analyzed:       "status-active",
  autofill_completed:  "status-success",
  awaiting_review:     "status-review",
  submitted:           "status-applied",
  failed:              "status-error",
};

function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABELS[status] || status;
  const cls = STATUS_COLORS[status] || "status-new";
  return <span className={`status-badge ${cls}`}>{label}</span>;
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function Icon({ name }: { name: string }) {
  const icons: Record<string, JSX.Element> = {
    spark:     <svg viewBox="0 0 24 24"><path d="m12 3 1.9 4.8L18.7 9.7 13.9 12l-1.9 4.8L10.1 12 5.3 9.7l4.8-1.9L12 3Z" /></svg>,
    briefcase: <svg viewBox="0 0 24 24"><path d="M9 6V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1h4a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4Zm2-1v1h2V5h-2Zm-6 5v8h14v-8H5Z" /></svg>,
    clock:     <svg viewBox="0 0 24 24"><path d="M12 4a8 8 0 1 0 8 8 8.01 8.01 0 0 0-8-8Zm0 2a6 6 0 1 1-6 6 6 6 0 0 1 6-6Zm-.5 2.5v4.25l3.25 1.9.75-1.23-2.5-1.47V8.5h-1.5Z" /></svg>,
    pin:       <svg viewBox="0 0 24 24"><path d="M12 3a6 6 0 0 0-6 6c0 4.2 6 12 6 12s6-7.8 6-12a6 6 0 0 0-6-6Zm0 8.2a2.2 2.2 0 1 1 2.2-2.2A2.2 2.2 0 0 1 12 11.2Z" /></svg>,
    arrow:     <svg viewBox="0 0 24 24"><path d="M13.5 6 12 7.4 15.6 11H5v2h10.6L12 16.6 13.5 18l6-6-6-6Z" /></svg>,
    settings:  <svg viewBox="0 0 24 24"><path d="m19.4 13 .1-1-.1-1 2.1-1.6-2-3.5-2.5.8a7.8 7.8 0 0 0-1.7-1L15 4h-4l-.3 1.7a7.8 7.8 0 0 0-1.7 1L6.5 5.9l-2 3.5L6.6 11l-.1 1 .1 1-2.1 1.6 2 3.5 2.5-.8a7.8 7.8 0 0 0 1.7 1L11 20h4l.3-1.7a7.8 7.8 0 0 0 1.7-1l2.5.8 2-3.5-2.1-1.6ZM13 14.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z" /></svg>,
    search:    <svg viewBox="0 0 24 24"><path d="m19.6 18.2-4.3-4.3a6.5 6.5 0 1 0-1.4 1.4l4.3 4.3 1.4-1.4ZM5.5 10a4.5 4.5 0 1 1 4.5 4.5A4.5 4.5 0 0 1 5.5 10Z" /></svg>,
    grid:      <svg viewBox="0 0 24 24"><path d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z" /></svg>,
    report:    <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm4 18H6V4h7v5h5v11ZM8 15h8v2H8v-2Zm0-4h8v2H8v-2Z" /></svg>,
    refresh:   <svg viewBox="0 0 24 24"><path d="M17.6 6.4A8 8 0 1 0 19.9 13H18a6 6 0 1 1-1.7-5.2L14 10h6V4l-2.4 2.4Z" /></svg>,
    check:     <svg viewBox="0 0 24 24"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17Z" /></svg>,
    warning:   <svg viewBox="0 0 24 24"><path d="M12 2 1 21h22L12 2Zm0 3.5L20.5 19H3.5L12 5.5ZM11 10v4h2v-4h-2Zm0 6v2h2v-2h-2Z" /></svg>,
    ai:        <svg viewBox="0 0 24 24"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2Zm-1 14H9V8h2v8Zm5-3h-2V8h2v5Z" /></svg>,
  };
  return <span className="icon">{icons[name] || icons.spark}</span>;
}

// ─── Fill Report Modal ────────────────────────────────────────────────────────

function FillReportModal({ app, onClose }: { app: Application; onClose: () => void }) {
  const report = app.fill_report as any;
  if (!report) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Fill Report</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="report-stats">
            <div className="rstat"><span className="rstat-num green">{report.filled ?? 0}</span><span>Filled</span></div>
            <div className="rstat"><span className="rstat-num orange">{report.skipped ?? 0}</span><span>Skipped</span></div>
            <div className="rstat"><span className="rstat-num blue">{report.aiGenerated ?? 0}</span><span>AI answers</span></div>
            <div className="rstat"><span className="rstat-num red">{report.errors ?? 0}</span><span>Errors</span></div>
          </div>

          {report.stageBreakdown && (
            <div className="stage-breakdown">
              <h4>How fields were matched</h4>
              <div className="stages">
                {Object.entries(report.stageBreakdown as Record<string, number>).map(([stage, count]) => (
                  count > 0 && <div key={stage} className="stage-item">
                    <span className="stage-label">{stage}</span>
                    <div className="stage-bar"><div style={{ width: `${Math.min(100, (count / report.total) * 100)}%` }} /></div>
                    <span className="stage-count">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {app.ats_platform && (
            <div className="report-ats">
              <span className="ats-badge">{app.ats_platform.toUpperCase()}</span>
            </div>
          )}

          {app.error_message && (
            <div className="error-notice">
              <Icon name="warning" /> {app.error_message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Job Row ──────────────────────────────────────────────────────────────────

function JobRow({
  job,
  onAutofill,
  onRetry,
  onViewReport,
  isLoading,
  statusMsg,
}: {
  job: Job;
  onAutofill: () => void;
  onRetry: () => void;
  onViewReport: () => void;
  isLoading: boolean;
  statusMsg: string | null;
}) {
  const app = job.application;
  const canAutofill  = job.status === "Discovered";
  const canRetry     = job.status === "failed";
  const canViewReport = !!app?.fill_report;
  const isActive     = ["applying", "application_opened", "form_analyzed"].includes(job.status);

  return (
    <article className="job-row">
      <div className="company-logo">{job.company.slice(0, 1)}</div>
      <div className="job-info">
        <div className="job-title-line">
          <h3>{job.title}</h3>
          <span className="posted">{job.postedAt}</span>
        </div>
        <p className="company-name">{job.company}</p>
        <div className="job-details">
          <span><Icon name="pin" />{job.location}</span>
          <span className="source-tag">{job.source}</span>
          {app?.ats_platform && <span className="ats-tag">{app.ats_platform}</span>}
        </div>
        {app && (app.fields_filled !== undefined) && (
          <div className="fill-stats">
            <span className="fill-stat green"><Icon name="check" />{app.fields_filled} filled</span>
            <span className="fill-stat orange">{app.fields_skipped} skipped</span>
            {(app.ai_questions_answered || 0) > 0 && (
              <span className="fill-stat blue"><Icon name="ai" />{app.ai_questions_answered} AI</span>
            )}
          </div>
        )}
      </div>
      <div className="job-action">
        <StatusBadge status={job.status} />
        <div className="action-buttons">
          {canAutofill && (
            <button id={`autofill-${job.id}`} className="btn-primary" onClick={onAutofill} disabled={isLoading}>
              {isLoading ? "Launching..." : statusMsg || "Auto-fill"}
              <Icon name="arrow" />
            </button>
          )}
          {canRetry && (
            <button id={`retry-${job.id}`} className="btn-retry" onClick={onRetry} disabled={isLoading}>
              <Icon name="refresh" /> Retry
            </button>
          )}
          {isActive && (
            <span className="active-pulse">Processing…</span>
          )}
          {canViewReport && (
            <button id={`report-${job.id}`} className="btn-report" onClick={onViewReport}>
              <Icon name="report" /> Report
            </button>
          )}
          {job.url && (
            <a href={job.url} target="_blank" rel="noopener noreferrer" className="btn-link">
              View Job ↗
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const [jobs, setJobs]             = useState<Job[]>([]);
  const [loadingId, setLoadingId]   = useState<string | null>(null);
  const [statusMsgs, setStatusMsgs] = useState<Record<string, string>>({});
  const [page, setPage]             = useState(0);
  const [hasMore, setHasMore]       = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [reportApp, setReportApp]   = useState<Application | null>(null);
  const [search, setSearch]         = useState("");
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);
  const [profileName, setProfileName] = useState("Loading...");

  // Fetch profile name from local server
  useEffect(() => {
    fetch(`${LOCAL_API}/profile`)
      .then(r => r.json())
      .then(d => setProfileName(d.name || "Candidate"))
      .catch(() => setProfileName("Candidate"));
    fetch(`${LOCAL_API}/health`)
      .then(r => r.ok ? setServerOnline(true) : setServerOnline(false))
      .catch(() => setServerOnline(false));
  }, []);

  const fetchJobs = useCallback(async (reset = false) => {
    if (!hasMore && !reset) return;
    setIsRefreshing(true);
    try {
      const from = reset ? 0 : page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error } = await supabase
        .from("listings")
        .select(`*, applications(id, status, ats_platform, fields_filled, fields_skipped, ai_questions_answered, error_message, fill_report, started_at, completed_at)`)
        .order("discovered_at", { ascending: false })
        .range(from, to);

      if (error) throw error;

      const formatted: Job[] = (data || []).map((job: any) => {
        const app = pickApplication(job.applications);
        return {
          id:       job.id,
          title:    job.title || "Unknown Role",
          company:  job.company || "Unknown Company",
          location: job.location || "Remote",
          source:   job.source || "Unknown",
          postedAt: job.posted_date ? new Date(job.posted_date).toLocaleDateString() : "Recent",
          url:      job.apply_url || job.canonical_url,
          tags:     job.is_internship ? ["Internship"] : [],
          status:   app?.status || "Discovered",
          application: app || undefined,
        };
      });

      setJobs(prev => reset ? formatted : [...prev, ...formatted]);
      setPage(reset ? 1 : p => p + 1);
      setHasMore((data?.length ?? 0) === PAGE_SIZE);
    } catch (err) {
      console.warn("Could not fetch jobs:", err);
    } finally {
      setIsRefreshing(false);
    }
  }, [page, hasMore]);

  useEffect(() => { fetchJobs(true); }, []);

  // Real-time updates via Supabase subscriptions
  useEffect(() => {
    const channel = supabase
      .channel("applications-updates")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "applications" }, () => {
        fetchJobs(true);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const triggerAutofill = async (job: Job) => {
    setLoadingId(job.id);
    setStatusMsgs(prev => ({ ...prev, [job.id]: "" }));
    try {
      const app = job.application;
      const queuedAt = new Date().toISOString();
      // supabase-js returns { error } instead of throwing, so check it explicitly.
      const { error } = app?.id
        ? await supabase.from("applications").update({ status: "pending_application", status_updated_at: queuedAt }).eq("id", app.id)
        : await supabase.from("applications").insert({ listing_id: job.id, status: "pending_application", status_updated_at: queuedAt });
      if (error) throw error;
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: "pending_application" } : j));
      setStatusMsgs(prev => ({ ...prev, [job.id]: "Queued!" }));
    } catch (err) {
      setStatusMsgs(prev => ({ ...prev, [job.id]: (err as { message?: string })?.message || "Error" }));
    } finally {
      setLoadingId(null);
      setTimeout(() => setStatusMsgs(prev => { const n = { ...prev }; delete n[job.id]; return n; }), 4000);
    }
  };

  const retryJob = async (job: Job) => {
    setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: "Discovered" } : j));
    if (job.application?.id) {
      const { error } = await supabase
        .from("applications")
        .update({ status: "Discovered", error_message: null, status_updated_at: new Date().toISOString() })
        .eq("id", job.application.id);
      if (error) {
        console.warn("Could not reset application:", error.message);
        fetchJobs(true); // undo the optimistic update
      }
    }
  };

  const filteredJobs = jobs.filter(j =>
    !search ||
    j.title.toLowerCase().includes(search.toLowerCase()) ||
    j.company.toLowerCase().includes(search.toLowerCase())
  );

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const counts = {
    total:   jobs.length,
    new:     jobs.filter(j => j.status === "Discovered").length,
    applied: jobs.filter(j => ["submitted", "autofill_completed", "awaiting_review"].includes(j.status)).length,
    failed:  jobs.filter(j => j.status === "failed").length,
  };

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><Icon name="spark" /></span>
          <span>scout<span className="brand-dot">.</span></span>
        </div>
        <div className="workspace">
          <div className="workspace-avatar">{(profileName || "?").substring(0, 2).toUpperCase()}</div>
          <div>
            <small>WORKSPACE</small>
            <strong>{profileName ? `${profileName.split(" ")[0]}'s search` : "My search"}</strong>
          </div>
        </div>
        <nav className="nav-list" aria-label="Main navigation">
          <p className="nav-label">Command center</p>
          <a className="nav-item active" href="#overview"><Icon name="grid" />Overview</a>
          <a className="nav-item" href="#tracker"><Icon name="briefcase" />Tracker<span className="nav-count">{counts.total}</span></a>
          <a className="nav-item" href="#applied"><Icon name="check" />Applied<span className="nav-count">{counts.applied}</span></a>
          <p className="nav-label nav-label-space">Manage</p>
          <a className="nav-item" href="#preferences"><Icon name="settings" />Preferences</a>
        </nav>
        <div className="sidebar-bottom">
          <div className={`service-status ${serverOnline === true ? "online" : serverOnline === false ? "offline" : ""}`}>
            <span className="status-dot" />
            <div>
              <strong>Automation service</strong>
              <small>{serverOnline === true ? "Connected" : serverOnline === false ? "Offline — start server.js" : "Checking..."}</small>
            </div>
          </div>
          <div className="profile">
            <div className="profile-avatar">{(profileName || "?").substring(0, 2).toUpperCase()}</div>
            <div><strong>{profileName}</strong><small>Active candidate</small></div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="main-content" id="overview">
        <header className="topbar">
          <div className="topbar-actions">
            <label className="search-box">
              <Icon name="search" />
              <input
                aria-label="Search jobs"
                placeholder="Search by title or company..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </label>
            <button
              id="refresh-btn"
              className="icon-button"
              aria-label="Refresh jobs"
              onClick={() => fetchJobs(true)}
              disabled={isRefreshing}
            >
              <Icon name="refresh" />
            </button>
          </div>
        </header>

        <section className="welcome">
          <div>
            <p className="eyebrow">{today}</p>
            <h1>Your search, in motion<span className="brand-dot">.</span></h1>
            <p className="welcome-copy">AI-powered application copilot — smart, safe, human-in-the-loop.</p>
          </div>
          <button id="view-tracker-btn" className="primary-button" onClick={() => document.getElementById("tracker")?.scrollIntoView({ behavior: "smooth" })}>
            <Icon name="spark" />View Tracker
          </button>
        </section>

        {/* Stats */}
        <section className="stats-grid" aria-label="Search statistics" id="overview">
          <div className="stat-card stat-violet">
            <div className="stat-top"><span className="stat-label">Discovered</span><span className="stat-icon"><Icon name="briefcase" /></span></div>
            <div className="stat-value">{counts.new}</div>
            <div className="stat-footer"><span className="stat-change">Ready to auto-fill</span></div>
          </div>
          <div className="stat-card stat-blue">
            <div className="stat-top"><span className="stat-label">Applied / In-progress</span><span className="stat-icon"><Icon name="spark" /></span></div>
            <div className="stat-value">{counts.applied}</div>
            <div className="stat-footer"><span className="stat-change">Keep the momentum</span></div>
          </div>
          <div className="stat-card stat-pink">
            <div className="stat-top"><span className="stat-label">Failed</span><span className="stat-icon"><Icon name="warning" /></span></div>
            <div className="stat-value">{counts.failed}</div>
            <div className="stat-footer"><span className={`stat-change ${counts.failed > 0 ? "warn" : ""}`}>{counts.failed > 0 ? "Click Retry to re-run" : "All clear"}</span></div>
          </div>
        </section>

        {/* Job Tracker */}
        <section className="tracker-panel" id="tracker">
          <div className="section-heading">
            <div>
              <h2>Job Tracker</h2>
              <p>Live matching roles from your discovery pipeline.</p>
            </div>
            <button id="refresh-jobs-btn" className="btn-secondary" onClick={() => fetchJobs(true)} disabled={isRefreshing}>
              <Icon name="refresh" />{isRefreshing ? "Scanning..." : "Refresh"}
            </button>
          </div>

          <div className="job-list">
            {filteredJobs.length === 0 && !isRefreshing && (
              <div className="empty-state">
                <Icon name="briefcase" />
                <p>{search ? "No jobs match your search." : "No jobs discovered yet. Run your n8n workflow to populate the pipeline."}</p>
              </div>
            )}
            {filteredJobs.map(job => (
              <JobRow
                key={job.id}
                job={job}
                onAutofill={() => triggerAutofill(job)}
                onRetry={() => retryJob(job)}
                onViewReport={() => setReportApp(job.application || null)}
                isLoading={loadingId === job.id}
                statusMsg={statusMsgs[job.id] || null}
              />
            ))}
          </div>

          {hasMore && (
            <div className="load-more">
              <button id="load-more-btn" className="btn-secondary" onClick={() => fetchJobs()} disabled={isRefreshing}>
                {isRefreshing ? "Loading..." : "Load More"}
              </button>
            </div>
          )}
        </section>

        <footer className="footer">
          <span>Scout — AI Job Application Copilot</span>
          <span>Human-in-the-loop. Safe. Explainable.</span>
        </footer>
      </main>

      {/* Fill Report Modal */}
      {reportApp && <FillReportModal app={reportApp} onClose={() => setReportApp(null)} />}
    </div>
  );
}
