---
name: helm
description: >-
  A LIVE, steerable single-task work board for a coding agent — the human opens it once in a browser
  and watches you work, and can edit the GOAL and a STEERING note right in the page that you follow at
  your next checkpoint (via `helm goal`). You push cheap one-line updates through the bundled `helm`
  CLI (current activity, plan steps, an activity timeline, decisions & assumptions, what needs their
  input, artifacts) and the page updates in place over SSE — no reload, no flicker, a few tokens per
  update. Use this whenever: the user wants to watch what their agent is doing in real time; asks for a
  看板 / 进度面板 / dashboard / live status board; says "让我盯着你干" / "边干边给我看" / "keep me posted while you
  work"; wants to redirect or steer a long task mid-flight without stopping it; or kicks off any
  multi-step task (a migration, refactor, scaffolding, a test-fix loop, a benchmark run) long enough
  that they'd otherwise be staring at terminal logs. NOT for shipping a product UI, and NOT a one-shot
  finalized HTML report (that's the static work-canvas niche) — helm is live and two-way.
---

# helm

A **live** board for one task. The human keeps it open in a browser; you update it with cheap `helm`
calls as you work; a short-lived local server streams changes to the page in place. The human can
grab the wheel — edit the goal / steering — and you follow it at your next checkpoint.

## The two rules

1. **Only ever call `helm`. Never write or edit HTML, the server, or state.json by hand.** Each `helm`
   call is a few tokens, which is the whole point: keeping the board honest as you work stays cheap.
   Re-emitting a styled page would cost 10x and defeat it.
2. **Re-read the human's steering at every checkpoint** (between plan steps, before anything
   irreversible) with `helm goal`. They steer through the page; you only see it if you look. If the
   goal or steering changed, follow the new version and say so in an `event`.

## The helper

`helm` ships as a built, dependency-free Node script at `dist/helm.mjs` (it runs on a bare `node` —
no `npm install`, no build at install time). Capture its path once and reuse it:

```bash
HELM="<this-skill-dir>/dist/helm.mjs"   # e.g. ~/.claude/skills/helm/dist/helm.mjs
```

Call it by this path — `"$HELM" …` works via its shebang, or use `node "$HELM" …`. Don't alias it to
bare `helm` if you use Kubernetes — that's a different `helm`. After `init`, the board is auto-found
by walking up from the cwd, so later calls need no `--dir`.

## Workflow

1. **Init once**, at the start of a task worth watching. Give it the goal so the human can steer from
   the first second:
   ```bash
   "$HELM" init --title "Migrate auth to JWT" --agent "Claude Code" --model claude-opus-4-8 \
                --goal "Move sessions from cookies to stateless JWT, lose nobody"
   ```
   This starts the server and opens the browser. Tell the user the board is up and they can edit the
   goal / steering in it any time.

2. **Lay out the plan** so they see the shape of the work, then **advance through it**. `step N` marks
   earlier steps done, makes N the current activity, and sets the progress — one call moves everything:
   ```bash
   "$HELM" plan "Back up users" "Add RS256 issue/verify" "Migrate sessions" "Cut over" "Regression"
   "$HELM" step 2
   ```

3. **Narrate as you go** — small, frequent, honest. Each is one call:
   ```bash
   "$HELM" event ok   "users table backed up to backups/users.sql"
   "$HELM" event warn "3 sessions use the legacy cookie shape, need manual migration"  # pitfalls go here too
   "$HELM" decide "RS256 over HS256 so services verify with the public key only"
   "$HELM" decide "Default to staging first, prod awaits a human yes" --assumption     # flag unconfirmed assumptions
   ```

4. **Checkpoint — read the human's steering and obey it:**
   ```bash
   "$HELM" goal      # prints the GOAL + STEERING; if they edited it, that line says so — follow it
   ```
   If they changed direction, adapt and record it: `"$HELM" event info "steering changed → doing staging only"`.

5. **Surface real blockers** the moment they appear; resolve them once answered:
   ```bash
   "$HELM" ask "Migrate staging or prod DB first?"   # only genuine human-in-the-loop questions
   "$HELM" status "Waiting on your call for prod" --state blocked   # blocked/new questions notify the human
   "$HELM" resolve 1
   ```

6. **Finish:** `"$HELM" done "All sessions migrated, tests green"`. The board stays viewable, then the
   server self-exits once nobody is watching. `"$HELM" stop` ends it now; `"$HELM" open` reopens it.

Update **often and small**. A status change, a finished step, a pitfall, a decision, a new artifact —
each is one call. The board earns its place only when it tracks reality minute-to-minute.

## Commands

| Command | What it does |
|---|---|
| `helm init --title T [--subtitle S] [--agent A] [--model M] [--goal G] [--theme light\|dark] [--no-open]` | Create the board, start its server, open it. |
| `helm status TEXT [--state running\|blocked\|waiting\|done] [--phase P] [--pct N]` | Set the current-activity (NOW) line. `blocked` notifies the human. |
| `helm plan A B C …`  ·  `helm plan --add TEXT` | Set the plan steps, or append one. |
| `helm step N [--text NOW]` | Advance to step N: earlier steps done, N active, NOW + progress updated. |
| `helm event KIND TEXT` | Append a timeline entry. KIND ∈ `ok fail warn info run`. Pitfalls/dead-ends → `warn`/`fail`. |
| `helm decide TEXT [--assumption]` | Record a decision; `--assumption` flags it as unconfirmed (so the human can correct it). |
| `helm ask QUESTION`  ·  `helm resolve N` | Add / remove a "needs your input" item (notifies the human). |
| `helm goal`  ·  `helm goal --set TEXT` | **Read** the human's goal + steering (do this at checkpoints), or set the goal. |
| `helm link LABEL URL` · `helm image PATH [--label L]` · `helm data LABEL VALUE` | Attach an artifact (link / image / stat). |
| `helm meta [--title …] [--subtitle …] [--theme …] [--agent …] [--model …]` | Edit header fields later. |
| `helm done [TEXT]`  ·  `helm stop`  ·  `helm open` | Finish · stop the server now · reopen the board. |

## Conventions (handled for you, or required)

- **`ask` is for genuine decisions only.** Never pad it with resolved or rhetorical questions. If
  nothing needs the human, leave it empty — a quiet board is a truthful board.
- **`--state` drives the live pulse, color, and notifications.** Use `running` while working,
  `blocked`/`waiting` when you're stuck or waiting on the human (these ping them via a desktop
  notification + a 🔴 count in the tab title), `done` at the end.
- **Decisions vs assumptions.** Plain `decide` for choices you've committed to; `--assumption` for
  things you're *assuming* but haven't confirmed. The assumption tag is exactly where the human will
  catch you going wrong early, so flag them honestly.
- **The provenance footer and the activity legend are rendered automatically** — don't build them.
- **The process is short-lived.** It self-exits when the task is done and nobody is watching, and it
  never restarts itself. If updates happen while the page is closed, they're still saved; `helm open`
  shows the latest.

## Files

What runs (committed, dependency-free — `dist/`):
- `dist/helm.mjs` — the CLI you call for every update.
- `dist/server.mjs` — the short-lived local server: serves the UI, streams state over SSE, takes
  steering write-backs, self-exits when abandoned.
- `dist/board.html` — the board UI (two-column, lavender light + dark) the server serves.

How it's built (dev-only, not needed to run): `src/*.ts` (authored TypeScript, one shared
`types.ts` for the data model), `build.mjs` (esbuild), `package.json`. After editing `src/`, run
`npm run build`. See `DEVRULES.md` for the non-negotiables.
