"use client";

import type { Toast } from "@/lib/types";
import { Icon } from "./Icon";

export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toasts" aria-live="polite" aria-relevant="additions">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.tone}`} role={t.tone === "error" ? "alert" : "status"}>
          <Icon name={t.tone === "error" ? "alert" : t.tone === "success" ? "check" : "spark"} size={16} />
          <div className="toast-text">
            <strong>{t.title}</strong>
            {t.body && <span>{t.body}</span>}
          </div>
          <button type="button" className="icon-btn icon-btn-sm" onClick={() => onDismiss(t.id)} aria-label="Dismiss notification">
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function BoardSkeleton() {
  return (
    <div className="skeleton" aria-busy="true" aria-label="Loading listings">
      <div className="stats stats-skeleton">
        {[0, 1, 2, 3].map(i => <div key={i} className="stat"><span className="sk sk-line" /><span className="sk sk-block" /></div>)}
      </div>
      <div className="board">
        {[4, 2, 3, 2, 3, 1].map((n, lane) => (
          <div key={lane} className="lane">
            <div className="lane-head"><span className="sk sk-dot" /><span className="sk sk-line short" /></div>
            <div className="lane-body">
              {Array.from({ length: n }, (_, i) => <div key={i} className="card sk-card"><span className="sk sk-line" /><span className="sk sk-line short" /><span className="sk sk-line shorter" /></div>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SetupPanel({ error }: { error: string | null }) {
  return (
    <section className="setup" aria-labelledby="setup-title">
      <h2 id="setup-title">Connect Scout to your Supabase project</h2>
      <p className="setup-lead">
        The dashboard reads listings and applications from Supabase. Add your project’s URL and anon key, then restart the dev server.
      </p>
      {error && <p className="setup-error" role="alert"><Icon name="alert" size={15} />The current settings were rejected: {error}</p>}
      <ol className="setup-steps">
        <li>
          <span className="step-title">Create <code>dashboard/.env.local</code></span>
          <pre className="code">{`NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_LOCAL_API=http://localhost:3001`}</pre>
          <span className="step-note">Use the anon key only. Everything prefixed <code>NEXT_PUBLIC_</code> is sent to the browser, so the service-role key must never go here.</span>
        </li>
        <li>
          <span className="step-title">Restart the dashboard</span>
          <pre className="code">npm run dev</pre>
        </li>
        <li>
          <span className="step-title">Start the apply server</span>
          <span className="step-note">From the Scout folder, run <code>npm start</code> so Auto-fill and corrections work.</span>
        </li>
      </ol>
      <a className="btn btn-primary" href="?demo=1"><Icon name="play" size={15} />Explore with sample data</a>
    </section>
  );
}

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="load-error" role="alert">
      <Icon name="alert" size={18} />
      <div>
        <strong>Could not load listings</strong>
        <span>{message}</span>
      </div>
      <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}><Icon name="retry" size={14} />Try again</button>
    </div>
  );
}
