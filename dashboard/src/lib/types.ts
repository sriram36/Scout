import type { Job as JobT, Application as ApplicationT, FillReport as FillReportT, SkippedDetail as SkippedT } from "./normalize";
import type { LaneId as LaneIdT, Action as ActionT } from "./pipeline";

export type Job = JobT;
export type Application = ApplicationT;
export type FillReport = FillReportT;
export type SkippedDetail = SkippedT;
export type LaneId = LaneIdT;
export type JobAction = ActionT;

export type Mode = "loading" | "demo" | "live" | "unconfigured";
export type View = "board" | "table";
export type SortKey = "recent" | "company" | "title" | "stage";

export type ServerState =
  | { kind: "checking" }
  | { kind: "online"; version?: string; headless?: boolean }
  | { kind: "offline" }
  | { kind: "demo" };

export interface Profile {
  name?: string;
  location?: string;
  links?: Record<string, string>;
  education?: Record<string, unknown>;
  skills?: string[];
  preferences?: Record<string, unknown>;
}

export interface Toast {
  id: number;
  tone: "success" | "error" | "info";
  title: string;
  body?: string;
}

export interface Filters {
  query: string;
  source: string | null;
  lane: LaneId | null;
  internshipOnly: boolean;
}
