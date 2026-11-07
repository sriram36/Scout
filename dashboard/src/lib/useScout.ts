"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { resolveMode } from "./mode";
import { normalizeListing, applyRealtimeChange } from "./normalize";
import { planStatusChange, type StatusChange } from "./pipeline";
import { buildDemoListings, nextDemoStatus, smallReport, DEMO_PROFILE } from "./demoData";
import { FALLBACK_MEANINGS, buildCorrectionPayload } from "./corrections";
import { getSupabase, supabaseConfigError, SUPABASE_URL, SUPABASE_ANON_KEY, APPLICATION_COLUMNS, LISTING_SELECT } from "./supabaseClient";
import { fetchHealth, fetchMeanings, fetchProfile, postCorrection } from "./localApi";
import type { Application, Job, JobAction, Mode, Profile, ServerState, Toast } from "./types";

export const PAGE_SIZE = 50;
const HEALTH_INTERVAL_MS = 30_000;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const message = (err: unknown) => (err instanceof Error ? err.message : typeof err === "string" ? err : "Something went wrong.");

const SUCCESS_COPY: Record<JobAction, string> = {
  autofill: "Queued for auto-fill",
  retry: "Queued again",
  dismiss: "Moved back to Discovered",
  submit: "Marked as submitted",
};
const FAILURE_COPY: Record<JobAction, string> = {
  autofill: "Could not queue for auto-fill",
  retry: "Could not queue again",
  dismiss: "Could not move back to Discovered",
  submit: "Could not mark as submitted",
};

export type LoadState = "loading" | "idle" | "refreshing" | "more";

/** The mode depends on build-time env and the URL, which only exist in the browser. */
function readMode(): Mode {
  const resolved = resolveMode({
    demoEnv: process.env.NEXT_PUBLIC_DEMO || "",
    search: window.location.search,
    supabaseUrl: SUPABASE_URL,
    supabaseKey: SUPABASE_ANON_KEY,
  }) as Mode;
  return resolved === "live" && !getSupabase() ? "unconfigured" : resolved;
}
const noSubscription = () => () => {};

export function useScout() {
  const mode = useSyncExternalStore(noSubscription, readMode, () => "loading" as Mode);
  const configError = mode === "unconfigured" ? supabaseConfigError() : null;
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [server, setServer] = useState<ServerState>({ kind: "checking" });
  const [profile, setProfile] = useState<Profile | null>(null);
  const [meanings, setMeanings] = useState<string[]>(FALLBACK_MEANINGS);
  const [busy, setBusy] = useState<Record<string, JobAction>>({});
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  const [taught, setTaught] = useState<Record<string, string>>({});
  const [toasts, setToasts] = useState<Toast[]>([]);

  const jobsRef = useRef<Job[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const toastId = useRef(0);

  useEffect(() => { jobsRef.current = jobs; }, [jobs]);
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);

  // ── Toasts ────────────────────────────────────────────────────────────────
  const dismissToast = useCallback((id: number) => setToasts(t => t.filter(x => x.id !== id)), []);
  const notify = useCallback((tone: Toast["tone"], title: string, body?: string) => {
    const id = ++toastId.current;
    setToasts(t => [...t.slice(-3), { id, tone, title, body }]);
    later(() => dismissToast(id), tone === "error" ? 9000 : 4500);
  }, [later, dismissToast]);

  const markFresh = useCallback((id: string) => {
    setFresh(prev => new Set(prev).add(id));
    later(() => setFresh(prev => { const next = new Set(prev); next.delete(id); return next; }), 1800);
  }, [later]);

  // ── Listings ──────────────────────────────────────────────────────────────
  const load = useCallback(async (kind: "initial" | "refresh" | "more") => {
    if (mode === "demo") {
      if (kind === "initial") {
        await delay(200); // a short, realistic load so the skeleton is part of the demo too
        setJobs(buildDemoListings(new Date()).map(normalizeListing));
        setHasMore(false);
        setLastSync(new Date());
        setLoadState("idle");
      } else if (kind === "refresh") {
        setLoadState("refreshing");
        await delay(500);
        setLastSync(new Date());
        setLoadState("idle");
      }
      return;
    }
    const sb = mode === "live" ? getSupabase() : null;
    if (!sb) return;

    // The initial state is already "loading"; only later loads need to announce themselves.
    if (kind !== "initial") setLoadState(kind === "refresh" ? "refreshing" : "more");
    const loaded = jobsRef.current.length;
    const from = kind === "more" ? loaded : 0;
    const to = kind === "more" ? loaded + PAGE_SIZE - 1 : Math.max(loaded, PAGE_SIZE) - 1;
    try {
      const { data, error } = await sb
        .from("listings")
        .select(LISTING_SELECT)
        .order("discovered_at", { ascending: false })
        .range(from, to);
      if (error) throw new Error(error.message);
      const page = (data ?? []).map(normalizeListing);
      setJobs(prev => {
        if (kind !== "more") return page;
        const seen = new Set(prev.map(j => j.id));
        return [...prev, ...page.filter(j => !seen.has(j.id))];
      });
      setHasMore(page.length === to - from + 1);
      setLoadError(null);
      setLastSync(new Date());
    } catch (err) {
      const raw = message(err);
      const text = /failed to fetch|networkerror|load failed/i.test(raw)
        ? `Supabase at ${SUPABASE_URL.replace(/^https?:\/\//, "")} could not be reached. Check your connection and NEXT_PUBLIC_SUPABASE_URL, and that the project is not paused.`
        : raw;
      setLoadError(text);
      if (kind !== "initial") notify("error", "Could not load listings", text);
    } finally {
      setLoadState("idle");
    }
  }, [mode, notify]);

  useEffect(() => {
    if (mode !== "demo" && mode !== "live") return;
    // Deferred so a StrictMode double-mount cancels the first run instead of loading twice.
    const timer = setTimeout(() => void load("initial"), 0);
    return () => clearTimeout(timer);
    // load is recreated when mode changes; run once per mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // ── Realtime ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== "live") return;
    const sb = getSupabase();
    if (!sb) return;
    const channel = sb
      .channel("scout-applications")
      .on("postgres_changes", { event: "*", schema: "public", table: "applications" }, payload => {
        const change = payload as unknown as { eventType: string; new?: Record<string, unknown>; old?: Record<string, unknown> };
        setJobs(prev => applyRealtimeChange(prev, change));
        const listingId = (change.new?.listing_id as string | undefined)
          ?? jobsRef.current.find(j => j.application?.id === change.old?.id)?.id;
        if (listingId) markFresh(listingId);
        setLastSync(new Date());
      })
      .subscribe();
    return () => { void sb.removeChannel(channel); };
  }, [mode, markFresh]);

  // ── Local apply server ────────────────────────────────────────────────────
  useEffect(() => {
    if (mode === "loading" || mode === "demo") return;
    let cancelled = false;
    const check = async () => {
      const health = await fetchHealth();
      if (cancelled) return;
      setServer(health ? { kind: "online", version: health.version, headless: health.headless } : { kind: "offline" });
    };
    void check();
    void fetchProfile().then(p => { if (!cancelled) setProfile(p); });
    void fetchMeanings().then(m => { if (!cancelled && m) setMeanings(m); });
    const interval = setInterval(check, HEALTH_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, [mode]);

  // ── Status changes ────────────────────────────────────────────────────────
  const patchApplication = useCallback((listingId: string, values: Partial<Application> & { status: string }) => {
    setJobs(prev => prev.map(j => {
      if (j.id !== listingId) return j;
      const application = { ...(j.application ?? { id: "" }), ...values } as Application;
      return { ...j, status: values.status, application };
    }));
  }, []);

  const simulateDemo = useCallback((listingId: string) => {
    [2400, 5200, 8200].forEach((ms, step) => later(() => {
      const nowIso = new Date().toISOString();
      setJobs(prev => prev.map(j => {
        const next = j.id === listingId && j.application ? nextDemoStatus(j.status) : null;
        if (!next || !j.application) return j;
        const report = next === "awaiting_review" ? smallReport(step + 7) : null;
        const application: Application = {
          ...j.application,
          status: next,
          status_updated_at: nowIso,
          ...(next === "applying" ? { started_at: nowIso, ats_platform: j.application.ats_platform ?? "greenhouse" } : {}),
          ...(next === "form_analyzed" ? { fields_detected: 12 } : {}),
          ...(report ? {
            completed_at: nowIso, fill_report: report, fields_detected: report.total, fields_filled: report.filled,
            fields_skipped: report.skipped, ai_questions_answered: report.aiGenerated,
          } : {}),
        };
        return { ...j, status: next, application };
      }));
      markFresh(listingId);
    }, ms));
  }, [later, markFresh]);

  const runAction = useCallback(async (job: Job, action: JobAction) => {
    if (busy[job.id]) return;
    setBusy(b => ({ ...b, [job.id]: action }));
    try {
      const nowIso = new Date().toISOString();
      const plan: StatusChange = planStatusChange(action, { listingId: job.id, applicationId: job.application?.id || null }, nowIso);

      if (mode === "demo") {
        await delay(450);
        if (plan.kind === "insert") {
          patchApplication(job.id, { id: `demo-${job.id}`, ...plan.values });
        } else {
          patchApplication(job.id, plan.values);
        }
        if (plan.values.status === "pending_application") simulateDemo(job.id);
      } else {
        const sb = getSupabase();
        if (!sb) throw new Error("Supabase is not configured.");
        if (plan.kind === "insert") {
          const { error } = await sb.from("applications").insert(plan.values);
          if (error && error.code === "23505") {
            // Someone (or another tab) created the row first: update it instead.
            const existing = await sb.from("applications").select("id").eq("listing_id", job.id).maybeSingle();
            if (existing.error || !existing.data) throw new Error(existing.error?.message || "The application already exists but could not be read.");
            const { error: updateError } = await sb.from("applications")
              .update({ status: "pending_application", status_updated_at: nowIso }).eq("id", existing.data.id);
            if (updateError) throw new Error(updateError.message);
          } else if (error) {
            throw new Error(error.message);
          }
          const { data: row } = await sb.from("applications").select(APPLICATION_COLUMNS).eq("listing_id", job.id).maybeSingle();
          patchApplication(job.id, (row as Application | null) ?? { ...plan.values });
        } else {
          const { data, error } = await sb.from("applications").update(plan.values).eq("id", plan.id).select("id");
          if (error) throw new Error(error.message);
          if (!data || data.length === 0) throw new Error("No application was updated. It may have changed in the meantime; refresh and try again.");
          patchApplication(job.id, plan.values);
        }
      }
      markFresh(job.id);
      notify("success", SUCCESS_COPY[action], `${job.title} at ${job.company}`);
    } catch (err) {
      notify("error", FAILURE_COPY[action], message(err));
    } finally {
      setBusy(b => { const next = { ...b }; delete next[job.id]; return next; });
    }
  }, [busy, mode, notify, markFresh, patchApplication, simulateDemo]);

  // ── Corrections ───────────────────────────────────────────────────────────
  /** Throws on failure so the caller can show the error next to the field. */
  const teach = useCallback(async (job: Job, field: { signature: string; label?: string; field: string }, meaning: string) => {
    const payload = buildCorrectionPayload({
      platform: job.application?.ats_platform, signature: field.signature, meaning, applyUrl: job.url,
    });
    if (mode === "demo") await delay(400);
    else await postCorrection(payload);
    setTaught(t => ({ ...t, [`${job.application?.id}:${field.signature}`]: meaning }));
    notify("success", "Saved for next time", `Scout will recognise “${field.label ?? field.field}” from now on.`);
  }, [mode, notify]);

  return {
    mode, configError, jobs, loadState, loadError, hasMore, lastSync,
    server: mode === "demo" ? ({ kind: "demo" } as ServerState) : server,
    profile: mode === "demo" ? DEMO_PROFILE : profile,
    meanings: mode === "demo" ? FALLBACK_MEANINGS : meanings,
    busy, fresh, taught, toasts,
    refresh: () => load("refresh"),
    loadMore: () => load("more"),
    retryLoad: () => load("refresh"),
    runAction, teach, notify, dismissToast,
  };
}

export type ScoutState = ReturnType<typeof useScout>;
