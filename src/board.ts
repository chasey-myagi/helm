// helm board frontend. Bundled by esbuild and inlined into dist/board.html.
// Connects to /events (SSE), renders BoardState in place, lets the human edit
// goal/steering (POST /steer), and notifies on blocked / new questions.
import type { Artifact, BoardState, EventKind, StatusState, Steering } from "./types.js";

const KIND: Record<EventKind, { c: string; l: string }> = {
  ok: { c: "var(--ok)", l: "成功" },
  fail: { c: "var(--block)", l: "失败" },
  warn: { c: "var(--warn)", l: "注意" },
  info: { c: "var(--info)", l: "信息" },
  run: { c: "var(--run)", l: "进行" },
};
const STATEL: Record<StatusState, string> = { running: "running", blocked: "blocked", waiting: "waiting", done: "done" };

let es: EventSource | null = null;
let paused = false;
let steerDirty = false;
let lastState: BoardState | null = null;
const prev = { blocked: false, needs: 0 };

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error("missing #" + id);
  return e as T;
}
function esc(s: unknown): string {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}
function md(s: string): string {
  return esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\n/g, "<br>");
}
function pd(iso?: string): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}
function shortTime(iso?: string): string {
  const d = pd(iso);
  if (!d) return "";
  const n = new Date();
  const sameDay = d.toDateString() === n.toDateString();
  const hm = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return sameDay ? hm : d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + hm;
}
function rel(iso?: string): string {
  const d = pd(iso);
  if (!d) return "—";
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return s + "s ago";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return Math.floor(s / 86400) + "d ago";
}
function elapsed(iso?: string): string {
  const d = pd(iso);
  if (!d) return "";
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return s + "s";
  if (s < 3600) return Math.floor(s / 60) + "m" + (s % 60) + "s";
  return Math.floor(s / 3600) + "h" + Math.floor((s % 3600) / 60) + "m";
}
const clamp = (n: number) => Math.max(0, Math.min(100, n));
const sec = (ic: string, t: string) => `<div class="sec-h"><span class="ic">${ic}</span>${t}</div>`;
const chip = (state: string) => `<span class="chip ${esc(state)}"><span class="dot"></span>${esc(STATEL[state as StatusState] ?? state)}</span>`;

function render(b: BoardState): void {
  lastState = b;
  const nc = b.needs?.length ?? 0;
  document.title = (nc || b.status?.state === "blocked" ? "🔴" + (nc || "") + " " : "") + (b.title || "helm");
  el("empty").style.display = "none";
  el("wrap").style.display = "";

  el("h-title").textContent = b.title || "helm";
  el("h-task").textContent = b.subtitle || "";
  const st = b.status;
  el("h-state").innerHTML = st?.state ? chip(st.state) : "";
  el("h-upd").textContent = (st && typeof st.pct === "number" ? st.pct + "% · " : "") + "updated " + rel(b.meta?.updated);
  const fill = el("topfill");
  fill.style.width = (st && typeof st.pct === "number" ? clamp(st.pct) : 0) + "%";
  fill.style.background = st?.state === "blocked" ? "var(--block)" : st?.state === "done" ? "var(--ok)" : "var(--run)";

  // left top: NOW + PLAN
  const h: string[] = [];
  if (st && (st.text || st.state)) {
    h.push('<section><div class="eyebrow">现在</div>');
    h.push(`<div class="now-line">${esc(st.text || "")}</div><div class="now-meta">`);
    if (st.state) h.push(chip(st.state));
    const nm: string[] = [];
    if (st.phase) nm.push(`<b>${esc(st.phase)}</b>`);
    if (st.since && st.state === "running") nm.push("已跑 " + elapsed(st.since));
    if (nm.length) h.push(`<span class="now-step">› ${nm.join(" · ")}</span>`);
    h.push("</div></section>");
  }
  if (b.plan?.length) {
    const done = b.plan.filter((p) => p.status === "done").length;
    h.push(`<section><div class="eyebrow">计划 <span class="ct">${done} / ${b.plan.length}</span></div><ol class="plan">`);
    b.plan.forEach((p, i) => {
      const c = p.status === "done" ? "done" : p.status === "active" ? "active" : "";
      h.push(`<li class="${c}"><span class="mk">${p.status === "done" ? "✓" : ""}</span><span class="n">${i + 1}</span><span class="t">${esc(p.text)}</span></li>`);
    });
    h.push("</ol></section>");
  }
  el("l-top").innerHTML = h.join("");

  // steering (persistent; don't clobber while editing)
  const sg = el("l-steer");
  if (b.steering && (b.steering.goal || b.steering.steer || st?.text)) {
    sg.style.display = "";
    renderSteer(b.steering);
  }

  // needs
  let nh = "";
  if (b.needs?.length) {
    nh = `<div class="needs"><h3>⚡ 需要你拍板 <span class="badge">${b.needs.length}</span></h3><ol>`;
    b.needs.forEach((n) => (nh += "<li>" + md(n.q) + "</li>"));
    nh += "</ol></div>";
  }
  el("l-needs").innerHTML = nh;

  // right
  const r: string[] = [];
  if (b.events?.length) {
    r.push("<section>" + sec("▤", '活动 <span class="meta">最新在上</span>'));
    const used: Partial<Record<EventKind, boolean>> = {};
    b.events.forEach((e) => (used[e.kind] = true));
    const lg = (Object.keys(KIND) as EventKind[])
      .filter((k) => used[k])
      .map((k) => `<i><span class="sw" style="background:${KIND[k].c}"></span>${KIND[k].l}</i>`)
      .join("");
    if (lg) r.push(`<div class="legend">${lg}</div>`);
    r.push('<div class="tl">');
    b.events.slice().reverse().forEach((e) => {
      r.push(`<div class="tl-item"><span class="tl-dot" style="background:${(KIND[e.kind] ?? KIND.info).c}"></span><div class="tl-time">${esc(shortTime(e.ts))}</div><div class="tl-text">${md(e.text)}</div></div>`);
    });
    r.push("</div></section>");
  }
  if (b.decisions?.length) {
    r.push("<section>" + sec("◇", "决策 &amp; 假设") + '<ul class="dec">');
    b.decisions.forEach((d) => {
      r.push(`<li class="${d.assumption ? "asm" : ""}"><span class="lead"></span><div>${md(d.text)}${d.assumption ? '<span class="tag">assumption</span>' : ""}</div></li>`);
    });
    r.push("</ul></section>");
  }
  if (b.artifacts?.length) {
    r.push("<section>" + sec("⛓", "产物") + '<div class="arts">');
    b.artifacts.forEach((a: Artifact) => {
      if (a.type === "image") r.push(`<img class="thumb" src="${esc(a.url)}" alt="${esc(a.label)}" data-cap="${esc(a.label)}">`);
      else if (a.type === "data") r.push(`<div class="datastat">${md(a.label)} <b>${esc(a.value)}</b></div>`);
      else r.push(`<a class="linkchip" href="${esc(a.url)}" target="_blank" rel="noopener"><span class="ic">↗</span>${esc(a.label || a.url)}</a>`);
    });
    r.push("</div></section>");
  }
  el("r-main").innerHTML = r.join("");
  bindThumbs();

  let by = b.meta?.agent || "agent";
  if (b.meta?.model) by += " → " + b.meta.model;
  el("foot").textContent = "built by " + by + " · helm 实时看板，SSE 推送 · 进程将在任务结束或空闲后自动退出";

  notify(b);
}

function renderSteer(s: Steering): void {
  const goalEl = el("f-goal");
  const steerEl = el("f-steer");
  if (steerDirty || document.activeElement === goalEl || document.activeElement === steerEl) return;
  goalEl.textContent = s.goal || "";
  steerEl.textContent = s.steer || "";
  el("steer-foot").classList.remove("dirty");
  el("steer-hint").innerHTML = '<span class="d"></span>已保存 · agent 将在下一步读取';
}

function notify(b: BoardState): void {
  const blocked = b.status?.state === "blocked";
  const nc = b.needs?.length ?? 0;
  if ("Notification" in window && Notification.permission === "granted") {
    if (blocked && !prev.blocked) new Notification("helm · 卡住了", { body: b.status?.text || "任务受阻", tag: "helm-block" });
    if (nc > prev.needs) new Notification("helm · 需要你拍板", { body: b.needs[nc - 1].q, tag: "helm-need" });
  }
  prev.blocked = blocked;
  prev.needs = nc;
}

function bindThumbs(): void {
  const dlg = el<HTMLDialogElement>("lightbox");
  const img = dlg.querySelector("img") as HTMLImageElement;
  const cap = dlg.querySelector(".cap") as HTMLElement;
  document.querySelectorAll<HTMLImageElement>(".thumb").forEach((t) => {
    t.onclick = () => {
      img.src = t.src;
      cap.textContent = t.dataset.cap || "";
      dlg.showModal();
    };
  });
  dlg.onclick = () => dlg.close();
}

// ---- steering edit ----
function markDirty(): void {
  steerDirty = true;
  el("steer-foot").classList.add("dirty");
  el("steer-hint").innerHTML = '<span class="d"></span>未保存 · 改了目标/操舵记得保存';
}
function saveSteer(): void {
  const goal = el("f-goal").innerText.trim();
  const steer = el("f-steer").innerText.trim();
  el("steer-hint").innerHTML = '<span class="d"></span>保存中…';
  fetch("/steer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ goal, steer }) })
    .then((res) => {
      if (!res.ok) throw new Error("bad");
      steerDirty = false;
      el("steer-foot").classList.remove("dirty");
      el("steer-hint").innerHTML = '<span class="d"></span>已保存 ✓ · agent 将在下一步读取';
    })
    .catch(() => (el("steer-hint").innerHTML = '<span class="d"></span>保存失败，重试'));
}

// ---- live ----
function handle(data: string): void {
  if (paused) return;
  try {
    render(JSON.parse(data) as BoardState);
  } catch {
    /* ignore malformed frame */
  }
}
function connect(): void {
  if (es) es.close();
  es = new EventSource("/events");
  es.onmessage = (e) => {
    document.body.classList.remove("lost");
    handle(e.data);
  };
  es.onopen = () => document.body.classList.remove("lost");
  es.onerror = () => document.body.classList.add("lost");
}

document.addEventListener("DOMContentLoaded", () => {
  el("btn-theme").onclick = () => {
    const n = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", n);
    try {
      localStorage.setItem("helm-theme", n);
    } catch {
      /* ignore */
    }
  };
  const pb = el("btn-pause");
  pb.onclick = () => {
    paused = !paused;
    pb.textContent = paused ? "▶" : "⏸";
    pb.classList.toggle("on", paused);
    pb.title = paused ? "恢复自动刷新" : "暂停自动刷新";
    if (!paused) {
      if (lastState) render(lastState);
      connect();
    } else if (es) es.close();
  };
  el("f-goal").addEventListener("input", markDirty);
  el("f-steer").addEventListener("input", markDirty);
  el("steer-save").onclick = saveSteer;
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && steerDirty) saveSteer();
  });
  if ("Notification" in window && Notification.permission === "default") {
    try {
      void Notification.requestPermission();
    } catch {
      /* ignore */
    }
  }
  connect();
  setInterval(() => {
    if (lastState) {
      el("h-upd").textContent = (lastState.status && typeof lastState.status.pct === "number" ? lastState.status.pct + "% · " : "") + "updated " + rel(lastState.meta?.updated);
    }
  }, 1000);
});
