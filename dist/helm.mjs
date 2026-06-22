#!/usr/bin/env node
// src/cli.ts
import {
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
  existsSync,
  copyFileSync,
  openSync
} from "node:fs";
import { dirname, join, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { parseArgs } from "node:util";

// src/types.ts
function emptyState(init) {
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
    artifacts: []
  };
}

// src/cli.ts
var ASSET_DIR = dirname(fileURLToPath(import.meta.url));
var SERVER_MJS = join(ASSET_DIR, "server.mjs");
var EVENT_KINDS = ["ok", "fail", "warn", "info", "run"];
var STATE_STATES = ["running", "blocked", "waiting", "done"];
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function die(msg) {
  console.error("helm: " + msg);
  process.exit(1);
}
function slugify(s) {
  const out = (s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return out || "board";
}
function atomicWrite(path, text) {
  const tmp = join(dirname(path), `.helm-tmp-${process.pid}-${Date.now()}`);
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}
function findRun(explicit) {
  if (explicit) return resolve(explicit);
  if (process.env.HELM_RUN_DIR) return resolve(process.env.HELM_RUN_DIR);
  let cur = process.cwd();
  for (; ; ) {
    const ptr = join(cur, ".helm", "current");
    if (existsSync(ptr)) {
      const slug = readFileSync(ptr, "utf8").trim();
      const cand = join(cur, ".helm", slug);
      if (existsSync(join(cand, "state.json"))) return cand;
    }
    const parent = dirname(cur);
    if (parent === cur) return null;
    cur = parent;
  }
}
function requireRun(dir) {
  const d = findRun(dir);
  if (!d || !existsSync(join(d, "state.json"))) die("no board found \u2014 run `helm init` first (or pass --dir DIR).");
  return d;
}
function load(run) {
  return JSON.parse(readFileSync(join(run, "state.json"), "utf8"));
}
function save(run, st) {
  st.meta = st.meta ?? { agent: "", model: "", started: nowIso(), updated: nowIso() };
  st.meta.updated = nowIso();
  atomicWrite(join(run, "state.json"), JSON.stringify(st, null, 2));
}
function serverInfo(run) {
  try {
    const info = JSON.parse(readFileSync(join(run, ".server.json"), "utf8"));
    process.kill(info.pid, 0);
    return info;
  } catch {
    return null;
  }
}
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function ensureServer(run) {
  const existing = serverInfo(run);
  if (existing) return existing;
  const log = openSync(join(run, "server.log"), "a");
  const child = spawn(process.execPath, [SERVER_MJS], {
    env: { ...process.env, HELM_RUN_DIR: run },
    detached: true,
    stdio: ["ignore", log, log]
  });
  child.unref();
  for (let i = 0; i < 50; i++) {
    await sleep(100);
    const info = serverInfo(run);
    if (info) return info;
  }
  return die("server did not come up \u2014 see " + join(run, "server.log"));
}
var urlOf = (info) => `http://127.0.0.1:${info.port}/`;
var openBrowser = (url) => spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
function upsertArtifact(list, match, entry) {
  const i = list.findIndex(match);
  if (i >= 0) list[i] = entry;
  else list.push(entry);
}
async function cmdInit(o, rest) {
  const base = o.dir ? resolve(o.dir) : join(process.cwd(), ".helm", slugify(o.title ?? ""));
  mkdirSync(base, { recursive: true });
  const helmDir = dirname(base);
  if (basename(helmDir) === ".helm") atomicWrite(join(helmDir, "current"), basename(base));
  const theme = o.theme === "dark" ? "dark" : "light";
  const st = emptyState({
    title: o.title ?? "helm board",
    subtitle: o.subtitle ?? "",
    theme,
    agent: o.agent ?? "",
    model: o.model ?? "",
    goal: o.goal ?? "",
    now: nowIso()
  });
  save(base, st);
  const info = await ensureServer(base);
  const url = urlOf(info);
  console.log("\u2713 helm board: " + url);
  console.log("  update:   " + process.argv[1] + "   (auto-finds this board)");
  console.log("  steering: " + process.argv[1] + " goal   (re-read at each checkpoint)");
  if (!o["no-open"] && !process.env.HELM_NO_OPEN) openBrowser(url);
}
function cmdStatus(o, rest) {
  const text = rest[0];
  if (!text) die("usage: helm status TEXT [--state \u2026] [--phase \u2026] [--pct N]");
  const run = requireRun(o.dir);
  const st = load(run);
  const cur = st.status ?? null;
  const state = o.state || cur?.state || "running";
  if (o.state && !STATE_STATES.includes(state)) die("state must be one of: " + STATE_STATES.join(", "));
  let since = cur?.since;
  if (state === "running" && (cur?.text !== text || cur?.state !== "running" || !since)) since = nowIso();
  st.status = {
    text,
    state,
    phase: o.phase ?? cur?.phase,
    pct: o.pct !== void 0 ? parseInt(o.pct, 10) : cur?.pct,
    since: state === "running" ? since : void 0
  };
  save(run, st);
  console.log("\xB7 status: " + text);
}
function cmdPlan(o, rest) {
  const run = requireRun(o.dir);
  const st = load(run);
  if (o.add) st.plan.push({ text: o.add, status: "todo" });
  else if (rest.length) st.plan = rest.map((t) => ({ text: t, status: "todo" }));
  else die("give steps (`helm plan A B C`) or `--add TEXT`.");
  save(run, st);
  console.log(`\xB7 plan: ${st.plan.length} step(s)`);
}
function cmdStep(o, rest) {
  const run = requireRun(o.dir);
  const st = load(run);
  const n = parseInt(rest[0] ?? "", 10);
  if (!Number.isInteger(n) || n < 1 || n > st.plan.length)
    die(`no step ${rest[0]} (plan has ${st.plan.length}). Set a plan first with \`helm plan \u2026\`.`);
  st.plan.forEach((p, i) => p.status = i + 1 < n ? "done" : i + 1 === n ? "active" : "todo");
  st.status = {
    text: o.text ?? st.plan[n - 1].text,
    state: "running",
    phase: `step ${n}/${st.plan.length}`,
    pct: Math.round((n - 1) / st.plan.length * 100),
    since: nowIso()
  };
  save(run, st);
  console.log(`\xB7 step ${n}/${st.plan.length}: ${st.status.text}`);
}
function cmdEvent(o, rest) {
  const [kind, text] = rest;
  if (!EVENT_KINDS.includes(kind)) die("kind must be one of: " + EVENT_KINDS.join(", "));
  if (!text) die("usage: helm event KIND TEXT");
  const run = requireRun(o.dir);
  const st = load(run);
  st.events.push({ kind, text, ts: nowIso() });
  save(run, st);
  console.log(`\xB7 event ${kind}: ${text}`);
}
function cmdAsk(o, rest) {
  const q = rest[0];
  if (!q) die("usage: helm ask QUESTION");
  const run = requireRun(o.dir);
  const st = load(run);
  st.needs.push({ q, ts: nowIso() });
  save(run, st);
  console.log("\xB7 needs input: " + q);
}
function cmdResolve(o, rest) {
  const run = requireRun(o.dir);
  const st = load(run);
  const i = parseInt(rest[0] ?? "", 10) - 1;
  if (!(i >= 0 && i < st.needs.length)) die(`no open question #${rest[0]} (have ${st.needs.length}).`);
  const [gone] = st.needs.splice(i, 1);
  save(run, st);
  console.log("\xB7 resolved: " + gone.q);
}
function cmdDecide(o, rest) {
  const text = rest[0];
  if (!text) die("usage: helm decide TEXT [--assumption]");
  const run = requireRun(o.dir);
  const st = load(run);
  st.decisions.push({ text, assumption: Boolean(o.assumption) });
  save(run, st);
  console.log(`\xB7 ${o.assumption ? "assumption" : "decision"}: ${text}`);
}
function cmdLink(o, rest) {
  const [label, url] = rest;
  if (!label || !url) die("usage: helm link LABEL URL");
  const run = requireRun(o.dir);
  const st = load(run);
  upsertArtifact(st.artifacts, (a) => a.label === label, { type: "link", label, url });
  save(run, st);
  console.log(`\xB7 link ${label} \u2192 ${url}`);
}
function cmdImage(o, rest) {
  const src = rest[0] ? resolve(rest[0]) : "";
  if (!src || !existsSync(src)) die("no such image: " + src);
  const run = requireRun(o.dir);
  const files = join(run, "files");
  mkdirSync(files, { recursive: true });
  const name = basename(src);
  copyFileSync(src, join(files, name));
  const st = load(run);
  upsertArtifact(st.artifacts, (a) => a.type === "image" && a.url === "/file/" + name, {
    type: "image",
    label: o.label ?? name,
    url: "/file/" + name
  });
  save(run, st);
  console.log("\xB7 image: " + name);
}
function cmdData(o, rest) {
  const [label, value] = rest;
  if (!label || value === void 0) die("usage: helm data LABEL VALUE");
  const run = requireRun(o.dir);
  const st = load(run);
  upsertArtifact(st.artifacts, (a) => a.label === label, { type: "data", label, value });
  save(run, st);
  console.log(`\xB7 data ${label} = ${value}`);
}
function cmdGoal(o, rest) {
  const run = requireRun(o.dir);
  const st = load(run);
  if (o.set !== void 0) {
    st.steering.goal = o.set;
    st.steering.updated = nowIso();
    st.steering.by = "agent";
    save(run, st);
    console.log("\xB7 goal set");
    return;
  }
  const goal = (st.steering.goal || "").trim();
  const steer = (st.steering.steer || "").trim();
  const out = ["GOAL: " + (goal || "(none set)")];
  if (steer) out.push("STEER: " + steer);
  if (st.steering.by === "human") out.push("(^ last edited by the human \u2014 follow it)");
  console.log(out.join("\n"));
}
function cmdMeta(o, rest) {
  const run = requireRun(o.dir);
  const st = load(run);
  if (o.title !== void 0) st.title = o.title;
  if (o.subtitle !== void 0) st.subtitle = o.subtitle;
  if (o.theme !== void 0) st.theme = o.theme === "dark" ? "dark" : "light";
  if (o.agent !== void 0) st.meta.agent = o.agent;
  if (o.model !== void 0) st.meta.model = o.model;
  save(run, st);
  console.log("\xB7 meta updated");
}
function cmdDone(o, rest) {
  const run = requireRun(o.dir);
  const st = load(run);
  const text = rest[0];
  const cur = st.status ?? { text: "Done", state: "done" };
  cur.text = text ?? cur.text ?? "Done";
  cur.state = "done";
  cur.pct = 100;
  delete cur.since;
  st.status = cur;
  for (const p of st.plan) if (p.status === "active") p.status = "done";
  if (text) st.events.push({ kind: "ok", text, ts: nowIso() });
  save(run, st);
  console.log("\xB7 board marked done");
}
async function cmdOpen(o) {
  const run = requireRun(o.dir);
  const info = await ensureServer(run);
  const url = urlOf(info);
  console.log(url);
  if (!process.env.HELM_NO_OPEN) openBrowser(url);
}
function cmdStop(o) {
  const run = requireRun(o.dir);
  const info = serverInfo(run);
  if (!info) {
    console.log("\xB7 no server running");
    return;
  }
  try {
    process.kill(info.pid, "SIGTERM");
    console.log(`\xB7 stopped server (pid ${info.pid})`);
  } catch (err) {
    die("could not stop server: " + String(err));
  }
}
async function main() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    strict: false,
    options: {
      dir: { type: "string" },
      title: { type: "string" },
      subtitle: { type: "string" },
      agent: { type: "string" },
      model: { type: "string" },
      goal: { type: "string" },
      theme: { type: "string" },
      state: { type: "string" },
      phase: { type: "string" },
      pct: { type: "string" },
      add: { type: "string" },
      text: { type: "string" },
      assumption: { type: "boolean" },
      label: { type: "string" },
      set: { type: "string" },
      "no-open": { type: "boolean" }
    }
  });
  const o = values;
  const cmd = positionals[0];
  const rest = positionals.slice(1);
  switch (cmd) {
    case "init":
      return cmdInit(o, rest);
    case "status":
      return cmdStatus(o, rest);
    case "plan":
      return cmdPlan(o, rest);
    case "step":
      return cmdStep(o, rest);
    case "event":
      return cmdEvent(o, rest);
    case "ask":
      return cmdAsk(o, rest);
    case "resolve":
      return cmdResolve(o, rest);
    case "decide":
      return cmdDecide(o, rest);
    case "link":
      return cmdLink(o, rest);
    case "image":
      return cmdImage(o, rest);
    case "data":
      return cmdData(o, rest);
    case "goal":
      return cmdGoal(o, rest);
    case "meta":
      return cmdMeta(o, rest);
    case "done":
      return cmdDone(o, rest);
    case "open":
      return cmdOpen(o);
    case "stop":
      return cmdStop(o);
    default:
      die(`unknown command: ${cmd ?? "(none)"}. See SKILL.md for the command list.`);
  }
}
main();
