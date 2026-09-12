"use client";

import { useState } from "react";

const INITIAL_JOBS = [
  { id: 1, title: "Senior Software Engineer, Platform", company: "Figma", location: "San Francisco, CA", salary: "$180k - $240k", source: "Himalayas", postedAt: "2h ago", url: "https://boards.greenhouse.io/figma/jobs/5426468004", tags: ["Node.js", "React", "WebGL"], color: "violet", status: "Discovered" },
  { id: 2, title: "Full Stack Developer", company: "Linear", location: "Remote", salary: "$160k - $210k", source: "Arbeitnow", postedAt: "5h ago", url: "https://linear.app/jobs/full-stack", tags: ["TypeScript", "GraphQL", "PostgreSQL"], color: "blue", status: "Discovered" },
  { id: 3, title: "Backend Engineer, Data", company: "Vercel", location: "Remote", salary: "$175k - $230k", source: "Adzuna", postedAt: "Yesterday", url: "https://vercel.com/careers/backend", tags: ["Rust", "Node.js", "AWS"], color: "pink", status: "Discovered" },
];

function Icon({ name }: { name: "grid" | "briefcase" | "spark" | "clock" | "settings" | "search" | "bell" | "arrow" | "pin" | "salary" | "chevron" }) {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    briefcase: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2" /></>,
    spark: <><path d="m12 3-1.4 5.6L5 10l5.6 1.4L12 17l1.4-5.6L19 10l-5.6-1.4L12 3Z" /><path d="m19 16-.6 2.4L16 19l2.4.6L19 22l.6-2.4L22 19l-2.4-.6L19 16Z" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 1.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-2.5V20a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1-1.8-1.8.1-.1A1.7 1.7 0 0 0 8 15a1.7 1.7 0 0 0-1.6-1H6v-2.5h.4A1.7 1.7 0 0 0 8 10a1.7 1.7 0 0 0-.3-1.9l-.1-.1 1.8-1.8.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6v-.2h2.5V5a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.8 1.8-.1.1A1.7 1.7 0 0 0 19 10c.2.6.8 1 1.4 1h.4v2.5h-.4a1.7 1.7 0 0 0-1.6 1.5Z" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    salary: <><circle cx="12" cy="12" r="9" /><path d="M15 9.5c-.5-.8-1.5-1.2-2.7-1.2-1.4 0-2.3.7-2.3 1.7 0 2.7 5 1 5 3.7 0 1-.9 1.8-2.4 1.8-1.2 0-2.2-.4-2.8-1.3M12 6.8v10.4" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function StatCard({ label, value, change, icon, accent }: { label: string; value: string; change: string; icon: "briefcase" | "spark" | "clock"; accent: string }) {
  return <div className="stat-card"><div className="stat-top"><span className={`stat-icon ${accent}`}><Icon name={icon} /></span><span className="stat-change">{change}</span></div><p>{label}</p><strong>{value}</strong></div>;
}

export default function Dashboard() {
  const [jobs, setJobs] = useState(INITIAL_JOBS);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ id: number; msg: string } | null>(null);

  const handleApply = async (id: number, url: string) => {
    setLoadingId(id); setStatusMsg(null);
    try {
      const res = await fetch(`http://localhost:3001/apply?url=${encodeURIComponent(url)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to trigger automation");
      
      setStatusMsg({ id, msg: "Browser opened" });
      
      // Update job tracker status
      setJobs(prev => prev.map(job => job.id === id ? { ...job, status: "Applied" } : job));
      
    } catch (err) { 
      setStatusMsg({ id, msg: err instanceof Error ? err.message : "Something went wrong" }); 
    }
    finally { 
      setLoadingId(null); 
      setTimeout(() => setStatusMsg(null), 5000); 
    }
  };

  const renderJobList = (statusFilter: string) => {
    const filteredJobs = jobs.filter(j => j.status === statusFilter);
    if (filteredJobs.length === 0) {
      return <p style={{ color: "#666", padding: "1rem" }}>No jobs in this stage.</p>;
    }
    return (
      <div className="job-list">
        {filteredJobs.map((job) => (
          <article className="job-row" key={job.id}>
            <div className={`company-logo ${job.color}`}>{job.company.slice(0, 1)}</div>
            <div className="job-info">
              <div className="job-title-line">
                <h3>{job.title}</h3>
                <span className="posted">{job.postedAt}</span>
              </div>
              <p className="company-name">{job.company}</p>
              <div className="job-details">
                <span><Icon name="pin" />{job.location}</span>
                <span><Icon name="salary" />{job.salary}</span>
              </div>
              <div className="tag-list">
                {job.tags.map(tag => <span key={tag}>{tag}</span>)}
              </div>
            </div>
            <div className="job-action">
              <span className="source">{job.status}</span>
              {job.status === "Discovered" ? (
                <button className="apply-button" onClick={() => handleApply(job.id, job.url)} disabled={loadingId === job.id}>
                  {loadingId === job.id ? "Launching..." : statusMsg?.id === job.id ? statusMsg.msg : "Auto-fill"}
                  <Icon name="arrow" />
                </button>
              ) : (
                <button className="apply-button" style={{ background: "#4caf50", color: "#fff" }}>
                  Review App <Icon name="arrow" />
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    );
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><Icon name="spark" /></span><span>scout<span className="brand-dot">.</span></span></div>
        <div className="workspace"><div className="workspace-avatar">AS</div><div><small>WORKSPACE</small><strong>Alex&apos;s search</strong></div><Icon name="chevron" /></div>
        <nav className="nav-list" aria-label="Main navigation">
          <p className="nav-label">Command center</p>
          <a className="nav-item active" href="#overview"><Icon name="grid" />Overview</a>
          <a className="nav-item" href="#opportunities"><Icon name="briefcase" />Tracker<span className="nav-count">{jobs.length}</span></a>
          <a className="nav-item" href="#activity"><Icon name="clock" />Activity</a>
          <p className="nav-label nav-label-space">Manage</p>
          <a className="nav-item" href="#preferences"><Icon name="settings" />Preferences</a>
        </nav>
        <div className="sidebar-bottom">
          <div className="service-status"><span className="status-dot" /><div><strong>Automation service</strong><small>Connected and ready</small></div></div>
          <div className="profile"><div className="profile-avatar">AS</div><div><strong>Alex Smith</strong><small>alex@example.com</small></div><Icon name="chevron" /></div>
        </div>
      </aside>

      <main className="main-content" id="overview">
        <header className="topbar">
          <div className="mobile-brand brand"><span className="brand-mark"><Icon name="spark" /></span><span>scout<span className="brand-dot">.</span></span></div>
          <div className="topbar-actions">
            <label className="search-box"><Icon name="search" /><input aria-label="Search opportunities" placeholder="Search opportunities..." /></label>
            <button className="icon-button" aria-label="Notifications"><Icon name="bell" /><span className="notification-dot" /></button>
            <div className="top-avatar">AS</div>
          </div>
        </header>

        <section className="welcome">
          <div>
            <p className="eyebrow">Monday, September 12, 2026</p>
            <h1>Your search, in motion<span className="heading-dot">.</span></h1>
            <p className="welcome-copy">Keep your best opportunities, applications, and next steps in one place.</p>
          </div>
          <button className="primary-button" onClick={() => document.getElementById("opportunities")?.scrollIntoView({ behavior: "smooth" })}><Icon name="spark" />View Tracker</button>
        </section>

        <section className="stats-grid" aria-label="Search statistics">
          <StatCard label="Jobs discovered" value={jobs.filter(j => j.status === 'Discovered').length.toString()} change="Ready to review" icon="briefcase" accent="violet" />
          <StatCard label="Applications sent" value={jobs.filter(j => j.status === 'Applied').length.toString()} change="+1 today" icon="spark" accent="blue" />
          <StatCard label="Response rate" value="38%" change="+6.4%" icon="clock" accent="pink" />
        </section>

        <section className="content-grid">
          <div className="opportunities-panel" id="opportunities">
            <div className="section-heading">
              <div><h2>Job Tracker</h2><p>Track your applications through the pipeline.</p></div>
            </div>
            
            <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#666", marginTop: "1rem", marginBottom: "0.5rem" }}>Discovered</h3>
            {renderJobList("Discovered")}
            
            <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#666", marginTop: "2rem", marginBottom: "0.5rem" }}>Applied</h3>
            {renderJobList("Applied")}
            
          </div>

          <aside className="activity-panel" id="activity">
            <div className="section-heading">
              <div><h2>Next steps</h2><p>Stay on top of your search momentum.</p></div>
              <button className="more-button" aria-label="More activity">...</button>
            </div>
            <div className="timeline">
              <div className="timeline-item"><span className="timeline-icon success"><Icon name="spark" /></span><div><strong>Application launched</strong><p>Senior Software Engineer at Figma</p><time>Today, 9:42 AM</time></div></div>
              <div className="timeline-item"><span className="timeline-icon blue"><Icon name="briefcase" /></span><div><strong>New match found</strong><p>Full Stack Developer at Linear</p><time>Today, 8:15 AM</time></div></div>
              <div className="timeline-item"><span className="timeline-icon pink"><Icon name="clock" /></span><div><strong>Profile updated</strong><p>Your preferences are now active</p><time>Yesterday, 4:30 PM</time></div></div>
            </div>
            <button className="activity-link">See all activity <Icon name="arrow" /></button>
          </aside>
        </section>
        
        <footer className="footer"><span>Scout Automations</span><span>Built for a calmer job search.</span></footer>
      </main>
    </div>
  );
}
