// src/server.ts
import { createServer } from "node:http";
import {
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
  statSync,
  existsSync,
  unlinkSync
} from "node:fs";
import { dirname, join, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";
var ASSET_DIR = dirname(fileURLToPath(import.meta.url));
var BOARD_HTML = join(ASSET_DIR, "board.html");
var RUN_DIR = process.env.HELM_RUN_DIR ? process.env.HELM_RUN_DIR : process.cwd();
var STATE_FILE = join(RUN_DIR, "state.json");
var FILES_DIR = join(RUN_DIR, "files");
var SERVER_FILE = join(RUN_DIR, ".server.json");
var num = (k, d) => {
  const v = process.env[k];
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : d;
};
var CLIENT_GRACE = num("HELM_CLIENT_GRACE", 120) * 1e3;
var STARTUP_GRACE = num("HELM_STARTUP_GRACE", 300) * 1e3;
var IDLE_MAX = num("HELM_IDLE_MAX", 30 * 60) * 1e3;
var clients = /* @__PURE__ */ new Set();
var life = { start: Date.now(), lastChange: Date.now(), noClientSince: Date.now(), hadClient: false };
var done = false;
var MIME = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml"
};
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function readStateText() {
  try {
    return readFileSync(STATE_FILE, "utf8");
  } catch {
    return null;
  }
}
function readStateSse() {
  const s = readStateText();
  if (!s) return null;
  try {
    return JSON.stringify(JSON.parse(s));
  } catch {
    return null;
  }
}
function writeStateAtomic(st) {
  const tmp = join(RUN_DIR, `.helm-tmp-${process.pid}-${Date.now()}`);
  writeFileSync(tmp, JSON.stringify(st, null, 2));
  renameSync(tmp, STATE_FILE);
}
function broadcast(msg) {
  for (const res of [...clients]) {
    try {
      res.write(`data: ${msg}

`);
    } catch {
      clients.delete(res);
    }
  }
}
function shutdown() {
  if (done) return;
  done = true;
  try {
    unlinkSync(SERVER_FILE);
  } catch {
  }
  for (const res of [...clients]) {
    try {
      res.end();
    } catch {
    }
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 500).unref();
}
function applySteer(data) {
  const s = readStateText();
  let st;
  try {
    st = s ? JSON.parse(s) : {};
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
function sendFile(res, name) {
  const fp = join(FILES_DIR, basename(name));
  if (!existsSync(fp)) {
    res.writeHead(404).end("no file");
    return;
  }
  const body = readFileSync(fp);
  res.writeHead(200, { "Content-Type": MIME[extname(fp).toLowerCase()] ?? "application/octet-stream" });
  res.end(body);
}
function streamEvents(req, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store",
    Connection: "keep-alive"
  });
  clients.add(res);
  life.hadClient = true;
  const cur = readStateSse();
  if (cur) res.write(`data: ${cur}

`);
  req.on("close", () => {
    clients.delete(res);
    if (clients.size === 0) life.noClientSince = Date.now();
  });
}
function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => raw += c.toString("utf8"));
    req.on("end", () => resolve(raw));
    req.on("error", () => resolve(""));
  });
}
var server = createServer(async (req, res) => {
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
      applySteer(JSON.parse(raw || "{}"));
      res.writeHead(200, { "Content-Type": "application/json" }).end('{"ok":true}');
    } catch {
      res.writeHead(400).end("bad json");
    }
  } else {
    res.writeHead(404).end("not found");
  }
});
var lastMtime = -1;
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
setInterval(() => {
  for (const res of [...clients]) {
    try {
      res.write(": ping\n\n");
    } catch {
      clients.delete(res);
    }
  }
}, 15e3).unref();
mkdirSync(FILES_DIR, { recursive: true });
server.listen(0, "127.0.0.1", () => {
  const addr = server.address();
  const port = addr && typeof addr === "object" ? addr.port : 0;
  const info = { pid: process.pid, port, started: nowIso() };
  writeFileSync(SERVER_FILE, JSON.stringify(info));
});
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
