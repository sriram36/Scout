import { describeCorrectionError, type CorrectionPayload } from "./corrections";
import type { Profile } from "./types";

export const LOCAL_API = (process.env.NEXT_PUBLIC_LOCAL_API || "http://localhost:3001").replace(/\/+$/, "");

async function request(path: string, init: RequestInit = {}, timeoutMs = 5000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${LOCAL_API}${path}`, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export interface Health {
  status: string;
  version?: string;
  headless?: boolean;
}

export async function fetchHealth(): Promise<Health | null> {
  try {
    const res = await request("/health", {}, 3000);
    if (!res.ok) return null;
    return (await res.json()) as Health;
  } catch {
    return null;
  }
}

export async function fetchProfile(): Promise<Profile | null> {
  try {
    const res = await request("/profile");
    if (!res.ok) return null;
    return (await res.json()) as Profile;
  } catch {
    return null;
  }
}

/** Allowed field meanings for corrections, or null when the server does not provide them. */
export async function fetchMeanings(): Promise<string[] | null> {
  try {
    const res = await request("/meanings");
    if (!res.ok) return null;
    const body = (await res.json()) as { meanings?: unknown };
    if (!Array.isArray(body.meanings)) return null;
    const list = body.meanings.filter((m): m is string => typeof m === "string" && m !== "unknown");
    return list.length ? list : null;
  } catch {
    return null;
  }
}

/** POST /corrections. Throws an Error with a readable message on failure. */
export async function postCorrection(payload: CorrectionPayload): Promise<void> {
  let res: Response;
  try {
    res = await request("/corrections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error(`Could not reach the apply server at ${LOCAL_API}. Start it with npm start in the Scout folder.`);
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* empty or non-JSON body */
  }
  if (!res.ok || !(body as { success?: boolean } | null)?.success) {
    throw new Error(describeCorrectionError(res.status, body));
  }
}
