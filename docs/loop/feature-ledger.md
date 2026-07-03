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
| composer-expand | Expand/collapse (maximize) toggle for the chat composer | Claude / ChatGPT / Codex desktop composer maximize affordance | frontend-only | in-progress | [#48](https://github.com/modelstudioai/openwork/issues/48) | — | loop/composer-expand | 2026-07-03 | Toolbar toggle (Maximize2/Minimize2) mirroring the model/thinking pickers; flips `RichTextInput` inline height between the auto-grow cap and `max(78vh, 560px)`. Two new i18n keys `chat.expandComposer`/`chat.collapseComposer` in all 7 locales (parity OK, 1544 keys). Resets on session switch. typecheck:all zero-delta (11 pre-existing); `bun test` zero-delta (identical 56-fail set); renderer build ✅. CDP assertion `composer-expand.assert.ts` written (measures real height growth + aria-pressed round-trip) & transpiles; **run blocked by sandbox egress** (Electron binary + `libsignal` 403), same as prior rounds. |
| jump-to-latest | "Jump to latest" (scroll-to-bottom) button in the chat transcript | Claude Code Desktop / ChatGPT / Codex desktop scroll-to-latest control | frontend-only | pr-open | [#46](https://github.com/modelstudioai/openwork/issues/46) | [#47](https://github.com/modelstudioai/openwork/pull/47) | loop/scroll-to-bottom | 2026-07-03 | Floating down-chevron in `ChatDisplay` toggled off `distanceFromBottom > 200`; one new i18n key `chat.scrollToBottom` in all 6 locales. Adds reusable `seed(profileDirs)` harness hook. PR open awaiting review. |
| thinking-level-picker | Thinking-level (reasoning effort) picker in the chat composer | Claude Code Desktop effort menu (⌘⇧E) + OpenWork's own model picker | frontend-only | merged | [#44](https://github.com/modelstudioai/openwork/issues/44) | [#45](https://github.com/modelstudioai/openwork/pull/45) | loop/thinking-level-picker | 2026-07-03 | Merged into `main`. `thinkingLevel`/`onThinkingLevelChange` were already plumbed to `FreeFormInput`; only the UI trigger was missing. Reuses `thinking.*` + `settings.ai.thinking` i18n keys (zero new keys). |
| command-palette | Global command palette (⌘K/Ctrl+K) to search & run any action | Claude Code Desktop ⌘K / VS Code & Codex ⌘⇧P / Linear ⌘K | frontend-only | merged | [#41](https://github.com/modelstudioai/openwork/issues/41) | [#42](https://github.com/modelstudioai/openwork/pull/42) | loop/command-palette | 2026-07-02 | Merged into `main`. Reuses action registry `execute()` + cmdk primitives; zero new i18n keys. CDP e2e 2/2 pass. typecheck/test +0 vs main. |
| settings-search | Searchable/filterable settings navigation | Claude Code Desktop / VS Code / Codex desktop settings search | frontend-only | merged | [#39](https://github.com/modelstudioai/openwork/issues/39) | [#40](https://github.com/modelstudioai/openwork/pull/40) | loop/settings-search | 2026-07-01 | Merged into `main`. Filters `SettingsNavigator` by title+description; reuses `common.search`/`common.noResultsFound` (no new locale keys). Also hardened `e2e/app.ts` teardown (per-launch profile dir + setsid process-group kill) so multiple CDP assertions run under headless xvfb. |
