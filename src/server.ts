// helm board server — a short-lived local process (DEVRULES R1: Node stdlib only).
//
// Serves the board UI, streams state.json over SSE (so the open page updates in
// place, no polling or reload), accepts steering write-backs from the page, and
// self-exits when the board is abandoned. It never daemonizes and never restarts
// itself (DEVRULES R3).
//
// Started detached by the `helm` CLI with HELM_RUN_DIR pointing at the run folder
// (which holds state.json). Binds 127.0.0.1 on an ephemeral port and writes
// {pid, port} to <run>/.server.json so the CLI can find / stop it.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  readFileSync, writeFileSync, renameSync, mkdirSync, statSync, existsSync, unlinkSync,
} from "node:fs";
import { dirname, join, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";
import type { BoardState, ServerInfo, SteerPayload } from "./types.js";

const ASSET_DIR = dirname(fileURLToPath(import.meta.url));
const BOARD_HTML = join(ASSET_DIR, "board.html");

const RUN_DIR = process.env.HELM_RUN_DIR ? process.env.HELM_RUN_DIR : process.cwd();
const STATE_FILE = join(RUN_DIR, "state.json");
const FILES_DIR = join(RUN_DIR, "files");
const SERVER_FILE = join(RUN_DIR, ".server.json");

const num = (k: string, d: number) => {
  const v = process.env[k];
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : d;
};
const CLIENT_GRACE = num("HELM_CLIENT_GRACE", 120) * 1000; // left a watched board
const STARTUP_GRACE = num("HELM_STARTUP_GRACE", 300) * 1000; // page never opened
const IDLE_MAX = num("HELM_IDLE_MAX", 30 * 60) * 1000; // state stopped changing

const clients = new Set<ServerResponse>();
const life = { start: Date.now(), lastChange: Date.now(), noClientSince: Date.now(), hadClient: false };
let done = false;

const MIME: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
  ".webp": "image/webp", ".svg": "image/svg+xml",
};

function nowIso(): string {
  return new Date().toISOString();
}

function readStateText(): string | null {
  try {
    return readFileSync(STATE_FILE, "utf8");
  } catch {
    return null;
  }
}

/** Single-line JSON for SSE. The on-disk file is pretty-printed, but SSE treats a
 *  raw newline as a field boundary, so the data field must contain none. Compact
 *  dumps escape newlines inside strings. */
function readStateSse(): string | null {
  const s = readStateText();
  if (!s) return null;
  try {
    return JSON.stringify(JSON.parse(s));
  } catch {
    return null;
  }
}

function writeStateAtomic(st: BoardState): void {
  const tmp = join(RUN_DIR, `.helm-tmp-${process.pid}-${Date.now()}`);
  writeFileSync(tmp, JSON.stringify(st, null, 2));
  renameSync(tmp, STATE_FILE);
}

function broadcast(msg: string): void {
  for (const res of [...clients]) {
    try {
      res.write(`data: ${msg}\n\n`);
    } catch {
      clients.delete(res);
    }
  }
}

function shutdown(): void {
  if (done) return;
  done = true;
  try {
    unlinkSync(SERVER_FILE);
  } catch {
    /* already gone */
  }
  for (const res of [...clients]) {
    try {
      res.end();
    } catch {
      /* ignore */
    }
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 500).unref();
}

/** Persist the human's edits to goal / steer. This is the write-back channel:
 *  the agent re-reads these at its checkpoints via `helm goal`. */
function applySteer(data: SteerPayload): void {
  const s = readStateText();
  let st: BoardState;
  try {
    st = s ? (JSON.parse(s) as BoardState) : ({} as BoardState);
  } catch {
    return;
  }
  const stg = st.steering ?? { goal: "", steer: "", updated: nowIso(), by: "human" };
  if (typeof data.goal === "string") stg.goal = data.goal;
  if (typeof data.steer === "string") stg.steer = data.steer;
  stg.updated = nowIso();
  stg.by = "human";
  st.steering = stg;
  st.meta = st.meta ?? { agent: "", model: "", started: nowIso(), updated: nowIso() };
  st.meta.updated = nowIso();
  writeStateAtomic(st);
}

function sendFile(res: ServerResponse, name: string): void {
  const fp = join(FILES_DIR, basename(name));
  if (!existsSync(fp)) {
    res.writeHead(404).end("no file");
    return;
  }
  const body = readFileSync(fp);
  res.writeHead(200, { "Content-Type": MIME[extname(fp).toLowerCase()] ?? "application/octet-stream" });
  res.end(body);
}

function streamEvents(req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
  });
  clients.add(res);
  life.hadClient = true;
  const cur = readStateSse();
  if (cur) res.write(`data: ${cur}\n\n`);
  req.on("close", () => {
    clients.delete(res);
    if (clients.size === 0) life.noClientSince = Date.now();
  });
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c: Buffer) => (raw += c.toString("utf8")));
    req.on("end", () => resolve(raw));
    req.on("error", () => resolve(""));
  });
}

const server = createServer(async (req, res) => {
  const path = (req.url ?? "/").split("?")[0];
  if (req.method === "GET" && (path === "/" || path === "/index.html")) {
    try {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(readFileSync(BOARD_HTML));
    } catch {
      res.writeHead(500).end("board.html missing");
    }
  } else if (req.method === "GET" && path === "/state") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(readStateText() ?? "{}");
  } else if (req.method === "GET" && path === "/events") {
    streamEvents(req, res);
  } else if (req.method === "GET" && path.startsWith("/file/")) {
    sendFile(res, path.slice("/file/".length));
  } else if (req.method === "POST" && path === "/steer") {
    const raw = await readBody(req);
    try {
      applySteer(JSON.parse(raw || "{}") as SteerPayload);
      res.writeHead(200, { "Content-Type": "application/json" }).end('{"ok":true}');
    } catch {
      res.writeHead(400).end("bad json");
    }
  } else {
    res.writeHead(404).end("not found");
  }
});

// Broadcast state.json changes; enforce the lifecycle. Never restart.
let lastMtime = -1;
setInterval(() => {
  if (done) return;
  let m = 0;
  try {
    m = statSync(STATE_FILE).mtimeMs;
  } catch {
    m = 0;
  }
  if (m !== lastMtime) {
    lastMtime = m;
    life.lastChange = Date.now();
    const s = readStateSse();
    if (s) broadcast(s);
  }
  const now = Date.now();
  if (clients.size === 0) {
    if (life.hadClient && now - life.noClientSince > CLIENT_GRACE) return shutdown();
    if (!life.hadClient && now - life.start > STARTUP_GRACE) return shutdown();
  }
  if (now - life.lastChange > IDLE_MAX) return shutdown();
}, 300).unref();

// SSE heartbeat so proxies / the browser keep the stream alive.
setInterval(() => {
  for (const res of [...clients]) {
    try {
      res.write(": ping\n\n");
    } catch {
      clients.delete(res);
    }
  }
}, 15000).unref();

mkdirSync(FILES_DIR, { recursive: true });
server.listen(0, "127.0.0.1", () => {
  const addr = server.address();
  const port = addr && typeof addr === "object" ? addr.port : 0;
  const info: ServerInfo = { pid: process.pid, port, started: nowIso() };
  writeFileSync(SERVER_FILE, JSON.stringify(info));
});

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
