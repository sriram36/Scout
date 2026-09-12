"use client";

import { useState } from "react";

const INITIAL_JOBS = [
  { id: 1, title: "Senior Software Engineer, Platform", company: "Figma", location: "San Francisco, CA", salary: "$180k - $240k", source: "Himalayas", postedAt: "2h ago", url: "https://boards.greenhouse.io/figma/jobs/5426468004", tags: ["Node.js", "React", "WebGL"], color: "violet", status: "Discovered" },
  { id: 2, title: "Full Stack Developer", company: "Linear", location: "Remote", salary: "$160k - $210k", source: "Arbeitnow", postedAt: "5h ago", url: "https://linear.app/jobs/full-stack", tags: ["TypeScript", "GraphQL", "PostgreSQL"], color: "blue", status: "Discovered" },
  { id: 3, title: "Backend Engineer, Data", company: "Vercel", location: "Remote", salary: "$175k - $230k", source: "Adzuna", postedAt: "Yesterday", url: "https://vercel.com/careers/backend", tags: ["Rust", "Node.js", "AWS"], color: "pink", status: "Discovered" },
];

function Icon({ name }: { name: string }) {
  if (name === "spark") return <svg viewBox="0 0 24 24" className="icon"><path d="m12 3 1.9 4.8L18.7 9.7 13.9 12l-1.9 4.8L10.1 12 5.3 9.7l4.8-1.9L12 3Z" /></svg>;
  if (name === "briefcase") return <svg viewBox="0 0 24 24" className="icon"><path d="M9 6V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1h4a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4Zm2-1v1h2V5h-2Zm-6 5v8h14v-8H5Z" /></svg>;
  if (name === "clock") return <svg viewBox="0 0 24 24" className="icon"><path d="M12 4a8 8 0 1 0 8 8 8.01 8.01 0 0 0-8-8Zm0 2a6 6 0 1 1-6 6 6 6 0 0 1 6-6Zm-.5 2.5v4.25l3.25 1.9.75-1.23-2.5-1.47V8.5h-1.5Z" /></svg>;
  if (name === "pin") return <svg viewBox="0 0 24 24" className="icon"><path d="M12 3a6 6 0 0 0-6 6c0 4.2 6 12 6 12s6-7.8 6-12a6 6 0 0 0-6-6Zm0 8.2a2.2 2.2 0 1 1 2.2-2.2A2.2 2.2 0 0 1 12 11.2Z" /></svg>;
  if (name === "salary") return <svg viewBox="0 0 24 24" className="icon"><path d="M12 4a8 8 0 1 0 8 8 8 8 0 0 0-8-8Zm1 11.9V17h-2v-1.1a4 4 0 0 1-2-1.3l1.4-1.4a2.3 2.3 0 0 0 1.6.8c.8 0 1.2-.4 1.2-.8s-.3-.7-1.4-1c-1.8-.4-2.8-1.2-2.8-2.6 0-1.2.9-2.2 2-2.5V6h2v1.1a3.8 3.8 0 0 1 1.7 1l-1.3 1.4a2 2 0 0 0-1.4-.6c-.7 0-1.1.3-1.1.7s.3.6 1.3.9c1.9.5 2.9 1.3 2.9 2.7 0 1.2-.8 2.3-2.1 2.6Z" /></svg>;
  if (name === "arrow") return <svg viewBox="0 0 24 24" className="icon"><path d="M13.5 6 12 7.4 15.6 11H5v2h10.6L12 16.6 13.5 18l6-6-6-6Z" /></svg>;
  if (name === "settings") return <svg viewBox="0 0 24 24" className="icon"><path d="m19.4 13 .1-1-.1-1 2.1-1.6-2-3.5-2.5.8a7.8 7.8 0 0 0-1.7-1L15 4h-4l-.3 1.7a7.8 7.8 0 0 0-1.7 1L6.5 5.9l-2 3.5L6.6 11l-.1 1 .1 1-2.1 1.6 2 3.5 2.5-.8a7.8 7.8 0 0 0 1.7 1L11 20h4l.3-1.7a7.8 7.8 0 0 0 1.7-1l2.5.8 2-3.5-2.1-1.6ZM13 14.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z" /></svg>;
  if (name === "search") return <svg viewBox="0 0 24 24" className="icon"><path d="m19.6 18.2-4.3-4.3a6.5 6.5 0 1 0-1.4 1.4l4.3 4.3 1.4-1.4ZM5.5 10a4.5 4.5 0 1 1 4.5 4.5A4.5 4.5 0 0 1 5.5 10Z" /></svg>;
  if (name === "bell") return <svg viewBox="0 0 24 24" className="icon"><path d="M12 4a5 5 0 0 0-5 5v3.4L5.6 14A1 1 0 0 0 6.3 16h11.4a1 1 0 0 0 .7-1.6L17 12.4V9a5 5 0 0 0-5-5Zm-2 13h4a2 2 0 0 1-4 0Z" /></svg>;
  if (name === "grid") return <svg viewBox="0 0 24 24" className="icon"><path d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z" /></svg>;
  return <svg viewBox="0 0 24 24" className="icon"><path d="m8.5 10 3.5 3.5 3.5-3.5 1.5 1.5-5 5-5-5 1.5-1.5Z" /></svg>;
}

function StatCard({ label, value, change, icon, accent }: { label: string; value: string; change: string; icon: string; accent: string }) {
  return (
    <div className={`stat-card stat-${accent}`}>
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        <span className="stat-icon"><Icon name={icon} /></span>
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-footer"><span className="stat-change">{change}</span></div>
    </div>
  );
}

export default function Dashboard() {
  const [jobs, setJobs] = useState(INITIAL_JOBS);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ id: number; msg: string } | null>(null);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

  const handleApply = async (id: number, url: string) => {
    setLoadingId(id); setStatusMsg(null);
    try {
      const res = await fetch(`${API_BASE}/apply?url=${encodeURIComponent(url)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to trigger automation");
      
      const successText = data.status === "AWAITING_HUMAN_REVIEW"
        ? (data.screenshot ? "Drafted in Cloud" : "Browser Opened")
        : "Applied";

      setStatusMsg({ id, msg: successText });
      
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
                <button className="apply-button" onClick={() => handleApply(job.id, job.url)} disabled={loadingId === id}>
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
