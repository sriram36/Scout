import type { ReactNode } from "react";

const PATHS: Record<string, ReactNode> = {
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>,
  refresh: <><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" /><path d="M19.5 4.5v4h-4" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" /></>,
  moon: <path d="M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10Z" />,
  board: <><rect x="3.5" y="4" width="5" height="16" rx="1.5" /><rect x="10.5" y="4" width="5" height="11" rx="1.5" /><rect x="17.5" y="4" width="3" height="7" rx="1.2" /></>,
  table: <><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M3.5 9.5h17M3.5 14.5h17M9 9.5v10" /></>,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  external: <><path d="M14 4.5h5.5V10" /><path d="M19.5 4.5 11 13" /><path d="M17 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 4 18.5v-10A1.5 1.5 0 0 1 5.5 7H10" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  alert: <><path d="M12 4 2.8 19.5h18.4L12 4Z" /><path d="M12 10v4M12 16.8v.2" /></>,
  pin: <><path d="M12 21s6.5-6.2 6.5-11.5a6.5 6.5 0 0 0-13 0C5.5 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.3" /></>,
  spark: <path d="M12 3.5c.6 4.2 2.3 5.9 6.5 6.5-4.2.6-5.9 2.3-6.5 6.5-.6-4.2-2.3-5.9-6.5-6.5 4.2-.6 5.9-2.3 6.5-6.5ZM18.5 15.5c.3 1.6.9 2.2 2.5 2.5-1.6.3-2.2.9-2.5 2.5-.3-1.6-.9-2.2-2.5-2.5 1.6-.3 2.2-.9 2.5-2.5Z" />,
  play: <path d="M7.5 5.2v13.6a.8.8 0 0 0 1.2.7l10.6-6.8a.8.8 0 0 0 0-1.4L8.7 4.5a.8.8 0 0 0-1.2.7Z" />,
  send: <><path d="M20.5 3.5 10 14" /><path d="M20.5 3.5 14 20.5l-4-6.5-6.5-4 17-6.5Z" /></>,
  retry: <><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" /><path d="M4.5 4.5v4h4" /></>,
  undo: <><path d="M9 14 4.5 9.5 9 5" /><path d="M4.5 9.5h9a6 6 0 0 1 0 12h-2" /></>,
  plug: <><path d="M9 3.5v4M15 3.5v4" /><path d="M6.5 7.5h11v3a5.5 5.5 0 0 1-11 0v-3Z" /><path d="M12 16v4.5" /></>,
  command: <path d="M9 6.5a2.5 2.5 0 1 0-2.5 2.5H9V6.5Zm0 0v11m0-11h6m-6 11a2.5 2.5 0 1 1-2.5-2.5H9v2.5Zm0 0h6m0-11a2.5 2.5 0 1 1 2.5 2.5H15V6.5Zm0 0v11m0 0a2.5 2.5 0 1 0 2.5-2.5H15v2.5Z" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  filter: <path d="M4 5.5h16l-6.2 7.3v5.4l-3.6 1.8v-7.2L4 5.5Z" />,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  doc: <><path d="M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8L14 3.5Z" /><path d="M14 3.5V8h4.5M9 12.5h6M9 16h4" /></>,
  teach: <><path d="M3 9.5 12 5l9 4.5-9 4.5-9-4.5Z" /><path d="M7 11.5v4.2c1.4 1.3 3 1.8 5 1.8s3.6-.5 5-1.8v-4.2" /></>,
  keyboard: <><rect x="2.5" y="6" width="19" height="12" rx="2" /><path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M7.5 14h9" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
};

export function Icon({ name, size = 16, className }: { name: keyof typeof PATHS | string; size?: number; className?: string }) {
  return (
    <svg
      className={className ? `icon ${className}` : "icon"}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name] ?? PATHS.spark}
    </svg>
  );
}

/** Scout's mark: a trail between two waypoints. */
export function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false" className="brand-mark">
      <rect width="32" height="32" rx="9" fill="var(--brand-tile)" />
      <path d="M9 23c3.5 0 4-6.5 7-6.5S19.5 9 23 9" fill="none" stroke="var(--brand-trail)" strokeWidth="2" strokeLinecap="round" strokeDasharray="0.1 3.6" />
      <circle cx="9" cy="23" r="2.6" fill="var(--brand-trail)" />
      <path d="M23 5.6 26.4 9 23 12.4 19.6 9Z" fill="var(--accent)" />
    </svg>
  );
}
