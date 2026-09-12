"use client";

import { useState } from "react";

// Premium Mock Data
const MOCK_JOBS = [
  {
    id: 1,
    title: "Senior Software Engineer, Platform",
    company: "Figma",
    location: "San Francisco, CA (Hybrid)",
    salary: "$180k - $240k",
    source: "Himalayas",
    postedAt: "2 hours ago",
    url: "https://boards.greenhouse.io/figma/jobs/5426468004",
    tags: ["Node.js", "React", "WebGL"],
  },
  {
    id: 2,
    title: "Full Stack Developer",
    company: "Linear",
    location: "Remote",
    salary: "$160k - $210k",
    source: "Arbeitnow",
    postedAt: "5 hours ago",
    url: "https://linear.app/jobs/full-stack",
    tags: ["TypeScript", "GraphQL", "PostgreSQL"],
  },
  {
    id: 3,
    title: "Backend Engineer, Data",
    company: "Vercel",
    location: "Remote",
    salary: "$175k - $230k",
    source: "Adzuna",
    postedAt: "1 day ago",
    url: "https://vercel.com/careers/backend",
    tags: ["Rust", "Node.js", "AWS"],
  },
];

export default function Dashboard() {
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ id: number; msg: string } | null>(null);

  const handleApply = async (id: number, url: string) => {
    setLoadingId(id);
    setStatusMsg(null);
    try {
      const res = await fetch(`http://localhost:3001/apply?url=${encodeURIComponent(url)}`);
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || "Failed to trigger automation");
      
      setStatusMsg({ id, msg: "Browser opened!" });
    } catch (err: any) {
      setStatusMsg({ id, msg: err.message });
    } finally {
      setLoadingId(null);
      // Clear success msg after 5s
      setTimeout(() => setStatusMsg(null), 5000);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      {/* Header */}
      <header className="mb-12 text-center md:text-left flex flex-col md:flex-row justify-between items-center gap-6">
        <div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-2">
            Scout <span className="gradient-text">Automations</span>
          </h1>
          <p className="text-white/60 text-lg">
            Your personal, AI-powered job application pipeline.
          </p>
        </div>
        <div className="glass-card px-6 py-3 rounded-full flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-sm font-medium text-white/80">Playwright Service Active</span>
        </div>
      </header>

      {/* Stats/Filters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        {[
          { label: "Jobs Discovered", val: "3" },
          { label: "Auto-Filled Today", val: "1" },
          { label: "Success Rate", val: "100%" },
          { label: "Active Sources", val: "4" },
        ].map((stat, i) => (
          <div key={i} className="glass-card p-5 rounded-2xl text-center md:text-left transition-transform duration-300 hover:-translate-y-1">
            <p className="text-white/50 text-xs uppercase tracking-wider font-semibold mb-1">{stat.label}</p>
            <p className="text-2xl font-bold">{stat.val}</p>
          </div>
        ))}
      </div>

      {/* Job Feed */}
      <h2 className="text-2xl font-semibold mb-6 flex items-center gap-2">
        Opportunity Feed
        <span className="bg-white/10 text-white/80 text-xs px-2 py-1 rounded-md ml-2">Mock Data</span>
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {MOCK_JOBS.map((job) => (
          <div key={job.id} className="glass-card rounded-2xl p-6 flex flex-col h-full transition-all duration-300 hover:shadow-[0_8px_30px_rgba(139,92,246,0.12)]">
            <div className="flex justify-between items-start mb-4">
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white/5 text-white/70 border border-white/10">
                {job.source}
              </span>
              <span className="text-xs text-white/40">{job.postedAt}</span>
            </div>
            
            <h3 className="text-xl font-bold mb-1 line-clamp-2">{job.title}</h3>
            <p className="text-scout-primary font-medium mb-4">{job.company}</p>
            
            <div className="flex flex-col gap-2 mb-6 flex-grow">
              <div className="flex items-center gap-2 text-sm text-white/60">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {job.location}
              </div>
              <div className="flex items-center gap-2 text-sm text-white/60">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {job.salary}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mb-6">
              {job.tags.map(tag => (
                <span key={tag} className="text-xs px-2 py-1 bg-white/5 rounded-md text-white/60">{tag}</span>
              ))}
            </div>

            <div className="mt-auto pt-4 border-t border-white/10">
              <button
                onClick={() => handleApply(job.id, job.url)}
                disabled={loadingId === job.id}
                className="w-full relative group overflow-hidden rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all duration-300 py-3 px-4 font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {/* Background glow effect on hover */}
                <div className="absolute inset-0 bg-gradient-to-r from-scout-primary/20 to-scout-secondary/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                
                <span className="relative flex items-center gap-2">
                  {loadingId === job.id ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Launching Bot...
                    </>
                  ) : statusMsg?.id === job.id ? (
                    <span className={statusMsg.msg.includes("Failed") ? "text-red-400" : "text-emerald-400"}>
                      {statusMsg.msg}
                    </span>
                  ) : (
                    <>
                      <svg className="w-4 h-4 text-scout-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Auto-Fill Application
                    </>
                  )}
                </span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
