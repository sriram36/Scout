"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fuzzyScore, isStrongMatch, searchJobs } from "@/lib/filters";
import { LANES } from "@/lib/pipeline";
import type { Job } from "@/lib/types";
import { Icon } from "./Icon";
import { StageBadge } from "./JobActions";

export interface PaletteCommand {
  id: string;
  group: string;
  label: string;
  icon: string;
  hint?: string;
  run: () => void;
}

type Item = { kind: "job"; job: Job } | { kind: "command"; command: PaletteCommand };

export function CommandPalette({
  jobs, commands, onOpenJob, onClose,
}: {
  jobs: Job[];
  commands: PaletteCommand[];
  onOpenJob: (job: Job) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    input.current?.focus();
    return () => previous?.focus?.();
  }, []);

  const groups = useMemo(() => {
    const q = query.trim();
    const cmds = q
      ? commands
        .filter(c => isStrongMatch(q, c.label))
        .map(c => ({ c, s: fuzzyScore(q, c.label) }))
        .sort((a, b) => b.s - a.s)
        .map(x => x.c)
      : commands.filter(c => c.group === "Actions");
    const found = searchJobs(jobs, q, q ? 7 : 5);
    const out: { title: string; items: Item[] }[] = [];
    const jobItems: Item[] = found.map(job => ({ kind: "job", job }));
    const byGroup = new Map<string, Item[]>();
    for (const c of cmds) {
      if (!byGroup.has(c.group)) byGroup.set(c.group, []);
      byGroup.get(c.group)!.push({ kind: "command", command: c });
    }
    if (q && jobItems.length) out.push({ title: "Roles", items: jobItems });
    for (const [title, items] of byGroup) out.push({ title, items });
    if (!q && jobItems.length) out.push({ title: "Recent roles", items: jobItems });
    return out;
  }, [query, jobs, commands]);

  const flat = groups.flatMap(g => g.items);
  const clamped = Math.min(active, Math.max(0, flat.length - 1));

  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${clamped}"]`)?.scrollIntoView({ block: "nearest" });
  }, [clamped]);

  const choose = (item: Item | undefined) => {
    if (!item) return;
    onClose();
    if (item.kind === "job") onOpenJob(item.job);
    else item.command.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(i => (Math.min(i, flat.length - 1) + 1) % Math.max(1, flat.length)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(i => (Math.min(i, flat.length - 1) - 1 + flat.length) % Math.max(1, flat.length)); }
    else if (e.key === "Enter") { e.preventDefault(); choose(flat[clamped]); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
    else if (e.key === "Tab") { e.preventDefault(); }
  };

  let index = -1;
  return (
    <div className="palette-root" onKeyDown={onKeyDown}>
      <button type="button" className="palette-backdrop" aria-label="Close command menu" tabIndex={-1} onClick={onClose} />
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command menu">
        <div className="palette-input">
          <Icon name="search" size={18} />
          <input
            ref={input}
            value={query}
            onChange={e => { setQuery(e.target.value); setActive(0); }}
            placeholder="Search roles, or type a command"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={flat.length ? `palette-item-${clamped}` : undefined}
            aria-autocomplete="list"
          />
          <kbd>Esc</kbd>
        </div>
        <div className="palette-list" id="palette-list" role="listbox" ref={list} aria-label="Results">
          {flat.length === 0 && <p className="palette-empty">Nothing matches “{query}”. Try a company, a role or a stage like “review”.</p>}
          {groups.map(group => (
            <div key={group.title} role="group" aria-label={group.title}>
              <p className="palette-group">{group.title}</p>
              {group.items.map(item => {
                index += 1;
                const i = index;
                const selected = i === clamped;
                return (
                  <div
                    key={item.kind === "job" ? `job-${item.job.id}` : item.command.id}
                    id={`palette-item-${i}`}
                    data-index={i}
                    role="option"
                    aria-selected={selected}
                    className={`palette-item${selected ? " is-active" : ""}`}
                    onMouseMove={() => setActive(i)}
                    onClick={() => choose(item)}
                  >
                    {item.kind === "job" ? (
                      <>
                        <span className="pi-main"><span className="pi-title">{item.job.title}</span><span className="pi-sub">{item.job.company}, {item.job.location}</span></span>
                        <StageBadge status={item.job.status} />
                      </>
                    ) : (
                      <>
                        <Icon name={item.command.icon} size={16} />
                        <span className="pi-main"><span className="pi-title">{item.command.label}</span></span>
                        {item.command.hint && <kbd>{item.command.hint}</kbd>}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="palette-foot" aria-hidden="true">
          <span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span>{LANES.length} stages, {jobs.length} roles</span>
        </div>
      </div>
    </div>
  );
}
