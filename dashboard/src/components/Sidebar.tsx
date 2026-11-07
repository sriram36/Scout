"use client";

import type { Job, Profile, ServerState } from "@/lib/types";
import { LOCAL_API } from "@/lib/localApi";
import { bySource } from "@/lib/stats";
import { BrandMark, Icon } from "./Icon";

function initials(name?: string) {
  if (!name) return "?";
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]!.toUpperCase()).join("");
}

export function ServerBadge({ server }: { server: ServerState }) {
  const copy = {
    checking: { title: "Checking apply server", sub: LOCAL_API.replace(/^https?:\/\//, "") },
    online: { title: "Apply server online", sub: "" },
    offline: { title: "Apply server offline", sub: "Run npm start in the Scout folder" },
    demo: { title: "Demo", sub: "Sample data, nothing leaves this tab" },
  }[server.kind];
  const sub = server.kind === "online"
    ? [server.version && `v${server.version}`, server.headless === undefined ? null : server.headless ? "headless" : "visible browser"].filter(Boolean).join(", ")
    : copy.sub;
  return (
    <div className="server" data-state={server.kind} role="status">
      <span className="server-dot" aria-hidden="true" />
      <div>
        <strong>{copy.title}</strong>
        {sub && <span>{sub}</span>}
      </div>
    </div>
  );
}

export function Sidebar({
  profile, server, jobs, source, onSource, internshipOnly, onInternshipOnly, onOpenPalette, showFilters = true,
}: {
  showFilters?: boolean;
  profile: Profile | null;
  server: ServerState;
  jobs: Job[];
  source: string | null;
  onSource: (s: string | null) => void;
  internshipOnly: boolean;
  onInternshipOnly: (v: boolean) => void;
  onOpenPalette: () => void;
}) {
  const sources = bySource(jobs, 8).filter(s => s.source !== "Other");
  const internships = jobs.filter(j => j.isInternship).length;

  return (
    <aside className="sidebar" aria-label="Workspace">
      <div className="brand">
        <BrandMark />
        <span className="wordmark">scout</span>
      </div>

      <div className="who">
        <span className="avatar" aria-hidden="true">{initials(profile?.name)}</span>
        <div>
          <strong>{profile?.name ?? "Your profile"}</strong>
          <span>{profile?.location ?? (server.kind === "offline" ? "Profile loads from the apply server" : "")}</span>
        </div>
      </div>

      {showFilters && <div className="side-group" role="group" aria-label="Filter by source">
        <p className="side-label">Sources</p>
        <button type="button" className={`side-item${source === null ? " is-active" : ""}`} aria-pressed={source === null} onClick={() => onSource(null)}>
          <span className="side-swatch" aria-hidden="true" />All sources<span className="side-count num">{jobs.length}</span>
        </button>
        {sources.map(s => (
          <button key={s.source} type="button" className={`side-item${source === s.source ? " is-active" : ""}`} aria-pressed={source === s.source} onClick={() => onSource(source === s.source ? null : s.source)}>
            <span className="side-swatch" aria-hidden="true" />{s.source}<span className="side-count num">{s.count}</span>
          </button>
        ))}
        <label className="switch-row">
          <input type="checkbox" checked={internshipOnly} onChange={e => onInternshipOnly(e.target.checked)} />
          <span className="switch" aria-hidden="true" />
          Internships only<span className="side-count num">{internships}</span>
        </label>
      </div>}

      <div className="side-foot">
        <button type="button" className="kbd-hint" onClick={onOpenPalette}>
          <Icon name="command" size={14} />Commands<kbd>Ctrl K</kbd>
        </button>
        <ServerBadge server={server} />
      </div>
    </aside>
  );
}
