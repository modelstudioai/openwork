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
| settings-search | Searchable/filterable settings navigation | Claude Code Desktop / VS Code / Codex desktop settings search | frontend-only | in-progress | #39 | — | loop/settings-search | 2026-06-30 | Filters `SettingsNavigator` by title+description; reuses `common.search`/`common.noResultsFound` (no new locale keys). Also hardened `e2e/app.ts` teardown (per-launch profile dir + setsid process-group kill) so multiple CDP assertions run under headless xvfb. CDP assertion `e2e/assertions/settings-search.assert.ts` passes (2/2). |
