# DEVRULES — helm

Day-one, non-negotiable rules for this repo. Every change must respect them; a change that
violates one is a regression, not a tradeoff. They exist so helm stays a **drop-in skill** even
though it's authored in TypeScript.

## Runtime

- **R1 — Zero runtime dependencies.** Runtime code uses only the Node standard library
  (`node:http`, `node:fs`, `node:child_process`, …). `dependencies` in `package.json` stays
  **empty**; everything is `devDependencies`. The installed skill runs with a bare `node` and
  nothing else.
- **R2 — Drop-in invariant.** This must work on a machine that has only Node:
  ```bash
  cp -r helm ~/.claude/skills/ && node ~/.claude/skills/helm/dist/helm.mjs init
  ```
  No `npm install`, no build at install time. Breaking this is a release blocker.
- **R3 — No daemon, no auto-revive.** The board server is short-lived: it self-exits when the
  board is abandoned, and is only ever started by `helm init` / `helm open`. It must never persist
  across reboots or restart itself.

## Source & build

- **B1 — Author in `src/*.ts`; ship `dist/` (committed).** `dist/` is produced by `npm run build`
  (esbuild). Never hand-edit `dist/`.
- **B2 — `dist/` stays in sync with `src/`.** Run `npm run build` before committing.
  `npm run check` (typecheck + `dist` freshness) must pass.
- **B3 — TypeScript & esbuild are dev-only.** They never enter the runtime path.

## Architecture contracts

- **A1 — One data model.** `src/types.ts` is the single definition of `BoardState` and the
  command / HTTP payloads. Server, CLI, and frontend all import it; nobody re-declares the shape.
- **A2 — The agent-facing contract is the `helm` CLI.** HTTP routes and the `state.json` schema are
  internal; only documented `helm` commands are the stable surface SKILL.md promises. Refactor
  internals freely, keep the CLI stable.
- **A3 — `state.json` is the only source of truth.** The CLI writes it atomically; the server
  watches and serves it; the page edits it via `POST /steer`. No other persistence.

## Verify

- **V1 — Browser-verified.** A change to UI / SSE / steering / lifecycle isn't done until it's been
  run in a real browser: init → live update → steering write-back → blocked notification →
  lifecycle self-exit.
