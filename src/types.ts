// The single source of truth for helm's data model (DEVRULES A1).
// The CLI, the server, and the browser frontend all import these types.
// `state.json` on disk is exactly a serialized BoardState.

export type StatusState = "running" | "blocked" | "waiting" | "done";
export type EventKind = "ok" | "fail" | "warn" | "info" | "run";
export type PlanStepStatus = "todo" | "active" | "done";
export type Theme = "light" | "dark";

/** The big "what is the agent doing right now" line. */
export interface Status {
  text: string;
  state: StatusState;
  phase?: string; // e.g. "step 4/7"
  pct?: number; // 0..100, overall progress
  since?: string; // ISO; when the current running activity began (for "elapsed")
}

export interface PlanStep {
  text: string;
  status: PlanStepStatus;
}

/** Human-owned. Edited live in the page; the agent re-reads it at checkpoints. */
export interface Steering {
  goal: string;
  steer: string;
  updated: string; // ISO
  by: "agent" | "human";
}

export interface Need {
  q: string;
  ts: string; // ISO
}

export interface ActivityEvent {
  kind: EventKind;
  text: string;
  ts: string; // ISO
}

export interface Decision {
  text: string;
  assumption: boolean; // true = an unconfirmed assumption, flagged so the human can correct it
}

export type Artifact =
  | { type: "link"; label: string; url: string }
  | { type: "image"; label: string; url: string } // url is "/file/<name>", served from <run>/files
  | { type: "data"; label: string; value: string };

export interface Meta {
  agent: string;
  model: string;
  started: string; // ISO
  updated: string; // ISO; bumped on every mutation
}

export interface BoardState {
  title: string;
  subtitle: string;
  theme: Theme;
  meta: Meta;
  status: Status | null;
  plan: PlanStep[];
  steering: Steering;
  needs: Need[];
  events: ActivityEvent[];
  decisions: Decision[];
  artifacts: Artifact[];
}

/** Body of POST /steer — the page's write-back of the human's edits. */
export interface SteerPayload {
  goal?: string;
  steer?: string;
}

/** Written to <run>/.server.json so the CLI can find / stop the server. */
export interface ServerInfo {
  pid: number;
  port: number;
  started: string; // ISO
}

export function emptyState(init: {
  title: string;
  subtitle: string;
  theme: Theme;
  agent: string;
  model: string;
  goal: string;
  now: string;
}): BoardState {
  return {
    title: init.title,
    subtitle: init.subtitle,
    theme: init.theme,
    meta: { agent: init.agent, model: init.model, started: init.now, updated: init.now },
    status: null,
    plan: [],
    steering: { goal: init.goal, steer: "", updated: init.now, by: "agent" },
    needs: [],
    events: [],
    decisions: [],
    artifacts: [],
  };
}
