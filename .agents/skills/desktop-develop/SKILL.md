---
name: desktop-develop
description: Develop, debug, and verify the OpenWork Tauri desktop shell and its daemon-served Qwen Web Shell with an agent-readable harness.
---

# Desktop Development Harness

## Overview

Use this skill to turn desktop work into a tight harness loop: gather runtime
context, reproduce with the UI and logs visible to the agent, make the smallest
fix, verify through the same path, and encode any missing affordance back into
the repo.

Read `references/harness-principles.md` when the task changes the development
workflow, observability, docs, tests, or agent-facing harness itself.

## Quick Context

For bug reports, UI failures, hangs, startup problems, messaging issues, or
anything involving the running desktop app, inspect the runtime logs directly.
Important paths on macOS:

- `~/Library/Logs/com.alibaba.openwork/desktop-runtime.log`
- `~/.qwen/` for Qwen runtime state and transcripts

Search logs before guessing:

```bash
rg -n "error|warn|failed|exception|crash|Unhandled|rejection" \
  "$HOME/Library/Logs/com.alibaba.openwork/desktop-runtime.log"
```

## Harness Loop

1. **Map the surface.** Identify whether the task touches Tauri Rust,
   bootstrap assets, Web Shell, bundled runtime, channels, or the browser
   child webview. Read nearby code and tests before editing.
2. **Collect live evidence.** Read and tail the relevant log while reproducing.
   Treat missing or ambiguous logs as part of the bug.
3. **Drive the UI.** Inspect the daemon-served Web Shell in a browser for DOM,
   accessibility, console, and network evidence; verify native behavior in the
   Tauri app and runtime log.
4. **Reproduce first.** For bugs, capture the exact observed behavior and the
   evidence that proves it. If reproduction differs from the user's report,
   compare environment, app state, build artifact, account, timing, and logs.
5. **Patch narrowly.** Keep changes scoped to the proven cause. Add structure
   only when it removes real repeated work or makes the app more readable to
   future agents.
6. **Verify through the same path.** Re-run the reproduction, inspect logs and
   DevTools again, then run focused tests/typechecks for touched packages.
7. **Improve the harness when needed.** If the fix required hidden knowledge,
   add a small doc, test, log field, or skill update so the next agent
   can see it directly.

## Running Desktop

Use desktop-specific commands from `packages/desktop-shell`:

```bash
cd packages/desktop-shell
npm install --workspaces=false
npm run build:runtime --workspaces=false
npm run dev --workspaces=false
```

Reuse the prepared runtime on later runs. Set
`OPENWORK_DESKTOP_WORKSPACE=/absolute/path` for an isolated workspace.

## Web Shell inspection

Run `npm run smoke:runtime --workspaces=false` to launch and probe the bundled
loopback runtime. Use `npm run dev --workspaces=false` for native behavior; do
not substitute the retired Electron renderer.

## Focused Verification

Choose the narrowest checks that cover the touched surface:

```bash
cd packages/desktop-shell && npm test --workspaces=false
cd packages/desktop-shell && npm run test:migration --workspaces=false
cd packages/desktop-shell && npm run test:release --workspaces=false
cd packages/desktop-shell && npm run smoke:runtime --workspaces=false
npm run typecheck --workspace=packages/web-shell
```

For root CLI/core changes, use the root repository commands from `AGENTS.md`
instead. For desktop-only changes, prefer desktop package commands first.

## Agent-Readable Changes

Favor changes that future agents can inspect and verify:

- Add structured log fields near failure boundaries instead of vague messages.
- Add accessible names or stable UI affordances when DevTools snapshots are
  hard to interpret.
- Keep docs as maps with links to deeper sources. Do not create giant manuals.
- Convert repeated manual debugging steps into docs, tests, or structured logs.
- Record non-trivial investigation notes in `.qwen/investigations/`.

Stop and ask the user only when the missing input cannot be discovered locally
and a reasonable assumption would risk changing the wrong behavior.
