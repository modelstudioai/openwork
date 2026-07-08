# Feature Ledger

Working memory for the autonomous desktop-feature loop. Each run appends or
updates a row here.

**GitHub is the source of truth.** At the start of every run the loop reconciles
this file against GitHub issues/PRs labeled `loop-bot`, so merge/close state is
authoritative there — this table is the loop's human-readable index and learning
log, not the system of record.

## Status legend

| status | meaning |
| --- | --- |
| `proposed` | Identified as a gap, not started. |
| `in-progress` | Issue filed, branch open, implementation underway. |
| `pr-open` | PR submitted, awaiting human review/merge. |
| `merged` | PR merged — feature shipped. |
| `rejected` | PR closed **without** merging. Record **why** in Notes. |
| `blocked` | Not doable as a frontend-only change (needs qwen-code backend) or otherwise infeasible. Record **why**. |

## Selection rules

- Never pick a feature whose latest status is `merged`, `rejected`, `blocked`, or
  `in-progress`.
- `rejected` rows are **learning signals**: read the PR's close reason / review
  comments before considering the area again, and only retry with a clearly
  different and better approach.
- Keep the newest entries at the top.

## Ledger

| slug | title | source | feasibility | status | issue | pr | branch | updated | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| copy-message | "Copy" (copy-as-Markdown) action on assistant/agent responses | Codex desktop "Copy as Markdown" (openai/codex #2880, #17241) + Claude/ChatGPT desktop per-message copy | frontend-only | pr-open | [#70](https://github.com/modelstudioai/openwork/issues/70) | [#71](https://github.com/modelstudioai/openwork/pull/71) | loop/copy-message | 2026-07-08 | User messages + code blocks were already copyable, but full assistant responses had only a pop-out button — no copy. Extracted `AssistantMessage` component in `ChatDisplay.tsx` (owns `copied` state, mirrors the existing `ErrorMessage` extraction) with a hover copy button next to pop-out; copies raw `message.content` via `navigator.clipboard.writeText`, 2s "copied" check state, `toast.copyFailed` on error. **Zero new i18n keys** (reuses `common.copy`/`common.copied`/`toast.copyFailed`). Added a general `seed` hook to the e2e harness (`app.ts`/`runner.ts`) so assertions can pre-seed an on-disk session the embedded `SessionManager` loads on boot (no backend). typecheck:all zero-delta; `bun test` 56-failure set byte-identical to main; renderer build ✅; i18n parity ✅ (1544 keys); eslint 0 errors. CDP assertion (`copy-message.assert.ts`) seeds a user+assistant session, opens it, clicks the copy button, and asserts the exact response markdown reaches the (stubbed) clipboard + the button enters its copied state; **could not run locally** (org egress policy 403s the Electron binary download — same block as prior rounds). |
| reduce-motion | "Reduce motion" accessibility setting in Appearance | Claude desktop / macOS / Windows reduce-motion + `prefers-reduced-motion` | frontend-only | merged | [#50](https://github.com/modelstudioai/openwork/issues/50) | [#51](https://github.com/modelstudioai/openwork/pull/51) | loop/reduce-motion | 2026-07-08 | **Merged** into `main` (2026-07-06). Renderer-only pref (localStorage) applied app-wide via `<MotionConfig reducedMotion>` + `data-reduce-motion` on `<html>` + global CSS guard. Off ⇒ `reducedMotion="user"` (still honors OS). New `ReduceMotionProvider` in `main.tsx`; toggle in Appearance→Interface; 2 new i18n keys ×7 locales. |
| composer-expand | Expand / collapse (maximize) toggle for the chat composer | Claude/ChatGPT/Codex desktop composer maximize | frontend-only | pr-open | [#48](https://github.com/modelstudioai/openwork/issues/48) | [#49](https://github.com/modelstudioai/openwork/pull/49) | loop/composer-expand | 2026-07-03 | Opened by a prior run. Adds `isComposerExpanded` toggle in `FreeFormInput`; 2 new i18n keys. Awaiting review. |
| scroll-to-bottom | "Jump to latest" (scroll-to-bottom) button in the chat transcript | Claude Code / ChatGPT / Codex desktop | frontend-only | pr-open | [#46](https://github.com/modelstudioai/openwork/issues/46) | [#47](https://github.com/modelstudioai/openwork/pull/47) | loop/scroll-to-bottom | 2026-07-02 | Opened by a prior run. Floating jump button in `ChatDisplay` + `seed()` harness hook. Awaiting review. |
| thinking-level-picker | Thinking-level (reasoning effort) picker in the chat composer | Claude Code Desktop effort menu (⌘⇧E) + OpenWork's own model picker | frontend-only | merged | [#44](https://github.com/modelstudioai/openwork/issues/44) | [#45](https://github.com/modelstudioai/openwork/pull/45) | loop/thinking-level-picker | 2026-07-03 | **Merged** into `main` (2026-07-02). `thinkingLevel`/`onThinkingLevelChange` already plumbed to `FreeFormInput`; only the UI trigger was missing. Reuses `thinking.*` + `settings.ai.thinking` i18n keys (zero new keys). |
| command-palette | Global command palette (⌘K/Ctrl+K) to search & run any action | Claude Code Desktop ⌘K / VS Code & Codex ⌘⇧P / Linear ⌘K | frontend-only | merged | [#41](https://github.com/modelstudioai/openwork/issues/41) | [#42](https://github.com/modelstudioai/openwork/pull/42) | loop/command-palette | 2026-07-02 | Merged into `main`. Reuses action registry `execute()` + cmdk primitives; zero new i18n keys. CDP e2e 2/2 pass. typecheck/test +0 vs main. |
| settings-search | Searchable/filterable settings navigation | Claude Code Desktop / VS Code / Codex desktop settings search | frontend-only | merged | [#39](https://github.com/modelstudioai/openwork/issues/39) | [#40](https://github.com/modelstudioai/openwork/pull/40) | loop/settings-search | 2026-07-01 | Merged into `main`. Filters `SettingsNavigator` by title+description; reuses `common.search`/`common.noResultsFound` (no new locale keys). Also hardened `e2e/app.ts` teardown (per-launch profile dir + setsid process-group kill) so multiple CDP assertions run under headless xvfb. |
