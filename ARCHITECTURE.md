# ARCHITECTURE — helm

How the system actually turns. Pairs with `DEVRULES.md` (the non-negotiables) and `PRODUCT.md`
(what it's for). If you only read one section, read **The two loops**.

## Pieces

Three runtime pieces, one shared type, zero runtime dependencies:

- **`dist/helm.mjs`** — the CLI the agent calls for every update. Writes `state.json`, spawns the
  server on `init` / `open`, reads the human's steering on `goal`.
- **`dist/server.mjs`** — a short-lived local HTTP server. Serves the UI, streams `state.json` over
  SSE, accepts steering write-backs, self-exits when abandoned.
- **`dist/board.html`** — the browser UI. One file (CSS + JS inlined at build). Renders `BoardState`,
  edits goal/steering.
- **`src/types.ts`** — the single definition of `BoardState`; all three import it (DEVRULES A1).

## The two loops

```
   agent ── helm <cmd> ──▶ state.json ──(mtime watch)──▶ server ──SSE──▶ browser ──▶ render
                              ▲                                                          │
                              └──────────── POST /steer ◀── edit goal/steering ◀─────────┘
                              │
   agent ◀── helm goal ───────┘   (re-read the human's steering at checkpoints)
```

1. **Agent → board (push).** `helm <cmd>` mutates `state.json` with an atomic write. The server polls
   `state.json`'s mtime (300 ms) and, on change, pushes the new state to every connected browser over
   SSE. The page re-renders in place. Cost to the agent: one short CLI call (~a few tokens).
2. **Human → agent (steer).** The human edits the goal / steering note in the page and hits save; the
   page `POST`s to `/steer`; the server writes those fields into `state.json` (marking
   `steering.by = "human"`). The agent picks them up by running `helm goal` at its checkpoints — which
   prints the goal + steering and flags when the human last edited it.

The board is therefore **bidirectional** but **not magic**: the agent only sees steering when it
chooses to look (`helm goal`). SKILL.md tells it to look between plan steps and before anything
irreversible.

## Process model

- `helm init` spawns `dist/server.mjs` **detached** (`spawn(..., { detached: true })` + `unref`), with
  `HELM_RUN_DIR` pointing at the run folder. It outlives the `init` invocation.
- The server binds `127.0.0.1:0` (ephemeral port) and writes `{ pid, port }` to `<run>/.server.json`,
  which the CLI reads to build the URL and to `helm stop`.
- **Only `init` and `open` start a server.** Plain updates (`event`, `status`, …) just write
  `state.json`; if no server is running they still persist, and `helm open` brings the latest into a
  fresh server. This is deliberate: the agent never silently revives a board the human closed
  (DEVRULES R3).

## Lifecycle (self-exit, never restart)

A watcher loop in the server exits the process when any holds:

| Condition | Default | Meaning |
|---|---|---|
| had a client, now 0 for `CLIENT_GRACE` | 120 s | the board was open and got left |
| never had a client for `STARTUP_GRACE` | 300 s | the page was never opened |
| no `state.json` change for `IDLE_MAX` | 30 min | the task is abandoned |

(All overridable via `HELM_*` env vars.) On exit it removes `.server.json`. It never re-spawns
itself and is never registered to start on boot.

## Transport

Routes (all on `127.0.0.1`, internal — the stable contract is the CLI, DEVRULES A2):

| Method · path | Purpose |
|---|---|
| `GET /` | the board UI (`dist/board.html`) |
| `GET /state` | current `state.json` (pretty), the EventSource fallback |
| `GET /events` | SSE stream; pushes state on every change + a 15 s heartbeat |
| `GET /file/<name>` | image artifacts, served from `<run>/files/` |
| `POST /steer` | `{ goal?, steer? }` — the human's write-back |

**SSE framing gotcha (solved):** SSE treats a raw `\n` as a field boundary, so a multi-line
`data:` payload is silently truncated to its first line. `state.json` on disk is pretty-printed
(human-readable), but the server sends **single-line compact JSON** over SSE (string newlines become
escaped `\n`). See `readStateSse()` in `server.ts`.

## Data & persistence

- `state.json` (a serialized `BoardState`) is the only source of truth (DEVRULES A3). Writes are
  atomic (temp file + rename) so the browser never reads a half-written file.
- Run folder: `<project>/.helm/<slug>/` containing `state.json`, `.server.json`, `files/`,
  `server.log`. A `<project>/.helm/current` pointer records the active slug so the CLI can auto-find
  the board by walking up from the cwd.

## Why these choices

- **A local server (not a single `file://` page).** The bidirectional steering requires the browser
  to write back, which `file://` can't do. A tiny short-lived server is the smallest thing that
  delivers real-time push (SSE) + write-back without a daemon.
- **A CLI (not direct file edits or raw HTTP).** Direct `state.json` edits would cost the agent full
  JSON every time and risk malformed writes; raw HTTP would make the agent juggle ports and payloads.
  The CLI is the lowest-friction interface that works identically in Claude Code, Codex, or any
  Bash-capable agent (no per-tool MCP registration).
- **TypeScript, but shipped as built JS with zero runtime deps.** One language across CLI / server /
  UI and one shared `BoardState` type (the seam most likely to drift). Committing `dist/` keeps the
  skill drop-in: `node dist/helm.mjs` runs with nothing installed (DEVRULES R1/R2). TS + esbuild are
  dev-only.
