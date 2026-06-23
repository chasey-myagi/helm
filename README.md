# 🧭 helm

> **Watch your coding agent work — and take the helm.**
> A live, *steerable* board your agent keeps while it works. Glance at it; grab the wheel any time.
> <sub>实时可操舵的单任务看板:agent 干活时你看着,随时改目标,它下一步就跟上。</sub>

**English** | [中文](README.zh-CN.md)

![Agent Skill](https://img.shields.io/badge/Agent-Skill-7c5cd0)
![Claude Code](https://img.shields.io/badge/Claude%20Code-%E2%9C%93-d97757)
![Codex](https://img.shields.io/badge/Codex-%E2%9C%93-2b8fb0)
![runtime](https://img.shields.io/badge/runtime-Node%20stdlib%20·%20zero%20deps-2f8f5b)
![License](https://img.shields.io/badge/license-MIT-blue)
[![skills.sh](https://skills.sh/b/chasey-myagi/helm)](https://skills.sh/s/chasey-myagi/helm)

![helm demo](examples/demo.gif)

> *The agent works → it hits a fork and needs you (the board turns red, you get a notification) → you type one line of steering on the board → it reads it and carries on (staging only). That loop — you change direction mid-task, the agent follows — is what helm is.*

Most "watch your agent" tools are one-way mirrors: you can look, but if it drifts you wait until it's done. helm makes the board a **steering wheel**. You edit the **goal** or a **steering note** right on the page; the agent re-reads them at its next checkpoint (`helm goal`) and adjusts course. No reload, no flicker, no lingering process — and each update costs the agent only a few tokens, so the board stays honest minute to minute.

## When you'll reach for it

- **A long task you want to watch without hovering.** A migration, a refactor, a test-fix loop. You work on something else; a glance at the board tells you where it is and whether it's stuck.
- **You want to correct course without interrupting.** Heading the wrong way? Change the goal in one line ("staging only", "don't touch the schema"). No interrupt, no new prompt — it follows on the next step.
- **It should call you, not the other way around.** When it genuinely needs a decision, the board lights up "needs you", with a desktop notification and a 🔴 count in the tab title.

## What you get

A live board on `127.0.0.1` (warm light, dark on toggle):

- **Left, always in view** — Now (current action, status pulse, progress) · Plan (steps as progress) · **Your steering** (editable goal + note, saved back to the agent) · Needs-you.
- **Right, the stream** — Activity timeline (color-coded, pitfalls included) · Decisions & assumptions (assumptions flagged, so you catch a wrong turn early) · Artifacts (links, images, data).

A real board's state lives in [`examples/sample-board.json`](examples/sample-board.json).

## Install

helm is **drop-in**: zero runtime dependencies, runs on Node's stdlib. No `npm install`, no build step.

```bash
npx skills add chasey-myagi/helm          # via skills.sh
# …or just drop the folder in:
cp -r helm ~/.claude/skills/              # Claude Code · Codex · any SKILL.md runtime
```

> ⚠️ Don't alias the CLI to bare `helm` — it collides with Kubernetes' `helm`. Call it by path (the SKILL.md does).

## Triggering it

Just ask, in any of these shapes (English or 中文):

- "do X, and give me a **live board** to watch progress"
- "I'm stepping away — put up a **board** I can come back to, and let me **change the goal**"
- "这个迁移分几步,我想**盯着**、卡住了**叫我**"
- "keep me posted on a live board while you refactor this"

**Tip:** the surest trigger is to *name the board* — "give me a helm board", "做个 helm 看板". On a long multi-step task a capable agent will often offer one on its own; if it doesn't, just ask.

## How the agent drives it

```bash
HELM=~/.claude/skills/helm/dist/helm.mjs

$HELM init --title "Migrate auth → JWT" --goal "Move sessions to stateless JWT, lose nobody"
$HELM plan "Back up users" "Add RS256" "Migrate sessions" "Cut over" "Regression"
$HELM step 2                                    # 1 done, 2 active, progress auto-set
$HELM event ok "users table backed up"
$HELM decide "RS256 over HS256" ; $HELM decide "staging first" --assumption
$HELM goal                                      # checkpoint: read the human's edits, follow them
$HELM ask "Staging or prod first?"              # a real blocker → notifies the human
$HELM done "All sessions migrated, tests green"
```

Full command reference in [`SKILL.md`](SKILL.md).

## How it's different

| | **helm** | [work-canvas](https://github.com/JingbiaoMei/work-canvas-skill) | [vibe-kanban](https://github.com/BloopAI/vibe-kanban) · [agent-kanban](https://github.com/saltbo/agent-kanban) |
|---|---|---|---|
| Form | **live board (SSE)** | static HTML snapshot, finalized once | live board |
| Direction | **two-way — you edit the goal, it follows** | one-way, read-only | mostly task assignment |
| Scope | **single task, one focus** | single artifact | multi-agent fleet |
| Install | **zero-dep drop-in** | paste-to-install ritual | `npx`, runs a server |

Live boards exist. Static self-contained reports exist. Multi-agent fleet boards are a crowded field. But **single task + you change the goal mid-run + the agent follows** — that lane is helm's.

## Built with helm 🥏

This repo was built while helm watched. The board in the demo above is the same one that tracked helm's *own* development — the plan, the decisions, the moments it needed a human call — from first sketch to this README. Dogfooded end to end.

## Safety

- **Writes only its own state.** helm writes `<project>/.helm/<task>/state.json` and serves a local read-only board. It never touches your source and makes no outbound requests.
- **No daemon, no resurrection.** The board process exits on its own when nobody's watching or the task has gone idle. It never auto-starts and never restarts itself.
- **Honest by design.** The agent follows your steering at checkpoints (it calls `helm goal`); it doesn't pretend to be interruptible mid-step. Assumptions are tagged `assumption` so a wrong turn is easy to catch early.

## What's in the repo

```
helm/
├── SKILL.md      how the agent uses it (triggers · workflow · commands)
├── dist/         runtime, committed, zero-dep:  helm.mjs · server.mjs · board.html
├── src/          TypeScript source:  types.ts (shared BoardState) · cli · server · board
├── examples/     sample-board.json · demo.gif · record-demo.sh (reproducible demo)
├── *.md          PRODUCT · DESIGN · DEVRULES · ARCHITECTURE
└── build.mjs · package.json · tsconfig*   (dev only — esbuild + tsc)
```

Edit `src/`, run `npm run build` to regenerate `dist/`. Design notes in [`DESIGN.md`](DESIGN.md); the technical design in [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Validation

- **Browser, end to end:** init → live SSE updates → edit steering on the page → `helm goal` reads it → blocked notification → process self-exits. All verified.
- **Eval (skill-creator):** 3 real multi-step tasks, with vs without the skill. With helm, board-quality assertions passed **100% (22/22) vs 13.7% without** — and the agent's process variance dropped sharply (tokens ±0.5k vs ±9.4k).

## License

[MIT](LICENSE) © 2026 chasey
